import { useState } from 'react';
import EndSessionDialog from './EndSessionDialog.jsx';
import { formatElapsed } from '../services/monitoring.js';
import './monitoring.css';

const BREAK_IDEAS = [
  'Look at something about 6 metres (20 feet) away.',
  'Close your eyes and relax your shoulders.',
  'Stand up, stretch and get some water.',
];

// Dev 5: break countdown. The camera is off while this screen is shown.
export default function BreakTimer({
  breakStatus,
  elapsedLabel = '00:00',
  pending = false,
  error = '',
  onEndBreak,
  onStop,
}) {
  const [confirmingStop, setConfirmingStop] = useState(false);
  const { remainingMs, durationMs, finished } = breakStatus;
  const progress =
    durationMs > 0 ? Math.min(100, ((durationMs - remainingMs) / durationMs) * 100) : 100;

  return (
    <div className="monitoring break-timer">
      <section
        className="session-banner session-banner--on_break"
        aria-labelledby="break-title"
      >
        <div>
          <h1 id="break-title" aria-live="polite">
            {finished ? 'Break complete' : 'On a break'}
          </h1>
          <p>
            {finished
              ? 'Welcome back. Resume monitoring when you are ready.'
              : 'Take a moment away from your screen. The camera is off.'}
          </p>
        </div>
        <span className="session-banner__clock" aria-label="Session time">
          {elapsedLabel}
        </span>
      </section>

      <section className="break-timer__card" aria-label="Break countdown">
        <p className="break-timer__remaining" role="timer" aria-live="off">
          {formatElapsed(remainingMs)}
        </p>
        <progress
          className="break-timer__progress"
          max="100"
          value={progress}
          aria-label="Break progress"
        />
        <ul className="break-timer__ideas">
          {BREAK_IDEAS.map((idea) => (
            <li key={idea}>{idea}</li>
          ))}
        </ul>
      </section>

      <fieldset
        className="monitor-controls"
        disabled={pending}
        aria-label="Break controls"
        aria-busy={pending}
      >
        <button
          className="button button--primary button--large"
          type="button"
          onClick={onEndBreak}
        >
          {finished ? 'Resume monitoring' : 'End break early'}
        </button>
        <button
          className="button button--quiet button--large button--end"
          type="button"
          onClick={() => setConfirmingStop(true)}
        >
          End session
        </button>
      </fieldset>
      {error && (
        <p className="form-error monitor-error" role="alert">
          {error}
        </p>
      )}

      {confirmingStop && !pending && (
        <EndSessionDialog
          onCancel={() => setConfirmingStop(false)}
          onConfirm={() => {
            setConfirmingStop(false);
            onStop?.();
          }}
        />
      )}
    </div>
  );
}
