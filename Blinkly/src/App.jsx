import { useEffect, useState, useSyncExternalStore } from 'react';
import BlinklyApp from './components/BlinklyApp.jsx';
import {
  DEFAULT_SETTINGS,
  validateSettings,
} from './contracts/settings.mjs';
import { createMonitoringController } from './services/monitoring.js';
import './index.css';

export default function App() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  // Dev 5: one monitoring controller for the lifetime of the window.
  const [monitor] = useState(() =>
    createMonitoringController({ api: window.Blinkly ?? null }),
  );
  const monitoring = useSyncExternalStore(
    monitor.subscribe,
    monitor.getSnapshot,
  );

  useEffect(() => {
    monitor.updateSettings(settings);
  }, [monitor, settings]);

  useEffect(() => () => monitor.dispose(), [monitor]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        if (!window.Blinkly?.getSettings) return;
        const saved = await window.Blinkly.getSettings();

        if (!cancelled) {
          setSettings(validateSettings({
            ...DEFAULT_SETTINGS,
            ...saved,
          }));
        }
      } catch (error) {
        console.error('Settings load failed:', error);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  async function saveSettings(next) {
    const valid = validateSettings(next);

    const saved = window.Blinkly?.saveSettings
      ? await window.Blinkly.saveSettings(valid)
      : valid;

    setSettings(validateSettings(saved));
  }

  return (
    <BlinklyApp
      settings={settings}
      onSaveSettings={saveSettings}
      monitoringState={monitoring.state}
      elapsedLabel={monitoring.elapsedLabel}
      monitoringError={monitoring.error}
      monitoringWarning={monitoring.warning}
      alert={monitoring.alert}
      breakStatus={monitoring.breakStatus}
      onStart={monitor.start}
      onTakeBreak={() => monitor.startBreak()}
      onEndBreak={monitor.completeBreak}
      onSnooze={monitor.snooze}
      onDismissAlert={monitor.dismissAlert}
      onStop={monitor.endSession}
      onRetry={monitor.retry}
      live={{
        totals: monitoring.totals,
        onReady: monitor.cameraStarted,
        onError: monitor.cameraFailed,
        onDetection: monitor.recordDetection,
        onBrightness: monitor.recordBrightness,
      }}
    />
  );
}
