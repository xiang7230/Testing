/**
 * Dev 5 — Monitoring, alerts and breaks.
 *
 * Owns the monitoring state machine, session timer, alert rules,
 * cooldowns, snooze, breaks and session persistence through window.Blinkly.
 * React subscribes to snapshots; it never changes the state directly.
 *
 * Alerts are awareness prompts, not a medical diagnosis.
 */
import {
  MONITORING_ACTIONS,
  MONITORING_STATES,
} from '../contracts/monitoring.mjs';
import { DEFAULT_SETTINGS } from '../contracts/settings.mjs';

const MINUTE = 60_000;

// Allowed transitions: action -> { fromState: toState }.
export const TRANSITIONS = Object.freeze({
  start: { IDLE: 'STARTING', COMPLETED: 'STARTING' },
  started: { STARTING: 'MONITORING' },
  pause: { MONITORING: 'PAUSED' },
  resume: { PAUSED: 'MONITORING' },
  startBreak: { MONITORING: 'ON_BREAK', PAUSED: 'ON_BREAK' },
  completeBreak: { ON_BREAK: 'MONITORING' },
  snooze: { MONITORING: 'MONITORING', PAUSED: 'PAUSED' },
  endSession: {
    STARTING: 'COMPLETED',
    MONITORING: 'COMPLETED',
    PAUSED: 'COMPLETED',
    ON_BREAK: 'COMPLETED',
    ERROR: 'COMPLETED',
  },
  cameraError: { STARTING: 'ERROR', MONITORING: 'ERROR' },
  retry: { ERROR: 'STARTING' },
});

export function nextState(state, action) {
  if (!MONITORING_ACTIONS.includes(action))
    throw new Error(`Unknown monitoring action: ${action}`);
  if (!MONITORING_STATES.includes(state))
    throw new Error(`Unknown monitoring state: ${state}`);
  const next = TRANSITIONS[action][state];
  if (!next) throw new Error(`Cannot ${action} while ${state}.`);
  return next;
}

// Thresholds are provisional and should be tuned during user testing.
export const ALERT_RULES = Object.freeze({
  BREAK_REMINDER: { eventType: null, cooldownMs: 0 },
  LOW_BLINK_RATE: {
    eventType: 'BLINK_ALERT',
    thresholdPerMinute: 10,
    holdMs: 30_000,
    cooldownMs: 5 * MINUTE,
  },
  EYE_RUBBING: { eventType: 'POSSIBLE_EYE_RUBBING', cooldownMs: 2 * MINUTE },
  TOO_CLOSE: {
    eventType: 'DISTANCE_WARNING',
    holdMs: 10_000,
    cooldownMs: 3 * MINUTE,
  },
  BRIGHTNESS: {
    eventType: 'BRIGHTNESS_SUGGESTED',
    differencePercent: 15,
    cooldownMs: 15 * MINUTE,
  },
});

export const TICK_MS = 1000;
export const MEASUREMENT_INTERVAL_MS = 30_000;

export function formatElapsed(ms) {
  const total = Math.max(0, Math.floor((ms ?? 0) / 1000));
  const pad = (value) => String(value).padStart(2, '0');
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total / 60) % 60;
  const clock = `${pad(minutes)}:${pad(total % 60)}`;
  return hours > 0 ? `${hours}:${clock}` : clock;
}

function alertCopy(type, values, settings) {
  switch (type) {
    case 'BREAK_REMINDER':
      return {
        title: 'Time for an eye break',
        message: `You have been at the screen for ${settings.reminderIntervalMinutes} minutes. Rest your eyes for ${settings.breakDurationMinutes} minutes and look at something about 6 metres (20 feet) away.`,
      };
    case 'LOW_BLINK_RATE':
      return {
        title: 'Remember to blink',
        message: `Your blink rate is about ${Math.round(values.blinkRate)} blinks per minute, which is lower than usual. Try blinking fully a few times.`,
      };
    case 'EYE_RUBBING':
      return {
        title: 'Try not to rub your eyes',
        message:
          'Blinkly noticed possible eye rubbing. Rubbing can irritate your eyes. If they feel dry or tired, consider a short break.',
      };
    case 'TOO_CLOSE':
      return {
        title: 'You may be too close to the screen',
        message: `Your estimated viewing distance is about ${values.viewingDistanceCm} cm. Try sitting back to about an arm’s length.`,
      };
    case 'BRIGHTNESS':
      return {
        title: 'Check your screen brightness',
        message: `Your screen is at ${values.brightness}%, but your preferred brightness is ${settings.preferredBrightness}%. Consider adjusting it.`,
      };
    default:
      throw new Error(`Unknown alert type: ${type}`);
  }
}

function emptyWindow() {
  return {
    frames: 0,
    trackedFrames: 0,
    blinkRateSum: 0,
    blinkRateCount: 0,
    distanceSum: 0,
    distanceCount: 0,
    source: 'real',
    lastDistanceStatus: 'UNKNOWN',
  };
}

function average(sum, count, digits = 1) {
  if (count === 0) return null;
  const factor = 10 ** digits;
  return Math.round((sum / count) * factor) / factor;
}

/**
 * api: window.Blinkly (or a fake). null runs without persistence.
 * now / setInterval / clearInterval are injectable for tests.
 */
export function createMonitoringController({
  api = globalThis.window?.Blinkly ?? null,
  settings: initialSettings = DEFAULT_SETTINGS,
  now = () => Date.now(),
  setInterval: startTimer = (fn, ms) => globalThis.setInterval(fn, ms),
  clearInterval: stopTimer = (id) => globalThis.clearInterval(id),
  logger = console,
} = {}) {
  let settings = { ...DEFAULT_SETTINGS, ...initialSettings };
  let state = 'IDLE';
  const listeners = new Set();
  let snapshot;
  let timer = null;
  let writes = Promise.resolve();
  let nextAlertId = 1;
  let session;

  function newSession() {
    return {
      sessionId: null,
      startedAt: null,
      activeMs: 0,
      lastAccrueAt: null,
      breaksTaken: 0,
      break: null,
      reminderBaseMs: 0,
      reminderSnoozedUntilMs: null,
      snoozedUntil: null,
      alert: null,
      error: '',
      warning: '',
      lowBlinkSince: null,
      tooCloseSince: null,
      lastRaisedAt: {},
      alertCounts: {},
      rubbingIds: new Set(),
      totalBlinks: 0,
      blinkRateSum: 0,
      blinkRateCount: 0,
      distanceSum: 0,
      distanceCount: 0,
      window: emptyWindow(),
      windowStartedAt: null,
    };
  }
  session = newSession();
  let lastSummary = null;

  // ---------- snapshots ----------

  function buildSnapshot() {
    const n = now();
    const breakStatus = session.break && {
      durationMs: session.break.durationMs,
      remainingMs: Math.max(
        0,
        session.break.startedAt + session.break.durationMs - n,
      ),
      finished: session.break.finished,
    };
    return Object.freeze({
      state,
      sessionId: session.sessionId,
      elapsedMs: session.activeMs,
      elapsedLabel: formatElapsed(session.activeMs),
      error: session.error,
      warning: session.warning,
      alert: session.alert,
      breakStatus: state === 'ON_BREAK' ? breakStatus : null,
      snoozedUntil:
        session.snoozedUntil !== null && session.snoozedUntil > n
          ? session.snoozedUntil
          : null,
      totals: Object.freeze({
        blinks: session.totalBlinks,
        rubbingEvents: session.rubbingIds.size,
        breaksTaken: session.breaksTaken,
      }),
      lastSummary,
    });
  }

  function emit() {
    snapshot = buildSnapshot();
    for (const listener of listeners) listener(snapshot);
  }
  snapshot = buildSnapshot();

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  // ---------- persistence ----------

  // Writes run in order; a failure is reported but never stops monitoring.
  function persist(label, task) {
    const id = session.sessionId;
    if (!api || id === null) return;
    const owner = session;
    writes = writes
      .then(() => task(id))
      .catch((error) => {
        logger.warn?.(`Blinkly could not save ${label}:`, error);
        if (owner === session) {
          session.warning = 'Some session data could not be saved.';
          emit();
        }
      });
  }

  function saveEvent(eventType, details = null) {
    const occurredAt = new Date(now()).toISOString();
    persist(`event ${eventType}`, (id) =>
      api.saveEvent(id, { eventType, occurredAt, details }),
    );
  }

  function flushMeasurements() {
    const w = session.window;
    session.window = emptyWindow();
    session.windowStartedAt = now();
    if (w.frames === 0) return;
    const measurement = {
      recordedAt: new Date(now()).toISOString(),
      blinkRate: average(w.blinkRateSum, w.blinkRateCount),
      viewingDistanceCm: average(w.distanceSum, w.distanceCount),
      trackingAvailable: w.trackedFrames > 0,
      // Not stored by database.js yet; included for Dev 6.
      source: w.source,
      relativeDistanceStatus: w.lastDistanceStatus,
    };
    persist('measurements', (id) => api.saveMeasurements(id, measurement));
    const changes = {
      durationSeconds: Math.floor(session.activeMs / 1000),
      breaksTaken: session.breaksTaken,
    };
    persist('session progress', (id) => api.updateSession(id, changes));
  }

  // ---------- timing ----------

  // Session time counts active monitoring only; it freezes while paused or on break.
  function accrue() {
    const n = now();
    if (state === 'MONITORING' && session.lastAccrueAt !== null)
      session.activeMs += Math.max(0, n - session.lastAccrueAt);
    session.lastAccrueAt = n;
  }

  function startTicking() {
    if (timer === null) timer = startTimer(tick, TICK_MS);
  }

  function stopTicking() {
    if (timer !== null) stopTimer(timer);
    timer = null;
  }

  function reminderDueMs() {
    return (
      session.reminderSnoozedUntilMs ??
      session.reminderBaseMs + settings.reminderIntervalMinutes * MINUTE
    );
  }

  function tick() {
    accrue();
    const n = now();
    if (state === 'MONITORING') {
      const snoozed = session.snoozedUntil !== null && n < session.snoozedUntil;
      if (session.activeMs >= reminderDueMs() && !session.alert && !snoozed)
        showAlert('BREAK_REMINDER', {});
      if (n - session.windowStartedAt >= MEASUREMENT_INTERVAL_MS)
        flushMeasurements();
    }
    if (state === 'ON_BREAK' && session.break && !session.break.finished) {
      if (n >= session.break.startedAt + session.break.durationMs) {
        session.break.finished = true;
        notify({
          title: 'Break complete',
          body: 'Your eye break is over. Resume monitoring when you are ready.',
        });
      }
    }
    emit();
  }

  // ---------- alerts ----------

  function notify({ title, body }) {
    if (settings.notificationType !== 'system' || !api?.showNotification)
      return Promise.resolve(false);
    return Promise.resolve()
      .then(() => api.showNotification({ title, body }))
      .then((result) => Boolean(result?.shown))
      .catch((error) => {
        logger.warn?.('Blinkly could not show a notification:', error);
        return false;
      });
  }

  function showAlert(type, values) {
    const copy = alertCopy(type, values, settings);
    const alert = Object.freeze({
      id: nextAlertId++,
      type,
      ...copy,
    });
    session.alertCounts[type] = (session.alertCounts[type] ?? 0) + 1;
    // The break reminder needs a choice, so it is always shown in the app.
    if (type === 'BREAK_REMINDER') {
      session.alert = alert;
      notify({ title: copy.title, body: copy.message });
      return;
    }
    if (settings.notificationType !== 'system') {
      session.alert = alert;
      return;
    }
    const owner = session;
    notify({ title: copy.title, body: copy.message }).then((shown) => {
      // Fall back to the in-app pop-up when the OS cannot show it.
      if (!shown && owner === session && state === 'MONITORING' && !session.alert) {
        session.alert = alert;
        emit();
      }
    });
  }

  function cooledDown(type, n) {
    return n - (session.lastRaisedAt[type] ?? -Infinity) >= ALERT_RULES[type].cooldownMs;
  }

  // Always records the event; pops up only after cooldown and outside snooze.
  function raise(type, values, details) {
    const n = now();
    const popup =
      cooledDown(type, n) &&
      !session.alert &&
      !(session.snoozedUntil !== null && n < session.snoozedUntil);
    session.lastRaisedAt[type] = n;
    saveEvent(ALERT_RULES[type].eventType, { ...details, alerted: popup });
    if (popup) showAlert(type, values);
  }

  function checkHeld(sinceKey, condition, type, values, details) {
    const n = now();
    if (!condition) {
      session[sinceKey] = null;
      return;
    }
    session[sinceKey] ??= n;
    if (n - session[sinceKey] >= ALERT_RULES[type].holdMs && cooledDown(type, n)) {
      session[sinceKey] = null;
      raise(type, values, details);
    }
  }

  // ---------- inputs from detection services ----------

  /**
   * Called for each validated detection result (Dev 3/4 contract).
   * extras.newBlinks: blinks counted since the previous frame.
   */
  function recordDetection(detection, { newBlinks = 0 } = {}) {
    if (state !== 'MONITORING' || !detection) return;
    accrue();
    const w = session.window;
    w.frames += 1;
    w.source = detection.source;
    w.lastDistanceStatus = detection.relativeDistanceStatus;
    if (detection.trackingAvailable) w.trackedFrames += 1;
    if (Number.isFinite(detection.blinkRate)) {
      w.blinkRateSum += detection.blinkRate;
      w.blinkRateCount += 1;
      session.blinkRateSum += detection.blinkRate;
      session.blinkRateCount += 1;
    }
    if (Number.isFinite(detection.viewingDistanceCm)) {
      w.distanceSum += detection.viewingDistanceCm;
      w.distanceCount += 1;
      session.distanceSum += detection.viewingDistanceCm;
      session.distanceCount += 1;
    }

    const alertBefore = session.alert;
    const blinksBefore = session.totalBlinks;
    const rubsBefore = session.rubbingIds.size;
    if (Number.isFinite(newBlinks) && newBlinks > 0) session.totalBlinks += newBlinks;

    const faceOn = settings.faceTrackingEnabled && detection.faceDetected;

    const blinkRule = ALERT_RULES.LOW_BLINK_RATE;
    checkHeld(
      'lowBlinkSince',
      faceOn &&
        Number.isFinite(detection.blinkRate) &&
        detection.blinkRate < blinkRule.thresholdPerMinute,
      'LOW_BLINK_RATE',
      { blinkRate: detection.blinkRate },
      { blinkRate: detection.blinkRate },
    );

    checkHeld(
      'tooCloseSince',
      faceOn && detection.relativeDistanceStatus === 'TOO_CLOSE',
      'TOO_CLOSE',
      { viewingDistanceCm: detection.viewingDistanceCm },
      { viewingDistanceCm: detection.viewingDistanceCm },
    );

    if (
      faceOn &&
      settings.handTrackingEnabled &&
      detection.possibleEyeRubbing &&
      detection.rubbingEventId &&
      !session.rubbingIds.has(detection.rubbingEventId)
    ) {
      session.rubbingIds.add(detection.rubbingEventId);
      raise('EYE_RUBBING', {}, { rubbingEventId: detection.rubbingEventId });
    }

    // Avoid re-rendering the whole app for every frame.
    if (
      session.alert !== alertBefore ||
      session.totalBlinks !== blinksBefore ||
      session.rubbingIds.size !== rubsBefore
    )
      emit();
  }

  // value: current brightness percentage, or null when unavailable.
  function recordBrightness(value) {
    if (state !== 'MONITORING' || !settings.brightnessEnabled) return;
    if (!Number.isFinite(value)) return;
    const rule = ALERT_RULES.BRIGHTNESS;
    const difference = Math.abs(value - settings.preferredBrightness);
    if (difference < rule.differencePercent || !cooledDown('BRIGHTNESS', now())) return;
    raise(
      'BRIGHTNESS',
      { brightness: value },
      { currentBrightness: value, preferredBrightness: settings.preferredBrightness },
    );
    emit();
  }

  // ---------- actions ----------

  function transition(action) {
    accrue();
    state = nextState(state, action);
    session.lastAccrueAt = now();
  }

  async function start() {
    nextState(state, 'start');
    const startedAt = new Date(now()).toISOString();
    let created = null;
    if (api?.createSession) created = await api.createSession({ startedAt });
    // Another action may have run while the session was being created.
    nextState(state, 'start');
    session = newSession();
    lastSummary = null;
    session.sessionId = created?.sessionId ?? null;
    session.startedAt = created?.startedAt ?? startedAt;
    session.windowStartedAt = now();
    transition('start');
    saveEvent('SESSION_STARTED', null);
    startTicking();
    emit();
  }

  // The camera and AI models are ready.
  function cameraStarted() {
    if (state !== 'STARTING') return;
    transition('started');
    session.error = '';
    session.windowStartedAt = now();
    emit();
  }

  function cameraFailed(message) {
    if (!TRANSITIONS.cameraError[state]) return;
    flushMeasurements();
    transition('cameraError');
    session.alert = null;
    session.error = message || 'Monitoring stopped because the camera or AI tracking failed.';
    emit();
  }

  function retry() {
    transition('retry');
    session.error = '';
    emit();
  }

  function pause() {
    flushMeasurements();
    transition('pause');
    saveEvent('SESSION_PAUSED', null);
    emit();
  }

  function resume() {
    transition('resume');
    session.windowStartedAt = now();
    saveEvent('SESSION_RESUMED', null);
    emit();
  }

  function startBreak(trigger = 'manual') {
    nextState(state, 'startBreak');
    flushMeasurements();
    const fromReminder = session.alert?.type === 'BREAK_REMINDER';
    transition('startBreak');
    session.alert = null;
    session.lowBlinkSince = null;
    session.tooCloseSince = null;
    session.breaksTaken += 1;
    session.break = {
      startedAt: now(),
      durationMs: settings.breakDurationMinutes * MINUTE,
      finished: false,
    };
    saveEvent('BREAK_STARTED', {
      trigger: fromReminder ? 'reminder' : trigger,
      plannedMinutes: settings.breakDurationMinutes,
    });
    const changes = { breaksTaken: session.breaksTaken };
    persist('break count', (id) => api.updateSession(id, changes));
    emit();
  }

  function completeBreak() {
    nextState(state, 'completeBreak');
    const b = session.break;
    const actualSeconds = Math.round((now() - b.startedAt) / 1000);
    transition('completeBreak');
    saveEvent('BREAK_COMPLETED', {
      plannedMinutes: Math.round(b.durationMs / MINUTE),
      actualSeconds,
      completedEarly: !b.finished,
    });
    session.break = null;
    session.reminderBaseMs = session.activeMs;
    session.reminderSnoozedUntilMs = null;
    session.windowStartedAt = now();
    emit();
  }

  function snooze() {
    const alert = session.alert;
    transition('snooze');
    const snoozeMs = settings.snoozeDurationMinutes * MINUTE;
    session.snoozedUntil = now() + snoozeMs;
    if (alert?.type === 'BREAK_REMINDER')
      session.reminderSnoozedUntilMs = session.activeMs + snoozeMs;
    session.alert = null;
    saveEvent('ALERT_SNOOZED', {
      alertType: alert?.type ?? null,
      snoozeMinutes: settings.snoozeDurationMinutes,
    });
    emit();
  }

  function dismissAlert() {
    const alert = session.alert;
    if (!alert) return;
    if (alert.type === 'BREAK_REMINDER') {
      session.reminderBaseMs = session.activeMs;
      session.reminderSnoozedUntilMs = null;
    }
    session.alert = null;
    emit();
  }

  async function endSession() {
    nextState(state, 'endSession');
    if (state === 'MONITORING') flushMeasurements();
    transition('endSession');
    stopTicking();
    session.alert = null;
    session.break = null;
    const endedAt = new Date(now()).toISOString();
    const summary = Object.freeze({
      sessionId: session.sessionId,
      startedAt: session.startedAt,
      endedAt,
      durationSeconds: Math.floor(session.activeMs / 1000),
      breaksTaken: session.breaksTaken,
      totalBlinks: session.totalBlinks,
      averageBlinkRate: average(session.blinkRateSum, session.blinkRateCount),
      averageViewingDistanceCm: average(session.distanceSum, session.distanceCount, 0),
      rubbingEvents: session.rubbingIds.size,
      alerts: Object.freeze({ ...session.alertCounts }),
    });
    saveEvent('SESSION_ENDED', {
      totalBlinks: summary.totalBlinks,
      averageBlinkRate: summary.averageBlinkRate,
      averageViewingDistanceCm: summary.averageViewingDistanceCm,
      rubbingEvents: summary.rubbingEvents,
      alerts: summary.alerts,
    });
    persist('session end', (id) =>
      api.completeSession(id, {
        endedAt,
        durationSeconds: summary.durationSeconds,
        breaksTaken: summary.breaksTaken,
      }),
    );
    lastSummary = summary;
    emit();
    await writes;
    return summary;
  }

  function updateSettings(next) {
    settings = { ...DEFAULT_SETTINGS, ...next };
    emit();
  }

  // Stops the timer; a later start() creates it again.
  function dispose() {
    stopTicking();
  }

  return {
    subscribe,
    getSnapshot: () => snapshot,
    getSettings: () => settings,
    start,
    cameraStarted,
    cameraFailed,
    retry,
    pause,
    resume,
    startBreak,
    completeBreak,
    snooze,
    dismissAlert,
    endSession,
    recordDetection,
    recordBrightness,
    updateSettings,
    flush: () => writes,
    dispose,
  };
}
