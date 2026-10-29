import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMonitoringController,
  nextState,
  formatElapsed,
  TRANSITIONS,
} from '../src/services/monitoring.js';
import {
  MONITORING_ACTIONS,
  EVENT_TYPES,
} from '../src/contracts/monitoring.mjs';
import { DEFAULT_SETTINGS } from '../src/contracts/settings.mjs';
import { createMockDetection } from '../src/services/mockDetection.mjs';

const MINUTE = 60_000;

// Fake clock, timer and window.Blinkly API.
function setup({ settings = {}, api: apiOverrides = {}, noApi = false } = {}) {
  let time = Date.parse('2026-01-01T09:00:00.000Z');
  let tickFn = null;
  const calls = [];
  const record =
    (name, result) =>
    async (...args) => {
      calls.push({ name, args });
      return typeof result === 'function' ? result(...args) : result;
    };
  const api = {
    createSession: record('createSession', ({ startedAt }) => ({
      sessionId: 7,
      startedAt,
    })),
    saveEvent: record('saveEvent', {}),
    saveMeasurements: record('saveMeasurements', {}),
    updateSession: record('updateSession', {}),
    completeSession: record('completeSession', {}),
    showNotification: record('showNotification', { supported: true, shown: true }),
    ...apiOverrides,
  };
  const warnings = [];
  const monitor = createMonitoringController({
    api: noApi ? null : api,
    settings: { ...DEFAULT_SETTINGS, ...settings },
    now: () => time,
    setInterval: (fn) => {
      tickFn = fn;
      return 1;
    },
    clearInterval: () => {
      tickFn = null;
    },
    logger: { warn: (...args) => warnings.push(args) },
  });
  // Advance the clock in one-second ticks.
  const advance = (ms) => {
    for (let elapsed = 0; elapsed < ms; elapsed += 1000) {
      time += 1000;
      tickFn?.();
    }
  };
  const frames = (ms, overrides = {}, extras) => {
    for (let elapsed = 0; elapsed < ms; elapsed += 1000) {
      time += 1000;
      monitor.recordDetection(
        createMockDetection({ source: 'real', ...overrides }),
        extras,
      );
      tickFn?.();
    }
  };
  const events = () =>
    calls.filter((c) => c.name === 'saveEvent').map((c) => c.args[1].eventType);
  async function running() {
    await monitor.start();
    monitor.cameraStarted();
  }
  return {
    monitor,
    api,
    calls,
    events,
    advance,
    frames,
    running,
    warnings,
    snap: () => monitor.getSnapshot(),
    hasTimer: () => tickFn !== null,
  };
}

test('every contract action has a transition entry', () => {
  assert.deepEqual(Object.keys(TRANSITIONS).sort(), [...MONITORING_ACTIONS].sort());
});

test('nextState follows the state machine and rejects invalid actions', () => {
  assert.equal(nextState('IDLE', 'start'), 'STARTING');
  assert.equal(nextState('STARTING', 'started'), 'MONITORING');
  assert.equal(nextState('MONITORING', 'startBreak'), 'ON_BREAK');
  assert.equal(nextState('ON_BREAK', 'completeBreak'), 'MONITORING');
  assert.equal(nextState('ERROR', 'retry'), 'STARTING');
  assert.equal(nextState('MONITORING', 'endSession'), 'COMPLETED');
  assert.throws(() => nextState('IDLE', 'startBreak'), /Cannot startBreak while IDLE/);
  assert.throws(() => nextState('IDLE', 'fly'), /Unknown monitoring action/);
});

test('formatElapsed uses mm:ss and adds hours when needed', () => {
  assert.equal(formatElapsed(0), '00:00');
  assert.equal(formatElapsed(65_000), '01:05');
  assert.equal(formatElapsed(3_725_000), '1:02:05');
});

test('start creates a session and the camera moves it to MONITORING', async () => {
  const t = setup();
  await t.monitor.start();
  assert.equal(t.snap().state, 'STARTING');
  assert.equal(t.snap().sessionId, 7);
  assert.ok(t.hasTimer());
  t.monitor.cameraStarted();
  assert.equal(t.snap().state, 'MONITORING');
  await t.monitor.flush();
  assert.deepEqual(t.events(), ['SESSION_STARTED']);
});

test('a failed createSession rejects and stays IDLE', async () => {
  const t = setup({
    api: {
      createSession: async () => {
        throw new Error('Database locked');
      },
    },
  });
  await assert.rejects(t.monitor.start(), /Database locked/);
  assert.equal(t.snap().state, 'IDLE');
});

test('works without window.Blinkly (no persistence)', async () => {
  const t = setup({ noApi: true });
  await t.running();
  t.advance(5000);
  const summary = await t.monitor.endSession();
  assert.equal(summary.sessionId, null);
  assert.equal(summary.durationSeconds, 5);
});

test('session time counts active monitoring only', async () => {
  const t = setup({ settings: { breakDurationMinutes: 1 } });
  await t.monitor.start();
  t.advance(3000); // camera starting: not counted
  t.monitor.cameraStarted();
  t.advance(10_000);
  assert.equal(t.snap().elapsedLabel, '00:10');
  t.monitor.startBreak();
  t.advance(20_000);
  assert.equal(t.snap().elapsedLabel, '00:10');
  t.monitor.completeBreak();
  t.advance(5000);
  assert.equal(t.snap().elapsedLabel, '00:15');
});

test('break reminder fires after the interval, and Not now restarts it', async () => {
  const t = setup({ settings: { reminderIntervalMinutes: 1 } });
  await t.running();
  t.advance(59_000);
  assert.equal(t.snap().alert, null);
  t.advance(1000);
  assert.equal(t.snap().alert.type, 'BREAK_REMINDER');
  t.monitor.dismissAlert();
  t.advance(59_000);
  assert.equal(t.snap().alert, null);
  t.advance(1000);
  assert.equal(t.snap().alert.type, 'BREAK_REMINDER');
});

test('snooze postpones the reminder by the snooze duration', async () => {
  const t = setup({
    settings: { reminderIntervalMinutes: 1, snoozeDurationMinutes: 2 },
  });
  await t.running();
  t.advance(MINUTE);
  t.monitor.snooze();
  assert.equal(t.snap().state, 'MONITORING');
  assert.ok(t.snap().snoozedUntil);
  t.advance(2 * MINUTE - 1000);
  assert.equal(t.snap().alert, null);
  t.advance(1000);
  assert.equal(t.snap().alert.type, 'BREAK_REMINDER');
  await t.monitor.flush();
  const snoozed = t.calls.find(
    (c) => c.name === 'saveEvent' && c.args[1].eventType === 'ALERT_SNOOZED',
  );
  assert.deepEqual(snoozed.args[1].details, {
    alertType: 'BREAK_REMINDER',
    snoozeMinutes: 2,
  });
});

test('break from a reminder records the trigger, counts and completes', async () => {
  const t = setup({
    settings: { reminderIntervalMinutes: 1, breakDurationMinutes: 1 },
  });
  await t.running();
  t.advance(MINUTE);
  t.monitor.startBreak();
  const snap = t.snap();
  assert.equal(snap.state, 'ON_BREAK');
  assert.equal(snap.alert, null);
  assert.equal(snap.breakStatus.remainingMs, MINUTE);
  assert.equal(snap.totals.breaksTaken, 1);
  t.advance(MINUTE);
  assert.equal(t.snap().breakStatus.remainingMs, 0);
  assert.equal(t.snap().breakStatus.finished, true);
  t.monitor.completeBreak();
  assert.equal(t.snap().state, 'MONITORING');
  assert.equal(t.snap().breakStatus, null);
  await t.monitor.flush();
  const started = t.calls.find((c) => c.args[1]?.eventType === 'BREAK_STARTED');
  assert.equal(started.args[1].details.trigger, 'reminder');
  const completed = t.calls.find((c) => c.args[1]?.eventType === 'BREAK_COMPLETED');
  assert.deepEqual(completed.args[1].details, {
    plannedMinutes: 1,
    actualSeconds: 60,
    completedEarly: false,
  });
  assert.ok(
    t.calls.some((c) => c.name === 'updateSession' && c.args[1].breaksTaken === 1),
  );
});

test('ending a break early is recorded as early', async () => {
  const t = setup();
  await t.running();
  t.monitor.startBreak();
  t.advance(10_000);
  t.monitor.completeBreak();
  await t.monitor.flush();
  const completed = t.calls.find((c) => c.args[1]?.eventType === 'BREAK_COMPLETED');
  assert.equal(completed.args[1].details.completedEarly, true);
});

test('low blink rate alerts only after it persists, then cools down', async () => {
  const t = setup();
  await t.running();
  t.frames(29_000, { blinkRate: 5 });
  assert.equal(t.snap().alert, null);
  t.frames(2000, { blinkRate: 5 });
  assert.equal(t.snap().alert.type, 'LOW_BLINK_RATE');
  assert.match(t.snap().alert.message, /5 blinks per minute/);
  t.monitor.dismissAlert();
  t.frames(60_000, { blinkRate: 5 });
  assert.equal(t.snap().alert, null);
  await t.monitor.flush();
  assert.equal(t.events().filter((e) => e === 'BLINK_ALERT').length, 1);
});

test('a normal or missing blink rate never alerts', async () => {
  const t = setup();
  await t.running();
  t.frames(40_000, { blinkRate: 15 });
  t.frames(40_000, { blinkRate: null });
  assert.equal(t.snap().alert, null);
});

test('too close alerts after 10 seconds', async () => {
  const t = setup();
  await t.running();
  t.frames(11_000, { relativeDistanceStatus: 'TOO_CLOSE', viewingDistanceCm: 32 });
  assert.equal(t.snap().alert.type, 'TOO_CLOSE');
  assert.match(t.snap().alert.message, /32 cm/);
});

test('each rubbing event is recorded once; pop-ups respect the cooldown', async () => {
  const t = setup();
  await t.running();
  const rub = (id) => ({ possibleEyeRubbing: true, rubbingEventId: id });
  t.frames(3000, rub('rub-1'));
  assert.equal(t.snap().alert.type, 'EYE_RUBBING');
  assert.equal(t.snap().totals.rubbingEvents, 1);
  t.monitor.dismissAlert();
  t.frames(1000, rub('rub-2'));
  assert.equal(t.snap().alert, null);
  assert.equal(t.snap().totals.rubbingEvents, 2);
  await t.monitor.flush();
  const rubs = t.calls.filter((c) => c.args[1]?.eventType === 'POSSIBLE_EYE_RUBBING');
  assert.deepEqual(
    rubs.map((c) => c.args[1].details),
    [
      { rubbingEventId: 'rub-1', alerted: true },
      { rubbingEventId: 'rub-2', alerted: false },
    ],
  );
});

test('disabled hand tracking ignores rubbing; disabled face tracking ignores blink alerts', async () => {
  const t = setup({ settings: { handTrackingEnabled: false, faceTrackingEnabled: false } });
  await t.running();
  t.frames(40_000, { blinkRate: 3, possibleEyeRubbing: true, rubbingEventId: 'r' });
  assert.equal(t.snap().alert, null);
  assert.equal(t.snap().totals.rubbingEvents, 0);
});

test('snooze silences other alerts but still records events', async () => {
  const t = setup({ settings: { snoozeDurationMinutes: 5 } });
  await t.running();
  t.frames(1000, { possibleEyeRubbing: true, rubbingEventId: 'a' });
  t.monitor.snooze();
  t.frames(31_000, { blinkRate: 4 });
  assert.equal(t.snap().alert, null);
  await t.monitor.flush();
  const blink = t.calls.find((c) => c.args[1]?.eventType === 'BLINK_ALERT');
  assert.equal(blink.args[1].details.alerted, false);
});

test('brightness suggestion only when enabled and far from preferred', async () => {
  const t = setup({ settings: { brightnessEnabled: true, preferredBrightness: 60 } });
  await t.running();
  t.monitor.recordBrightness(70);
  assert.equal(t.snap().alert, null);
  t.monitor.recordBrightness(null);
  assert.equal(t.snap().alert, null);
  t.monitor.recordBrightness(90);
  assert.equal(t.snap().alert.type, 'BRIGHTNESS');
  assert.match(t.snap().alert.message, /90%.*60%/);

  const off = setup();
  await off.running();
  off.monitor.recordBrightness(100);
  assert.equal(off.snap().alert, null);
});

test('system notifications replace the pop-up, with a fallback', async () => {
  const t = setup({ settings: { notificationType: 'system' } });
  await t.running();
  t.frames(11_000, { relativeDistanceStatus: 'TOO_CLOSE', viewingDistanceCm: 30 });
  await t.monitor.flush();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(t.snap().alert, null);
  assert.equal(t.calls.filter((c) => c.name === 'showNotification').length, 1);

  const unsupported = setup({
    settings: { notificationType: 'system' },
    api: { showNotification: async () => ({ supported: false, shown: false }) },
  });
  await unsupported.running();
  unsupported.frames(11_000, { relativeDistanceStatus: 'TOO_CLOSE', viewingDistanceCm: 30 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(unsupported.snap().alert.type, 'TOO_CLOSE');
});

test('break reminders always show in the app, even with system notifications', async () => {
  const t = setup({ settings: { notificationType: 'system', reminderIntervalMinutes: 1 } });
  await t.running();
  t.advance(MINUTE);
  assert.equal(t.snap().alert.type, 'BREAK_REMINDER');
});

test('measurements are averaged and saved every 30 seconds', async () => {
  const t = setup();
  await t.running();
  t.frames(15_000, { blinkRate: 10, viewingDistanceCm: 50 });
  t.frames(15_000, { blinkRate: 14, viewingDistanceCm: 60, relativeDistanceStatus: 'OK' });
  await t.monitor.flush();
  const saved = t.calls.filter((c) => c.name === 'saveMeasurements');
  assert.equal(saved.length, 1);
  const [id, m] = saved[0].args;
  assert.equal(id, 7);
  assert.equal(m.blinkRate, 12);
  assert.equal(m.viewingDistanceCm, 55);
  assert.equal(m.trackingAvailable, true);
  assert.equal(m.relativeDistanceStatus, 'OK');
  assert.ok(t.calls.some((c) => c.name === 'updateSession' && c.args[1].durationSeconds === 30));
});

test('camera error moves to ERROR; retry returns to STARTING', async () => {
  const t = setup();
  await t.running();
  t.monitor.cameraFailed('Camera permission was denied.');
  assert.equal(t.snap().state, 'ERROR');
  assert.equal(t.snap().error, 'Camera permission was denied.');
  t.monitor.retry();
  assert.equal(t.snap().state, 'STARTING');
  assert.equal(t.snap().error, '');
  t.monitor.cameraStarted();
  assert.equal(t.snap().state, 'MONITORING');
});

test('pause and resume save events and freeze the timer', async () => {
  const t = setup();
  await t.running();
  t.advance(5000);
  t.monitor.pause();
  t.advance(5000);
  assert.equal(t.snap().elapsedLabel, '00:05');
  t.monitor.resume();
  await t.monitor.flush();
  assert.deepEqual(t.events(), ['SESSION_STARTED', 'SESSION_PAUSED', 'SESSION_RESUMED']);
});

test('endSession completes the session with a summary', async () => {
  const t = setup();
  await t.running();
  t.frames(10_000, { blinkRate: 12, viewingDistanceCm: 60 }, { newBlinks: 1 });
  const summary = await t.monitor.endSession();
  assert.equal(t.snap().state, 'COMPLETED');
  assert.equal(t.hasTimer(), false);
  assert.equal(summary.durationSeconds, 10);
  assert.equal(summary.totalBlinks, 10);
  assert.equal(summary.averageBlinkRate, 12);
  assert.equal(summary.averageViewingDistanceCm, 60);
  assert.deepEqual(t.snap().lastSummary, summary);
  const complete = t.calls.find((c) => c.name === 'completeSession');
  assert.equal(complete.args[0], 7);
  assert.equal(complete.args[1].durationSeconds, 10);
  assert.equal(t.events().at(-1), 'SESSION_ENDED');
  // completeSession runs after the final event.
  assert.equal(t.calls.at(-1).name, 'completeSession');
});

test('every saved event type exists in the shared contract', async () => {
  const t = setup({ settings: { reminderIntervalMinutes: 1, brightnessEnabled: true } });
  await t.running();
  t.frames(31_000, { blinkRate: 4, possibleEyeRubbing: true, rubbingEventId: 'x' });
  t.monitor.recordBrightness(10);
  t.monitor.snooze();
  t.monitor.pause();
  t.monitor.resume();
  t.monitor.startBreak();
  t.monitor.completeBreak();
  await t.monitor.endSession();
  for (const type of t.events()) assert.ok(EVENT_TYPES.includes(type), type);
});

test('save failures show a warning without stopping monitoring', async () => {
  const t = setup({
    api: {
      saveEvent: async () => {
        throw new Error('disk full');
      },
    },
  });
  await t.running();
  await t.monitor.flush();
  assert.equal(t.snap().state, 'MONITORING');
  assert.match(t.snap().warning, /could not be saved/);
  assert.equal(t.warnings.length, 1);
});

test('detections are ignored unless monitoring', async () => {
  const t = setup();
  t.monitor.recordDetection(createMockDetection({ blinkRate: 1 }), { newBlinks: 3 });
  assert.equal(t.snap().totals.blinks, 0);
});
