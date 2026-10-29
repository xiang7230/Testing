import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// The real CameraPreview needs a webcam and MediaPipe; replace it with a stub.
vi.mock('../../src/components/CameraPreview.jsx', () => ({
  default: ({ onReady, onTakeBreak }) => (
    <div data-testid="camera-preview">
      <button type="button" onClick={onReady}>
        stub ready
      </button>
      <button type="button" onClick={onTakeBreak}>
        stub break
      </button>
    </div>
  ),
}));

import AlertModal from '../../src/components/AlertModal.jsx';
import BreakTimer from '../../src/components/BreakTimer.jsx';
import BlinklyApp from '../../src/components/BlinklyApp.jsx';

const reminder = {
  id: 1,
  type: 'BREAK_REMINDER',
  title: 'Time for an eye break',
  message: 'You have been at the screen for 30 minutes.',
};

describe('Dev 5 - AlertModal', () => {
  it('shows the alert and its three choices', async () => {
    const onTakeBreak = vi.fn();
    const onSnooze = vi.fn();
    const onDismiss = vi.fn();
    render(
      <AlertModal
        alert={reminder}
        snoozeMinutes={15}
        onTakeBreak={onTakeBreak}
        onSnooze={onSnooze}
        onDismiss={onDismiss}
      />,
    );
    const dialog = screen.getByRole('alertdialog', {
      name: 'Time for an eye break',
    });
    expect(dialog.textContent).toContain('30 minutes');
    await userEvent.click(screen.getByRole('button', { name: 'Take a break' }));
    await userEvent.click(screen.getByRole('button', { name: 'Snooze 15 min' }));
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(onTakeBreak).toHaveBeenCalledTimes(1);
    expect(onSnooze).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('uses "Got it" for non-reminder alerts and Escape dismisses', () => {
    const onDismiss = vi.fn();
    render(
      <AlertModal
        alert={{ ...reminder, type: 'EYE_RUBBING', title: 'Try not to rub your eyes' }}
        onDismiss={onDismiss}
      />,
    );
    expect(screen.getByRole('button', { name: 'Got it' })).toBeTruthy();
    fireEvent(
      screen.getByRole('alertdialog'),
      new Event('cancel', { cancelable: true }),
    );
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe('Dev 5 - BreakTimer', () => {
  it('counts down and allows ending the break early', async () => {
    const onEndBreak = vi.fn();
    render(
      <BreakTimer
        breakStatus={{ remainingMs: 245_000, durationMs: 300_000, finished: false }}
        elapsedLabel="12:00"
        onEndBreak={onEndBreak}
      />,
    );
    expect(screen.getByRole('timer').textContent).toBe('04:05');
    expect(screen.getByRole('heading', { name: 'On a break' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'End break early' }));
    expect(onEndBreak).toHaveBeenCalledTimes(1);
  });

  it('offers Resume when the break is finished', () => {
    render(
      <BreakTimer
        breakStatus={{ remainingMs: 0, durationMs: 300_000, finished: true }}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Break complete' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Resume monitoring' })).toBeTruthy();
  });

  it('confirms before ending the session', async () => {
    const onStop = vi.fn();
    render(
      <BreakTimer
        breakStatus={{ remainingMs: 1000, durationMs: 300_000, finished: false }}
        onStop={onStop}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'End session' }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Confirm end session' }),
    );
    expect(onStop).toHaveBeenCalledTimes(1);
  });
});

describe('Dev 5 - BlinklyApp integration', () => {
  const live = { totals: null, onReady: vi.fn() };

  it('shows the live camera while monitoring and keeps it mounted on home', async () => {
    render(
      <BlinklyApp
        initialScreen="monitoring"
        monitoringState="MONITORING"
        live={live}
      />,
    );
    const camera = screen.getByTestId('camera-preview');
    expect(camera.closest('.background-monitor')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Home' }));
    expect(screen.getByRole('heading', { name: 'Welcome!' })).toBeTruthy();
    // Same element: the camera was not restarted.
    expect(screen.getByTestId('camera-preview')).toBe(camera);
    expect(camera.closest('.background-monitor')).toBeTruthy();
  });

  it('does not run the camera when not monitoring', () => {
    render(
      <BlinklyApp initialScreen="monitoring" monitoringState="ERROR" live={live} />,
    );
    expect(screen.queryByTestId('camera-preview')).toBeNull();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('shows the break timer while on a break', async () => {
    const onEndBreak = vi.fn();
    render(
      <BlinklyApp
        initialScreen="monitoring"
        monitoringState="ON_BREAK"
        breakStatus={{ remainingMs: 60_000, durationMs: 300_000, finished: false }}
        onEndBreak={onEndBreak}
        live={live}
      />,
    );
    expect(screen.queryByTestId('camera-preview')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'End break early' }));
    expect(onEndBreak).toHaveBeenCalledTimes(1);
  });

  it('opens the break timer when a break is taken from an alert', async () => {
    const onTakeBreak = vi.fn();
    const { rerender } = render(
      <BlinklyApp monitoringState="MONITORING" alert={reminder} onTakeBreak={onTakeBreak} />,
    );
    expect(screen.getByRole('heading', { name: 'Welcome!' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Take a break' }));
    expect(onTakeBreak).toHaveBeenCalledTimes(1);
    rerender(
      <BlinklyApp
        monitoringState="ON_BREAK"
        breakStatus={{ remainingMs: 300_000, durationMs: 300_000, finished: false }}
      />,
    );
    expect(screen.getByRole('heading', { name: 'On a break' })).toBeTruthy();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('routes snooze and dismiss to the monitoring service', async () => {
    const onSnooze = vi.fn();
    const onDismissAlert = vi.fn();
    render(
      <BlinklyApp
        monitoringState="MONITORING"
        alert={reminder}
        onSnooze={onSnooze}
        onDismissAlert={onDismissAlert}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /Snooze/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(onSnooze).toHaveBeenCalledTimes(1);
    expect(onDismissAlert).toHaveBeenCalledTimes(1);
  });

  it('shows a save warning', () => {
    render(<BlinklyApp monitoringWarning="Some session data could not be saved." />);
    expect(screen.getByRole('status').textContent).toContain('could not be saved');
  });
});
