
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  loadSettings,
  saveSettings,
} from '../../src/services/settings.js';

import {
  DEFAULT_SETTINGS,
} from '../../src/contracts/settings.mjs';

afterEach(() => {
  delete globalThis.window;
});

// Test 1: Loading settings
test('loads saved settings from Electron', async () => {
  globalThis.window = {
    Blinkly: {
      getSettings: async () => ({
        ...DEFAULT_SETTINGS,
        breakDurationMinutes: 10,
      }),
      saveSettings: async (settings) => settings,
    },
  };

  const settings = await loadSettings();

  assert.equal(settings.breakDurationMinutes, 10);
});

// Test 2: Saving valid settings
test('saves valid settings through Electron', async () => {
  let savedData;

  globalThis.window = {
    Blinkly: {
      getSettings: async () => DEFAULT_SETTINGS,
      saveSettings: async (settings) => {
        savedData = settings;
        return settings;
      },
    },
  };

  const result = await saveSettings({
    ...DEFAULT_SETTINGS,
    breakDurationMinutes: 15,
  });

  assert.equal(savedData.breakDurationMinutes, 15);
  assert.equal(result.breakDurationMinutes, 15);
});

// Test 3: Reject invalid duration
test('rejects invalid break duration', async () => {
  globalThis.window = {
    Blinkly: {
      getSettings: async () => DEFAULT_SETTINGS,
      saveSettings: async (settings) => settings,
    },
  };

  await assert.rejects(
    saveSettings({
      ...DEFAULT_SETTINGS,
      breakDurationMinutes: 200,
    }),
    /breakDurationMinutes must be 1-120 minutes/,
  );
});

// Test 4: Handle missing Electron API
test('reports unavailable settings storage', async () => {
  globalThis.window = {};

  await assert.rejects(
    loadSettings(),
    /Settings storage is unavailable/,
  );
});

// Test 5: Handle failed database save
test('propagates database save errors', async () => {
  globalThis.window = {
    Blinkly: {
      getSettings: async () => DEFAULT_SETTINGS,
      saveSettings: async () => {
        throw new Error('Database save failed');
      },
    },
  };

  await assert.rejects(
    saveSettings(DEFAULT_SETTINGS),
    /Database save failed/,
  );
});
