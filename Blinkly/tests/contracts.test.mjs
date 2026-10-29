import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, validateSettings } from '../src/contracts/settings.mjs';
import { validateDetection } from '../src/contracts/detection.mjs';
import { createMockDetection } from '../src/services/mockDetection.mjs';
import { IPC_CHANNELS } from '../src/contracts/ipc.mjs';
import { assertSessionId } from '../src/contracts/session.mjs';
test('settings defaults validate and are preserved', () => assert.deepEqual(validateSettings(DEFAULT_SETTINGS), DEFAULT_SETTINGS));
test('invalid values rejected', () => {
  assert.throws(() => validateSettings({ preferredBrightness: 110 }));
  assert.throws(() => validateSettings({ unknownFlag: true }));
});
test('mock detection is labelled simulated', () =>
  assert.equal(validateDetection(createMockDetection()).source, 'simulated'));
test('unavailable metrics use null', () =>
  assert.equal(createMockDetection({ blinkRate: null }).blinkRate, null));
test('IPC channel names unique', () =>
  assert.equal(new Set(Object.values(IPC_CHANNELS)).size, Object.keys(IPC_CHANNELS).length));
test('valid session IDs required', () => {
  assert.equal(assertSessionId(1), 1); assert.throws(() => assertSessionId(-1));
});
test("Detection rejects unknown fields", () => {
  assert.throws(() => validateDetection({ timestamp: Date.now(), blinkRtae: 12, }));
});