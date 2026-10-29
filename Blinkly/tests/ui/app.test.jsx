import { describe, it, expect, vi } from 'vitest';

import { DEFAULT_SETTINGS } from '../../src/contracts/settings.mjs';

// Dev2: Mock persistent settings for UI tests.
vi.mock('../../src/services/settings.js', () => ({
  loadSettings: vi.fn(async () => ({ ...DEFAULT_SETTINGS })),
  saveSettings: vi.fn(async (settings) => ({ ...settings })),
}));

import {
  render,
  screen,
  within,
  waitFor,
  fireEvent,
  act,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BlinklyApp from '../../src/components/BlinklyApp.jsx';
import { TIPS } from '../../src/components/HomePage.jsx';
import MonitoringScreen from '../../src/components/MonitoringScreen.jsx';
import AppPreview from '../../src/preview/AppPreview.jsx';
import { previewFixtures } from '../../src/preview/previewFixtures.mjs';

const isHome = () => screen.queryByRole('heading', { name: 'Welcome!' });
const isMonitoring = () =>
  screen.queryByRole('group', { name: 'Monitoring controls' });

const readingValues = () =>
  [
    ...document.querySelectorAll(
      '.reading-card__value, .brightness-row__value',
    ),
  ].map((element) => element.textContent.replace(/\s+/g, ' ').trim());

describe('home page', () => {
  it('shows the welcome, tip of the day and start button', () => {
    render(<BlinklyApp />);
    expect(isHome()).toBeTruthy();
    expect(
      screen.getByText('Let’s take care of your eyes today.'),
    ).toBeTruthy();
    const tip = screen.getByRole('complementary', { name: 'Tip of the Day' });
    expect(TIPS).toContain(tip.querySelector('p').textContent);
    expect(
      screen.getByRole('button', { name: 'Start Monitoring' }),
    ).toBeTruthy();
    expect(isMonitoring()).toBeNull();
  });

  it('starts monitoring and switches to the monitoring screen', async () => {
    const onStart = vi.fn();
    render(<BlinklyApp onStart={onStart} />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Start Monitoring' }),
    );
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(isHome()).toBeNull();
    expect(isMonitoring()).toBeTruthy();
  });

  it('stays home, disables the button while pending and shows a rejected start', async () => {
    let rejectAction;
    const onStart = vi.fn(
      () =>
        new Promise((resolve, reject) => {
          rejectAction = reject;
        }),
    );
    render(<BlinklyApp onStart={onStart} />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Start Monitoring' }),
    );
    const button = screen.getByRole('button', { name: 'Starting…' });
    expect(button.matches(':disabled')).toBe(true);
    await userEvent.click(button);
    expect(onStart).toHaveBeenCalledTimes(1);
    rejectAction(new Error('Camera unavailable'));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Camera unavailable',
    );
    await waitFor(() =>
      expect(
        screen
          .getByRole('button', { name: 'Start Monitoring' })
          .matches(':disabled'),
      ).toBe(false),
    );
    expect(isHome()).toBeTruthy();
  });

  it('reports an unconnected start action', async () => {
    render(<BlinklyApp />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Start Monitoring' }),
    );
    expect((await screen.findByRole('alert')).textContent).toContain(
      'not connected',
    );
    expect(isHome()).toBeTruthy();
  });

  it('shows a supplied error with a retry action', async () => {
    const onRetry = vi.fn();
    render(
      <BlinklyApp
        monitoringState="ERROR"
        monitoringError="Allow camera access"
        onRetry={onRetry}
      />,
    );
    expect(screen.getByRole('alert').textContent).toBe('Allow camera access');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('offers a way back to an active session', async () => {
    render(<BlinklyApp monitoringState="MONITORING" elapsedLabel="01:05" />);
    const back = screen.getByRole('button', { name: /Back to monitoring/ });
    expect(back.textContent).toContain('01:05');
    await userEvent.click(back);
    expect(isMonitoring()).toBeTruthy();
  });
});

describe('monitoring screen', () => {
  it.each([
    ['IDLE', ['Start monitoring']],
    ['STARTING', ['Starting…']],
    ['MONITORING', ['Take a break', 'End session']],
    ['PAUSED', ['End session']],
    ['ON_BREAK', ['Break in progress']],
    ['ERROR', ['Try again']],
    ['COMPLETED', ['Start monitoring']],
  ])('%s shows only the relevant controls', (state, names) => {
    render(<MonitoringScreen state={state} />);
    const controls = screen.getByRole('group', {
      name: 'Monitoring controls',
    });
    expect(
      within(controls)
        .getAllByRole('button')
        .map((button) => button.textContent.trim()),
    ).toEqual(names);
    if (state === 'STARTING' || state === 'ON_BREAK')
      expect(within(controls).getByRole('button').disabled).toBe(true);
  });

  it('shows the status and session time in the banner', () => {
    render(<MonitoringScreen state="MONITORING" elapsedLabel="00:11" />);
    expect(
      screen.getByRole('heading', { name: 'Active Monitoring' }),
    ).toBeTruthy();
    expect(screen.getByLabelText('Session time').textContent).toBe('00:11');
  });

  it('calls Take a break without changing the supplied state', async () => {
    const onTakeBreak = vi.fn();
    render(
      <BlinklyApp
        initialScreen="monitoring"
        monitoringState="MONITORING"
        onTakeBreak={onTakeBreak}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Take a break' }));
    expect(onTakeBreak).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Take a break' })).toBeTruthy();
  });

  it('reports an unconnected Take a break action', async () => {
    render(
      <BlinklyApp initialScreen="monitoring" monitoringState="MONITORING" />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Take a break' }));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'not connected',
    );
  });

  it('requires confirmation to end and returns home afterwards', async () => {
    const onStop = vi.fn();
    render(
      <BlinklyApp
        initialScreen="monitoring"
        monitoringState="MONITORING"
        onStop={onStop}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'End session' }));
    expect(onStop).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole('button', { name: 'Keep monitoring' }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onStop).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'End session' }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Confirm end session' }),
    );
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(isHome()).toBeTruthy();
  });

  it('stays on the monitoring screen when ending fails', async () => {
    const onStop = vi.fn().mockRejectedValue(new Error('Could not save'));
    render(
      <BlinklyApp
        initialScreen="monitoring"
        monitoringState="MONITORING"
        onStop={onStop}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'End session' }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Confirm end session' }),
    );
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Could not save',
    );
    expect(isMonitoring()).toBeTruthy();
  });

  it('cancels confirmation with Escape without ending the session', async () => {
    const onStop = vi.fn();
    render(<MonitoringScreen state="PAUSED" onStop={onStop} />);
    await userEvent.click(screen.getByRole('button', { name: 'End session' }));
    fireEvent(
      screen.getByRole('dialog'),
      new Event('cancel', { cancelable: true }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onStop).not.toHaveBeenCalled();
  });

  it('renders supplied readings and distinguishes missing values from zero', () => {
    const { rerender } = render(
      <MonitoringScreen {...previewFixtures.MONITORING} state="MONITORING" />,
    );
    expect(readingValues()).toEqual(['12blinks/min', '25cm', '60%']);
    rerender(
      <MonitoringScreen
        detection={{ blinkRate: 0, source: 'real' }}
        currentBrightness={0}
      />,
    );
    expect(readingValues()).toEqual(['0blinks/min', '—', '0%']);
    expect(screen.queryByText('SIMULATED')).toBeNull();
    rerender(<MonitoringScreen />);
    expect(readingValues()).toEqual(['—', '—', '—']);
  });

  it('home button returns to the home page', async () => {
    render(
      <BlinklyApp initialScreen="monitoring" monitoringState="MONITORING" />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Home' }));
    expect(isHome()).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Home' })).toBeNull();
  });
});

describe('preview', () => {
  it('walks from home to monitoring and back after ending', async () => {
    render(<AppPreview />);

    await screen.findByRole('button', {
      name: 'Start Monitoring',
    });

    expect(isHome()).toBeTruthy();
    await userEvent.click(
      screen.getByRole('button', { name: 'Start Monitoring' }),
    );
    expect(readingValues()).toEqual(['12blinks/min', '25cm', '60%']);
    await userEvent.click(screen.getByRole('button', { name: 'Take a break' }));
    expect(readingValues()).toEqual(['12blinks/min', '25cm', '60%']);
    await userEvent.click(screen.getByRole('button', { name: 'End session' }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Confirm end session' }),
    );
    expect(isHome()).toBeTruthy();
    expect(screen.getByText(/Session complete/)).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Start Monitoring' }),
    ).toBeTruthy();
  });

  it('scenarios open the monitoring screen with errors and missing data', async () => {
    render(<AppPreview />);
    // Dev2: Wait for preferences to load.
    const scenarioSelect = await screen.findByLabelText('Scenario');

    await userEvent.selectOptions(scenarioSelect, 'ERROR');
    expect(isMonitoring()).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain(
      'Camera access was denied',
    );
    await userEvent.selectOptions(
      screen.getByLabelText('Scenario'),
      'MISSING_DATA',
    );
    expect(screen.queryByRole('alert')).toBeNull();
    expect(readingValues()).toEqual(['—', '—', '—']);
    await userEvent.selectOptions(screen.getByLabelText('Scenario'), 'IDLE');
    expect(isHome()).toBeTruthy();
  });

  it('timer runs during monitoring, keeps running on the home page and resets on end', async () => {
    vi.useFakeTimers();
    try {
      render(<AppPreview />);

      // Allow the settings-loading promise to finish.
      await act(async () => {
        await Promise.resolve();
      });
      const clock = () => screen.getByLabelText('Session time').textContent;
      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', { name: 'Start Monitoring' }),
        );
      });
      act(() => vi.advanceTimersByTime(3000));
      expect(clock()).toBe('00:03');
      fireEvent.click(screen.getByRole('button', { name: 'Home' }));
      act(() => vi.advanceTimersByTime(2000));
      expect(
        screen.getByRole('button', { name: /Back to monitoring/ }).textContent,
      ).toContain('00:05');
      fireEvent.click(
        screen.getByRole('button', { name: /Back to monitoring/ }),
      );
      expect(clock()).toBe('00:05');
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'End session' }));
      });
      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', { name: 'Confirm end session' }),
        );
      });
      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', { name: 'Start Monitoring' }),
        );
      });
      expect(clock()).toBe('00:00');
    } finally {
      vi.useRealTimers();
    }
  });

  it('opens the dummy profile and returns to the previous screen', async () => {
    render(<AppPreview />);
    // Dev2: Wait for preferences to load.
    const startButton = await screen.findByRole('button', {
      name: 'Start Monitoring',
    });

    await userEvent.click(startButton);
    await userEvent.click(
      screen.getByRole('button', { name: 'View Alice Tan profile' }),
    );
    expect(screen.getByRole('heading', { name: 'User Profile' })).toBeTruthy();
    expect(screen.getByText('alice.tan')).toBeTruthy();
    expect(screen.getByText('1 January 2000')).toBeTruthy();
    expect(screen.getByText('alice.tan@example.com')).toBeTruthy();
    expect(isMonitoring()).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Back$/ }));
    expect(isMonitoring()).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'User Profile' })).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'View Alice Tan profile' }),
    );
  });

  it('opens settings from the top bar', async () => {
    render(<AppPreview />);
    // Dev2: Wait for preferences to load.
    const settingsButton = await screen.findByRole('button', {
      name: 'Settings',
    });
    await userEvent.click(settingsButton);
    expect(screen.getByRole('dialog', { name: 'Preferences' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
