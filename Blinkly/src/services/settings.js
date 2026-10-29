
import {
  DEFAULT_SETTINGS,
  validateSettings,
} from '../contracts/settings.mjs';

// Retrieve the settings API exposed by Electron.
function getSettingsApi() {
  const api = window.Blinkly;

  if (
    !api ||
    typeof api.getSettings !== 'function' ||
    typeof api.saveSettings !== 'function'
  ) {
    throw new Error(
      'Settings storage is unavailable. Open Blinkly through Electron.'
    );
  }

  return api;
}

// Load previously saved preferences from SQLite.
export async function loadSettings() {
  const api = getSettingsApi();
  const settings = await api.getSettings();

  return validateSettings({
    ...DEFAULT_SETTINGS,
    ...settings,
  });
}

// Validate and persist the updated preferences.
export async function saveSettings(settings) {
  const validated = validateSettings(settings);
  const api = getSettingsApi();

  const saved = await api.saveSettings(validated);

  return validateSettings(saved);
}
