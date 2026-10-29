import { app } from 'electron';
import path from 'node:path';
import Database from 'better-sqlite3';
import { DEFAULT_SETTINGS, validateSettings } from '../src/contracts/settings.mjs';
import { EVENT_TYPES } from '../src/contracts/monitoring.mjs';
import { assertSessionId, isoTimestamp, nonNegativeInt } from '../src/contracts/session.mjs';

let db;
const bool = (v) => Number(v);
const toSettings = (r) => ({
  notificationType: r.notification_type,
  breakDurationMinutes: r.break_duration_minutes,
  snoozeDurationMinutes: r.snooze_duration_minutes,
  reminderIntervalMinutes: r.reminder_interval_minutes,
  brightnessEnabled: Boolean(r.brightness_enabled),
  preferredBrightness: r.preferred_brightness,
  faceTrackingEnabled: Boolean(r.face_tracking_enabled),
  handTrackingEnabled: Boolean(r.hand_tracking_enabled),
});

const toSession = (r) => r && ({
  sessionId: r.session_id, startedAt: r.started_at, endedAt: r.ended_at,
  durationSeconds: r.duration_seconds, breaksTaken: r.breaks_taken, status: r.status,
});

function connection() {
  if (!db) throw new Error('Database has not initialized');
  return db;
}

export function initializeDatabase() {
  if (db) return db;
  const dbPath = path.join(app.getPath('userData'), 'Blinkly.db');
  db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id=1),
      notification_type TEXT NOT NULL CHECK (notification_type IN ('popup','system')),
      break_duration_minutes INTEGER NOT NULL CHECK (break_duration_minutes BETWEEN 1 AND 120),
      snooze_duration_minutes INTEGER NOT NULL CHECK (snooze_duration_minutes BETWEEN 1 AND 120),
      reminder_interval_minutes INTEGER NOT NULL CHECK (reminder_interval_minutes BETWEEN 1 AND 120),
      brightness_enabled INTEGER NOT NULL CHECK (brightness_enabled IN (0,1)),
      preferred_brightness INTEGER NOT NULL CHECK (preferred_brightness BETWEEN 20 AND 90),
      face_tracking_enabled INTEGER NOT NULL CHECK (face_tracking_enabled IN (0,1)),
      hand_tracking_enabled INTEGER NOT NULL CHECK (hand_tracking_enabled IN (0,1)),
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      session_id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT NOT NULL, ended_at TEXT,
      duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
      breaks_taken INTEGER NOT NULL DEFAULT 0 CHECK (breaks_taken >= 0),
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','COMPLETED','INTERRUPTED'))
    );
    CREATE TABLE IF NOT EXISTS events (
      event_id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
      event_type TEXT NOT NULL, occurred_at TEXT NOT NULL, details_json TEXT
    );
    CREATE TABLE IF NOT EXISTS measurements (
      measurement_id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
      recorded_at TEXT NOT NULL, blink_rate REAL, viewing_distance_cm REAL,
      tracking_available INTEGER NOT NULL CHECK (tracking_available IN (0, 1)),
      source TEXT NOT NULL DEFAULT 'real' CHECK (source IN ('real', 'simulated')),
      relative_distance_status TEXT NOT NULL DEFAULT 'UNKNOWN'
        CHECK (relative_distance_status IN ('UNKNOWN','TOO_CLOSE','OK'))
    );
    CREATE INDEX IF NOT EXISTS idx_events_session_time ON events(session_id,occurred_at);
    CREATE INDEX IF NOT EXISTS idx_measurements_session_time ON measurements(session_id,recorded_at);
  `);
  db.prepare("UPDATE sessions SET status='INTERRUPTED' WHERE status='ACTIVE'").run();
  saveDefaultSettingsIfAbsent();
  return db;
}
export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

function saveDefaultSettingsIfAbsent() {
  if (!db.prepare('SELECT id FROM settings WHERE id=1').get())
    saveSettings(DEFAULT_SETTINGS);
}

export function getSettings() {
  const row = connection().prepare('SELECT * FROM settings WHERE id=1').get();
  return row ? toSettings(row) : { ...DEFAULT_SETTINGS };
}

export function saveSettings(payload) {
  const s = validateSettings(payload);
  connection().prepare(`INSERT INTO settings (
    id,notification_type,break_duration_minutes,snooze_duration_minutes,
    reminder_interval_minutes,brightness_enabled,preferred_brightness,
    face_tracking_enabled,hand_tracking_enabled,updated_at
  ) VALUES (1,@notificationType,@breakDurationMinutes,@snoozeDurationMinutes,
    @reminderIntervalMinutes,@brightnessEnabled,@preferredBrightness,
    @faceTrackingEnabled,@handTrackingEnabled,@updatedAt)
  ON CONFLICT(id) DO UPDATE SET
    notification_type=excluded.notification_type,break_duration_minutes=excluded.break_duration_minutes,
    snooze_duration_minutes=excluded.snooze_duration_minutes,reminder_interval_minutes=excluded.reminder_interval_minutes,
    brightness_enabled=excluded.brightness_enabled,preferred_brightness=excluded.preferred_brightness,
    face_tracking_enabled=excluded.face_tracking_enabled,hand_tracking_enabled=excluded.hand_tracking_enabled,
    updated_at=excluded.updated_at`).run({
    ...s, brightnessEnabled: bool(s.brightnessEnabled), faceTrackingEnabled: bool(s.faceTrackingEnabled),
    handTrackingEnabled: bool(s.handTrackingEnabled), updatedAt: new Date().toISOString(),
  });
  return getSettings();
}

function requireSession(id) {
  assertSessionId(id);
  const row = connection().prepare('SELECT * FROM sessions WHERE session_id=?').get(id);
  if (!row)
    throw new Error(`Session ${id} not found`);
  return row;
}
export function createSession(payload = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    throw new Error('session input must be an object');
  const startedAt = payload.startedAt ? isoTimestamp(payload.startedAt, 'startedAt') : new Date().toISOString();
  const result = connection().prepare('INSERT INTO sessions (started_at) VALUES (?)').run(startedAt);
  return toSession(requireSession(Number(result.lastInsertRowid)));
}
export function updateSession(id, changes) {
  const old = requireSession(id);
  if (old.status !== 'ACTIVE')
    throw new Error('Only active sessions can be updated');
  if (!changes || typeof changes !== 'object' || Array.isArray(changes))
    throw new Error('changes must be an object');
  for (const key of Object.keys(changes))
    if (!['durationSeconds', 'breaksTaken'].includes(key))
      throw new Error(`Invalid session update: ${key}`);
  if ('durationSeconds' in changes)
    nonNegativeInt(changes.durationSeconds, 'durationSeconds');
  if ('breaksTaken' in changes)
    nonNegativeInt(changes.breaksTaken, 'breaksTaken');
  const d = changes.durationSeconds ?? old.duration_seconds;
  const b = changes.breaksTaken ?? old.breaks_taken;
  connection().prepare('UPDATE sessions SET duration_seconds=?,breaks_taken=? WHERE session_id=?').run(d, b, id);
  return toSession(requireSession(id));
}

export function completeSession(id, summary = {}) {
  const old = requireSession(id);
  if (old.status !== 'ACTIVE')
    throw new Error('Session is already closed');
  if (!summary || typeof summary !== 'object' || Array.isArray(summary))
    throw new Error('summary must be an object');
  for (const key of Object.keys(summary))
    if (!['endedAt', 'durationSeconds', 'breaksTaken'].includes(key))
      throw new Error(`Invalid summary field: ${key}`);
  const endedAt = summary.endedAt ? isoTimestamp(summary.endedAt, 'endedAt') : new Date().toISOString();
  if (Date.parse(endedAt) < Date.parse(old.started_at))
    throw new Error('endedAt before startedAt');
  const duration = summary.durationSeconds ?? Math.floor((Date.parse(endedAt) - Date.parse(old.started_at)) / 1000);
  const breaks = summary.breaksTaken ?? old.breaks_taken;
  nonNegativeInt(duration, 'durationSeconds'); nonNegativeInt(breaks, 'breaksTaken');
  connection().prepare("UPDATE sessions SET ended_at=?,duration_seconds=?,breaks_taken=?,status='COMPLETED' WHERE session_id=?")
    .run(endedAt, duration, breaks, id);
  return toSession(requireSession(id));
}

export function saveEvent(id, event) {
  const session = requireSession(id);
  if (session.status !== "ACTIVE")
    throw new Error("Cannot modify a closed session");

  if (!event || typeof event !== 'object' || Array.isArray(event))
    throw new Error('event must be object');
  const type = event.eventType;
  if (!EVENT_TYPES.includes(type))
    throw new Error('Unsupported eventType');
  const time = event.occurredAt ? isoTimestamp(event.occurredAt, 'occurredAt') : new Date().toISOString();
  const metadata = event.details ?? null;
  if (metadata !== null && (typeof metadata !== 'object' || Array.isArray(metadata)))
    throw new Error('details must be object or null');
  const detailsJson = metadata ? JSON.stringify(metadata) : null;
  if (detailsJson && detailsJson.length > 4096)
    throw new Error('details too large');
  const result = connection().prepare('INSERT INTO events (session_id,event_type,occurred_at,details_json) VALUES (?,?,?,?)')
    .run(id, type, time, detailsJson);
  return { eventId: Number(result.lastInsertRowid), sessionId: id, eventType: type, occurredAt: time, details: metadata };
}

function optionalMeasurement(x, name) {
  if (x === null || x === undefined)
    return null;
  if (!Number.isFinite(x) || x < 0)
    throw new Error(`${name} must be nonnegative or null`);
  return x;
}

export function saveMeasurements(id, measurements) {
  const session = requireSession(id);
  if (session.status !== "ACTIVE") {
    throw new Error(
      "Cannot modify a closed session"
    );
  }
  if (!measurements || typeof measurements !== 'object' || Array.isArray(measurements))
    throw new Error('measurements must be object');
  const recordedAt = measurements.recordedAt ? isoTimestamp(measurements.recordedAt, 'recordedAt') : new Date().toISOString();
  if (typeof measurements.trackingAvailable !== 'boolean')
    throw new Error('trackingAvailable must be boolean');
  const blinkRate = optionalMeasurement(measurements.blinkRate, 'blinkRate');
  const viewingDistanceCm = optionalMeasurement(measurements.viewingDistanceCm, 'viewingDistanceCm');
  const result = connection().prepare('INSERT INTO measurements (session_id,recorded_at,blink_rate,viewing_distance_cm,tracking_available) VALUES (?,?,?,?,?)')
    .run(id, recordedAt, blinkRate, viewingDistanceCm, bool(measurements.trackingAvailable));
  return {
    measurementId: Number(result.lastInsertRowid),
    sessionId: id,
    recordedAt, blinkRate,
    viewingDistanceCm,
    trackingAvailable: measurements.trackingAvailable
  };
}

export function getSessions() {
  return connection().prepare('SELECT * FROM sessions ORDER BY started_at DESC,session_id DESC').all().map(toSession);
}

export function getSessionDetails(id) {
  const session = toSession(requireSession(id));
  const events = connection().prepare('SELECT * FROM events WHERE session_id=? ORDER BY occurred_at,event_id').all(id).map(r => ({
    eventId: r.event_id, sessionId: r.session_id, eventType: r.event_type, occurredAt: r.occurred_at,
    details: r.details_json ? JSON.parse(r.details_json) : null,
  }));
  const measurements = connection().prepare('SELECT * FROM measurements WHERE session_id=? ORDER BY recorded_at,measurement_id').all(id).map(r => ({
    measurementId: r.measurement_id, sessionId: r.session_id, recordedAt: r.recorded_at,
    blinkRate: r.blink_rate, viewingDistanceCm: r.viewing_distance_cm, trackingAvailable: Boolean(r.tracking_available)
  }));
  return { ...session, events, measurements };
}

export function deleteSession(id) {
  const session = requireSession(id);
  if (session.status === "ACTIVE") 
    throw new Error("End the session before deleting it");
  connection().prepare('DELETE FROM sessions WHERE session_id=?').run(id);
  return { deleted: true, sessionId: id };
}
