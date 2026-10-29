
import { useState } from 'react';
import { validateSettings } from '../contracts/settings.mjs';

// Dev2: Show explicit On/Off states.
function PreferenceSwitch({ checked, label, description, onChange }) {
  return (
    <div className="settings-switch-item">
      <label className="preference-switch">
        <span>{label}</span>

        <span className="switch-state" aria-hidden="true">
          {checked ? 'On' : 'Off'}
        </span>

        <input
          type="checkbox"
          checked={checked}
          onChange={(event) =>
            onChange(event.currentTarget.checked)
          }
        />

        <span className="switch-track" aria-hidden="true" />
      </label>

      {description && (
        <p className="settings-help">{description}</p>
      )}
    </div>
  );
}

export default function SettingsPanel({
  settings,
  onSave,
  onClose,
}) {
  const [draft, setDraft] = useState(settings);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [brightnessBusy, setBrightnessBusy] = useState(false);
  const [originalBrightness, setOriginalBrightness] = useState(null);
  const [brightnessMessage, setBrightnessMessage] = useState('');

  function updateSetting(name, value) {
    setDraft((current) => ({
      ...current,
      [name]: value,
    }));
    setError('');
  }

  // Original save behaviour retained.
  async function savePreferences(event) {
    event.preventDefault();
    setSaving(true);
    setError('');

    try {
      await onSave(validateSettings(draft));
      onClose();
    } catch (saveError) {
      setError(
        saveError.message || 'Could not save your preferences.',
      );
    } finally {
      setSaving(false);
    }
  }


  async function applyBrightness() {
    setBrightnessBusy(true);
    setBrightnessMessage('');

    try {
      const api = window.Blinkly;

      if (!api?.getBrightness || !api?.setBrightness) {
        throw new Error('Brightness control is unavailable.');
      }

      const current = await api.getBrightness();

      if (!current.supported) {
        throw new Error(
          current.reason || 'This display does not support brightness adjustment.'
        );
      }

      const result = await api.setBrightness(
        draft.preferredBrightness
      );

      if (!result.supported) {
        throw new Error(
          result.reason || 'Could not change brightness.'
        );
      }

      // Preserve the initial value even when Apply
      // is clicked multiple times.
      setOriginalBrightness((previous) =>
        previous ?? current.value
      );

      setBrightnessMessage(
        `Brightness changed to ${result.value}%.`
      );
    } catch (err) {
      setBrightnessMessage(err.message);
    } finally {
      setBrightnessBusy(false);
    }
  }

  async function undoBrightness() {
    if (originalBrightness === null) return;

    setBrightnessBusy(true);

    try {
      const result = await window.Blinkly.setBrightness(
        originalBrightness
      );

      if (!result.supported) {
        throw new Error(
          result.reason || 'Unable to restore brightness.'
        );
      }

      setOriginalBrightness(null);
      setBrightnessMessage('Original brightness restored.');
    } catch (err) {
      setBrightnessMessage(err.message);
    } finally {
      setBrightnessBusy(false);
    }
  }

  function keepBrightness() {
    setOriginalBrightness(null);
    setBrightnessMessage('Brightness change kept.');
  }


  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-labelledby="settings-title"
        aria-modal="true"
        className="settings-panel"
        role="dialog"
      >
        <div className="settings-panel__heading">
          <div>
            <p className="eyebrow">MAKE IT YOURS</p>
            <h2 id="settings-title">Preferences</h2>
          </div>

          <button
            aria-label="Close preferences"
            className="icon-button"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>

        <p className="settings-intro">
          Customize Blinkly to suit your study routine.
        </p>

        {/* Dev2: Separate scrollable content and fixed footer */}
        <form
          id="settings-form"
          className="settings-form"
          onSubmit={savePreferences}
        >
          <div className="settings-form__content">
            {/* Notification preferences */}
            <div className="settings-field">
              <label
                className="field-label"
                htmlFor="notification-type"
              >
                Notification style
              </label>

              <select
                id="notification-type"
                className="field-select"
                value={draft.notificationType}
                onChange={(event) =>
                  updateSetting(
                    'notificationType',
                    event.currentTarget.value,
                  )
                }
              >
                <option value="popup">Blinkly pop-up</option>
                <option value="system">System notification</option>
              </select>

              <p className="settings-help">
                Choose how Blinkly displays reminders and alerts.
              </p>
            </div>

            {/* Break and reminder preferences */}
            <div className="settings-number-grid">
              <div className="settings-field">
                <label
                  className="field-label"
                  htmlFor="break-duration"
                >
                  Break duration

                  <span className="number-input-wrap">
                    <input
                      id="break-duration"
                      max="120"
                      min="1"
                      type="number"
                      value={draft.breakDurationMinutes}
                      onChange={(event) =>
                        updateSetting(
                          'breakDurationMinutes',
                          event.currentTarget.valueAsNumber,
                        )
                      }
                    />
                    <span>min</span>
                  </span>
                </label>

                <p className="settings-help">
                  Length of each eye-rest break.
                </p>
              </div>

              <div className="settings-field">
                <label
                  className="field-label"
                  htmlFor="reminder-interval"
                >
                  Reminder interval

                  <span className="number-input-wrap">
                    <input
                      id="reminder-interval"
                      max="120"
                      min="1"
                      type="number"
                      value={draft.reminderIntervalMinutes}
                      onChange={(event) =>
                        updateSetting(
                          'reminderIntervalMinutes',
                          event.currentTarget.valueAsNumber,
                        )
                      }
                    />
                    <span>min</span>
                  </span>
                </label>

                <p className="settings-help">
                  How often Blinkly reminds you to rest.
                </p>
              </div>
            </div>

            {/* Snooze preferences */}
            <div className="settings-field">
              <label
                className="field-label"
                htmlFor="snooze-duration"
              >
                Snooze duration

                <span className="number-input-wrap">
                  <input
                    id="snooze-duration"
                    max="120"
                    min="1"
                    type="number"
                    value={draft.snoozeDurationMinutes}
                    onChange={(event) =>
                      updateSetting(
                        'snoozeDurationMinutes',
                        event.currentTarget.valueAsNumber,
                      )
                    }
                  />
                  <span>min</span>
                </span>
              </label>

              <p className="settings-help">
                How long to postpone a break reminder.
              </p>

              {draft.snoozeDurationMinutes >= 60 &&
                draft.snoozeDurationMinutes <= 120 && (
                  <p className="settings-warning">
                    This will postpone your reminder for at least
                    one hour.
                  </p>
                )}
            </div>

            {/* Tracking and brightness preferences */}
            <div className="preference-group">
              <PreferenceSwitch
                checked={draft.faceTrackingEnabled}
                label="Face & blink tracking"
                description="Use the camera for face and blink monitoring."
                onChange={(value) =>
                  updateSetting('faceTrackingEnabled', value)
                }
              />

              <PreferenceSwitch
                checked={draft.handTrackingEnabled}
                label="Hand tracking"
                description="Enable hand-related tracking."
                onChange={(value) =>
                  updateSetting('handTrackingEnabled', value)
                }
              />

              <PreferenceSwitch
                checked={draft.brightnessEnabled}
                label="Brightness suggestions"
                description="Enable brightness adjustment suggestions."
                onChange={(value) =>
                  updateSetting('brightnessEnabled', value)
                }
              />
            </div>

            {/* Only show preferred brightness when enabled */}
            {draft.brightnessEnabled && (
              <div className="settings-field">
                <label
                  className="field-label brightness-setting"
                  htmlFor="brightness"
                >
                  Preferred brightness

                  <span className="range-value">
                    {draft.preferredBrightness}%
                  </span>

                  <input
                    id="brightness"
                    max="90"
                    min="20"
                    type="range"
                    value={draft.preferredBrightness}
                    onChange={(event) =>
                      updateSetting(
                        'preferredBrightness',
                        event.currentTarget.valueAsNumber,
                      )
                    }
                  />
                </label>

                <p className="settings-help">
                  Set your preferred brightness level (20–90%).
                  Moving this slider changes your preference,
                  not the screen brightness immediately.
                </p>

                <div className="brightness-actions">
                  <button
                    type="button"
                    disabled={brightnessBusy}
                    onClick={applyBrightness}
                  >
                    Apply brightness
                  </button>

                  {originalBrightness !== null && (
                    <>
                      <button
                        type="button"
                        disabled={brightnessBusy}
                        onClick={keepBrightness}
                      >
                        Keep
                      </button>

                      <button
                        type="button"
                        disabled={brightnessBusy}
                        onClick={undoBrightness}
                      >
                        Undo
                      </button>
                    </>
                  )}
                </div>

                {brightnessMessage && (
                  <p role="status">{brightnessMessage}</p>
                )}

              </div>
            )}

            {/* Existing error handling retained */}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
          </div>

          {/* Dev2: Fixed footer outside the scrollable content */}
          <div className="settings-panel__actions">
            <button
              className="button button--quiet"
              onClick={onClose}
              type="button"
              disabled={saving}
            >
              Cancel
            </button>

            <button
              className="button button--primary"
              disabled={saving}
              type="submit"
            >
              {saving ? 'Saving…' : 'Save preferences'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
