import { useEffect, useState } from 'react';
import BlinklyApp from '../components/BlinklyApp.jsx';
import { previewFixtures } from './previewFixtures.mjs';

import { DEFAULT_SETTINGS } from '../contracts/settings.mjs';
import {
  loadSettings,
  saveSettings,
} from '../services/settings.js';


export default function AppPreview() {
  const [scenario, setScenario] = useState('IDLE');
  const [state, setState] = useState('IDLE');
  const [elapsed, setElapsed] = useState(0);
  const fixture = previewFixtures[scenario];
  const showSampleData = ['MONITORING', 'PAUSED', 'ON_BREAK'].includes(state);

  // =====================================
  // Dev2: Settings persistence (NEW)
  // =====================================

  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [settingsError, setSettingsError] = useState('');
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  useEffect(() => {
    let active = true;

    loadSettings()
      .then((savedSettings) => {
        if (active) setSettings(savedSettings);
      })
      .catch((error) => {
        if (active) setSettingsError(error.message);
      })
      .finally(() => {
        if (active) setSettingsLoaded(true);
      });

    return () => {
      active = false;
    };
  }, []);

  async function handleSaveSettings(nextSettings) {
    const saved = await saveSettings(nextSettings);
    setSettings(saved);
  }

  useEffect(() => {
    if (state !== 'MONITORING') return;
    const timer = setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [state]);

  function selectScenario(event) {
    const name = event.target.value;
    setScenario(name);
    setState(previewFixtures[name].monitoringState);
    setElapsed(previewFixtures[name].elapsedSeconds);
  }
    // Dev2: Wait for saved settings to load.
  if (!settingsLoaded) {
    return <p>Loading preferences...</p>;
  }

  // Dev2: Show an error if settings cannot be loaded.
  if (settingsError) {
    return (
      <div role="alert">
        <p>Unable to load preferences: {settingsError}</p>
        <p>Restart Blinkly and try again.</p>
      </div>
    );
  }

  return (
    <>
      <div className="preview-controls">
        <strong>UI preview · simulated data</strong>
        <label htmlFor="preview-scenario">Scenario</label>
        <select
          className="field-select"
          id="preview-scenario"
          value={scenario}
          onChange={selectScenario}
        >
          {Object.keys(previewFixtures).map((name) => (
            <option key={name} value={name}>
              {name.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
      </div>
      <BlinklyApp
        // Remount per scenario so each one opens on its natural screen.
        key={scenario}
        initialScreen={scenario === 'IDLE' ? 'home' : 'monitoring'}
        {...fixture}
        //settings persistence
        settings={settings}
        onSaveSettings={handleSaveSettings}

        detection={showSampleData ? fixture.detection : null}
        currentBrightness={showSampleData ? fixture.currentBrightness : null}
        isPreview
        monitoringState={state}
        monitoringError={state === 'ERROR' ? fixture.monitoringError : ''}
        elapsedLabel={`${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`}
        onStart={() => {
          setElapsed(0);
          setState('MONITORING');
        }}
        onStop={() => {
          setElapsed(0);
          setState('COMPLETED');
        }}
        onRetry={() => setState('IDLE')}
      />
    </>
  );
}
