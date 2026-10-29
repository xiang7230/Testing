import { useRef, useState } from 'react';
import { DEFAULT_SETTINGS } from '../contracts/settings.mjs';
import HomePage from './HomePage.jsx';
import MonitoringScreen from './MonitoringScreen.jsx';
import CameraPreview from './CameraPreview.jsx';
import SettingsPanel from './SettingsPanel.jsx';
import UserProfile from './UserProfile.jsx';
import AlertModal from './AlertModal.jsx';
import BreakTimer from './BreakTimer.jsx';
import { BlinklyMark, HomeIcon, ProfileIcon, SettingsIcon } from './icons.jsx';
import './app.css';

// Top-level UI: owns which screen is shown (home, monitoring or profile).
// Monitoring state, timing and data are supplied by the monitoring service.
// `live` connects the real camera pipeline: { onReady, onError, onDetection,
// onBrightness, totals }. Without it the mock MonitoringScreen is shown.
export default function BlinklyApp({
  monitoringState = 'IDLE',
  detection = null,
  currentBrightness = null,
  isPreview = false,
  settings: savedSettings,
  onStart,
  onTakeBreak,
  onStop,
  onRetry,
  onSaveSettings,
  monitoringError = '',
  monitoringWarning = '',
  elapsedLabel,
  initialScreen = 'home',
  alert = null,
  breakStatus = null,
  onSnooze,
  onDismissAlert,
  onEndBreak,
  live = null,
}) {
  const [screen, setScreen] = useState(initialScreen);
  const [screenBeforeProfile, setScreenBeforeProfile] = useState('home');
  const [localSettings, setSettings] = useState(DEFAULT_SETTINGS);
  const settings = savedSettings ?? localSettings;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [controlError, setControlError] = useState('');
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const profileButtonRef = useRef(null);
  const state = monitoringState;
  const displayedElapsedLabel = elapsedLabel ?? '00:00';
  const error = controlError || monitoringError;

  // Resolves true when the action succeeded, so callers can navigate after it.
  async function runControl(callback) {
    if (pendingRef.current) return false;
    pendingRef.current = true;
    setPending(true);
    setControlError('');
    try {
      if (!callback)
        throw new Error('Monitoring controls are not connected yet.');
      await callback();
      return true;
    } catch (actionError) {
      setControlError(
        actionError?.message || 'That action could not be completed.',
      );
      return false;
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  function goTo(nextScreen) {
    setControlError('');
    setScreen(nextScreen);
  }

  function openProfile() {
    if (screen !== 'profile') setScreenBeforeProfile(screen);
    goTo('profile');
  }

  async function startMonitoring() {
    if (await runControl(onStart)) goTo('monitoring');
  }

  async function endSession() {
    if (await runControl(onStop)) goTo('home');
  }

  // Taking a break from an alert opens the break timer.
  async function takeBreakFromAlert() {
    if (await runControl(onTakeBreak)) goTo('monitoring');
  }

  // The camera keeps running in the background on other screens.
  const liveActive =
    Boolean(live) && (state === 'STARTING' || state === 'MONITORING');
  const showLive = liveActive && screen === 'monitoring';

  const retry = () => runControl(onRetry);


  async function saveSettings(nextSettings) {
    if (onSaveSettings) {
      await onSaveSettings(nextSettings);
    }
    setSettings(nextSettings);
  }

  async function openBrightnessSettings() {
    // First dismiss the alert. Settings should not
    // compete with the existing modal alert dialog.
    const dismissed = await runControl(onDismissAlert);

    if (!dismissed) return;

    setSettingsOpen(true);
  }

  return (

    <div className="app-shell">
      <header className="topbar">
        <button
          aria-label="Blinkly home"
          className="brand"
          onClick={() => goTo('home')}
          type="button"
        >
          <BlinklyMark className="brand__mark" />
          <span className="brand__copy">
            <span className="brand__name">blinkly</span>
            <span className="brand__tagline">HEALTHIER SCREEN TIME</span>
          </span>
        </button>
        <nav aria-label="Main navigation" className="topbar__actions">
          {screen !== 'home' && (
            <button
              aria-label="Home"
              className="icon-button"
              onClick={() => goTo('home')}
              title="Home"
              type="button"
            >
              <HomeIcon />
            </button>
          )}
          <button
            aria-label="Settings"
            className="icon-button"
            onClick={() => setSettingsOpen(true)}
            title="Settings"
            type="button"
          >
            <SettingsIcon />
          </button>
          <button
            aria-current={screen === 'profile' ? 'page' : undefined}
            aria-label="View Alice Tan profile"
            className="icon-button"
            onClick={openProfile}
            ref={profileButtonRef}
            title="Profile"
            type="button"
          >
            <ProfileIcon />
          </button>
        </nav>
      </header>

      <main className="screen">
        {liveActive && (
          <div
            className={showLive ? undefined : 'background-monitor'}
            aria-hidden={showLive ? undefined : true}
            inert={showLive ? undefined : true}
          >
            <CameraPreview
              settings={settings}
              elapsedLabel={displayedElapsedLabel}
              totals={live.totals}
              pending={pending}
              onReady={live.onReady}
              onError={live.onError}
              onDetection={live.onDetection}
              onBrightness={live.onBrightness}
              onTakeBreak={() => runControl(onTakeBreak)}
              onStop={endSession}
            />
          </div>
        )}
        {screen === 'home' && (
          <HomePage
            elapsedLabel={displayedElapsedLabel}
            error={error}
            onOpenMonitoring={() => goTo('monitoring')}
            onRetry={retry}
            onStart={startMonitoring}
            pending={pending}
            state={state}
          />
        )}
        {screen === 'monitoring' && state === 'ON_BREAK' && breakStatus && (
          <BreakTimer
            breakStatus={breakStatus}
            elapsedLabel={displayedElapsedLabel}
            error={error}
            pending={pending}
            onEndBreak={() => runControl(onEndBreak)}
            onStop={endSession}
          />
        )}
        {screen === 'monitoring' &&
          !liveActive &&
          !(state === 'ON_BREAK' && breakStatus) && (
            <MonitoringScreen
              currentBrightness={currentBrightness}
              detection={detection}
              elapsedLabel={displayedElapsedLabel}
              error={error}
              isPreview={isPreview}
              onRetry={retry}
              onStart={() => runControl(onStart)}
              onStop={endSession}
              onTakeBreak={() => runControl(onTakeBreak)}
              pending={pending}
              state={state}
            />
          )}
        {screen === 'profile' && (
          <div className="screen__narrow">
            <UserProfile
              onBack={() => {
                goTo(screenBeforeProfile);
                profileButtonRef.current?.focus();
              }}
            />
          </div>
        )}
        {monitoringWarning && (
          <p className="monitoring-warning" role="status">
            {monitoringWarning}
          </p>
        )}
      </main>


      {alert && (
        <AlertModal
          key={alert.id}
          alert={alert}
          pending={pending}
          snoozeMinutes={settings.snoozeDurationMinutes}
          onTakeBreak={takeBreakFromAlert}
          onSnooze={() => runControl(onSnooze)}
          onDismiss={() => runControl(onDismissAlert)}
          onAdjustBrightness={openBrightnessSettings}
        />
      )}


      {settingsOpen && (
        <SettingsPanel
          onClose={() => setSettingsOpen(false)}
          onSave={saveSettings}
          settings={settings}
        />
      )}
    </div>
  );
}
