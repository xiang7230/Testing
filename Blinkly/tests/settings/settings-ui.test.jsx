
import { describe, it, expect, vi } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import SettingsPanel from '../../src/components/SettingsPanel.jsx';
import { DEFAULT_SETTINGS } from '../../src/contracts/settings.mjs';

// Helper: Render the settings panel with mock callbacks.
function renderSettings(overrides = {}) {
  const onSave = vi.fn(async () => {});
  const onClose = vi.fn();

  render(
    <SettingsPanel
      settings={{ ...DEFAULT_SETTINGS }}
      onSave={onSave}
      onClose={onClose}
      {...overrides}
    />,
  );

  return { onSave, onClose };
}

describe('Dev2 - Settings UI', () => {

  // ST-01: Display existing preferences.
  it('ST-01 displays current settings', () => {
    renderSettings({
      settings: {
        ...DEFAULT_SETTINGS,
        breakDurationMinutes: 15,
        snoozeDurationMinutes: 20,
      },
    });

    expect(
      screen.getByRole('dialog', { name: 'Preferences' }),
    ).toBeTruthy();

    expect(screen.getByLabelText(/Break duration/i).value)
      .toBe('15');

    expect(screen.getByLabelText(/Snooze duration/i).value)
      .toBe('20');

    expect(screen.getByLabelText('Notification style').value)
      .toBe('popup');
  });

  // ST-02: Change notification preference.
  it('ST-02 saves notification style', async () => {
    const { onSave, onClose } = renderSettings();

    await userEvent.selectOptions(
      screen.getByLabelText('Notification style'),
      'system',
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Save preferences' }),
    );

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    expect(onSave.mock.calls[0][0].notificationType)
      .toBe('system');
  });

  // ST-03: Change break-related durations.
  it('ST-03 saves break, reminder and snooze durations', async () => {
    const { onSave } = renderSettings();

    fireEvent.change(screen.getByLabelText(/Break duration/i), {
      target: { value: '15' },
    });

    fireEvent.change(screen.getByLabelText(/Reminder interval/i), {
      target: { value: '45' },
    });

    fireEvent.change(screen.getByLabelText(/Snooze duration/i), {
      target: { value: '20' },
    });

    await userEvent.click(
      screen.getByRole('button', { name: 'Save preferences' }),
    );

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });

    const savedSettings = onSave.mock.calls[0][0];

    expect(savedSettings.breakDurationMinutes).toBe(15);
    expect(savedSettings.reminderIntervalMinutes).toBe(45);
    expect(savedSettings.snoozeDurationMinutes).toBe(20);
  });

  // ST-04: Cancel without saving changes.
  it('ST-04 cancel does not save changes', async () => {
    const { onSave, onClose } = renderSettings();

    fireEvent.change(screen.getByLabelText(/Break duration/i), {
      target: { value: '25' },
    });

    await userEvent.click(
      screen.getByRole('button', { name: 'Cancel' }),
    );

    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ST-05: Reject invalid break duration.
  it('ST-05 rejects invalid break duration', async () => {
    const { onSave, onClose } = renderSettings();

    fireEvent.change(screen.getByLabelText(/Break duration/i), {
      target: { value: '200' },
    });

    // Submit directly to test JavaScript validation,
    // independent of the browser's native max=120 check.
    const form = screen
      .getByRole('button', { name: 'Save preferences' })
      .closest('form');

    fireEvent.submit(form);

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'breakDurationMinutes must be 1-120 minutes',
    );

    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  // ST-06: Handle database or service failure.
  it('ST-06 displays error when saving fails', async () => {
    const onSave = vi.fn(async () => {
      throw new Error('Database save failed');
    });
    const onClose = vi.fn();

    renderSettings({ onSave, onClose });

    await userEvent.click(
      screen.getByRole('button', { name: 'Save preferences' }),
    );

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Database save failed',
    );

    expect(onClose).not.toHaveBeenCalled();

    expect(
      screen.getByRole('dialog', { name: 'Preferences' }),
    ).toBeTruthy();
  });

  // ST-07: Update switches.
  it('ST-07 saves tracking and brightness toggles', async () => {
    const { onSave } = renderSettings();

    await userEvent.click(
      screen.getByRole('checkbox', {
        name: 'Face & blink tracking',
      }),
    );

    await userEvent.click(
      screen.getByRole('checkbox', {
        name: 'Hand tracking',
      }),
    );

    await userEvent.click(
      screen.getByRole('checkbox', {
        name: 'Brightness suggestions',
      }),
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Save preferences' }),
    );

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });

    const savedSettings = onSave.mock.calls[0][0];

    expect(savedSettings.faceTrackingEnabled).toBe(false);
    expect(savedSettings.handTrackingEnabled).toBe(false);
    expect(savedSettings.brightnessEnabled).toBe(true);
  });

  // ST-08: Change brightness preference.
  it('ST-08 saves preferred brightness', async () => {
    const { onSave } = renderSettings();

    await userEvent.click(
      screen.getByRole('checkbox', {
        name: 'Brightness suggestions',
      }),
    );

    const slider = screen.getByLabelText(/Preferred brightness/i);

    fireEvent.change(slider, {
      target: { value: '75' },
    });

    expect(screen.getByText('75%')).toBeTruthy();

    await userEvent.click(
      screen.getByRole('button', { name: 'Save preferences' }),
    );

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });

    expect(onSave.mock.calls[0][0].preferredBrightness)
      .toBe(75);
  });

  // ST-09: Prevent multiple submissions during save.
  it('ST-09 disables Save while saving', async () => {
    let finishSave;

    const onSave = vi.fn(
      () => new Promise((resolve) => {
        finishSave = resolve;
      }),
    );

    const onClose = vi.fn();

    renderSettings({ onSave, onClose });

    await userEvent.click(
      screen.getByRole('button', { name: 'Save preferences' }),
    );

    const savingButton = screen.getByRole('button', {
      name: 'Saving…',
    });

    expect(savingButton.disabled).toBe(true);
    expect(onSave).toHaveBeenCalledTimes(1);

    // Complete the simulated save.
    finishSave();

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  // ST-10: Render previously saved preferences.
  it('ST-10 restores saved preferences when reopened', async () => {
    let storedSettings = { ...DEFAULT_SETTINGS };

    const onSave = vi.fn(async (nextSettings) => {
      storedSettings = { ...nextSettings };
    });

    const firstRender = render(
      <SettingsPanel
        settings={storedSettings}
        onSave={onSave}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText(/Break duration/i), {
      target: { value: '30' },
    });

    await userEvent.click(
      screen.getByRole('button', { name: 'Save preferences' }),
    );

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });

    expect(storedSettings.breakDurationMinutes).toBe(30);

    // Simulate closing and reopening the panel.
    firstRender.unmount();

    render(
      <SettingsPanel
        settings={storedSettings}
        onSave={onSave}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(/Break duration/i).value)
      .toBe('30');
  });

});
