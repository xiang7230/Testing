import { useState } from 'react';
import EndSessionDialog from './EndSessionDialog.jsx';
import { PowerIcon, RestIcon, SunIcon } from './icons.jsx';
import { MONITORING_STATES } from '../contracts/monitoring.mjs';

const STATUS_COPY = {
  IDLE: {
    label: 'Not monitoring',
    description: 'Start a session when you are ready.',
  },
  STARTING: {
    label: 'Getting ready',
    description: 'Preparing your monitoring session…',
  },
  MONITORING: {
    label: 'Active Monitoring',
    description: 'Blinkly is keeping an eye on your screen-time habits.',
  },
  PAUSED: {
    label: 'Paused',
    description: 'Your session is paused.',
  },
  ON_BREAK: {
    label: 'On a break',
    description: 'Take a moment away from your screen.',
  },
  ERROR: {
    label: 'Needs attention',
    description: 'Monitoring stopped because of a problem.',
  },
  COMPLETED: {
    label: 'Session complete',
    description: 'Nice work looking after your eyes.',
  },
};

function ReadingCard({ label, value, unit, simulated }) {
  return (
    <article className="reading-card">
      <h2 className="reading-card__label">{label}</h2>
      <p className="reading-card__value">
        {value ?? '—'}
        {value != null && <span>{unit}</span>}
      </p>
      {simulated && <span className="simulated-tag">SIMULATED</span>}
    </article>
  );
}

export default function MonitoringScreen({
  state = 'IDLE',
  pending = false,
  detection = null,
  currentBrightness = null,
  isPreview = false,
  elapsedLabel = '00:00',
  error = '',
  onStart,
  onTakeBreak,
  onStop,
  onRetry,
}) {
  const [confirmingStop, setConfirmingStop] = useState(false);
  const status = STATUS_COPY[state] ?? STATUS_COPY.ERROR;
  const isKnownState = MONITORING_STATES.includes(state);
  const isMonitoring = state === 'MONITORING';
  const isPaused = state === 'PAUSED';
  const isStarting = state === 'STARTING';
  const canStart = state === 'IDLE' || state === 'COMPLETED';
  const canRetry = state === 'ERROR';
  const simulated = detection?.source === 'simulated';
  const brightness = Number.isFinite(currentBrightness)
    ? Math.min(100, Math.max(0, currentBrightness))
    : null;

  return (
    <div className="monitoring">
      <section
        className={`session-banner session-banner--${state.toLowerCase()}`}
        aria-labelledby="monitor-title"
      >
        <div>
          <h1 id="monitor-title" aria-live="polite">
            {status.label}
          </h1>
          <p>{status.description}</p>
        </div>
        <span className="session-banner__clock" aria-label="Session time">
          {elapsedLabel}
        </span>
      </section>

      {/* <section aria-label="Current readings" className="readings">
        <ReadingCard
          label="Blink rate"
          value={detection?.blinkRate ?? null}
          unit="blinks/min"
          simulated={simulated}
        />
        <ReadingCard
          label="Viewing distance"
          value={detection?.viewingDistanceCm ?? null}
          unit="cm"
          simulated={simulated}
        />
      </section> */}

      <section aria-label="Current readings" className="readings">
      <ReadingCard
        label="Blink rate"
        value={detection?.blinkRate ?? null}
        unit="blinks/min"
        simulated={simulated}
      />

      <ReadingCard
        label="Estimated viewing distance"
        value={detection?.viewingDistanceCm ?? null}
        unit="cm"
        simulated={simulated}
      />
    </section>

    {isMonitoring &&
      detection?.relativeDistanceStatus === 'UNKNOWN' && (
        <p role="status" style={{
          color: '#69657e',
          fontSize: 13,
          marginTop: 12,
        }}>
          {detection?.faceDetected
            ? 'Calibrating viewing distance automatically...'
            : 'Waiting for your face to be visible to calibrate distance.'}
        </p>
      )}

    {isMonitoring &&
      detection?.relativeDistanceStatus === 'TOO_CLOSE' && (
        <p role="status" style={{
          color: '#a4501f',
          fontWeight: 600,
          marginTop: 12,
        }}>
          You may be sitting too close to the screen.
          Consider moving further away.
        </p>
      )}

      <section className="brightness-row" aria-labelledby="brightness-label">
        <h2 id="brightness-label">
          Current brightness
          <SunIcon />
        </h2>
        {brightness != null ? (
          <meter
            aria-labelledby="brightness-label"
            className="brightness-meter"
            min="0"
            max="100"
            value={brightness}
          >
            {brightness}%
          </meter>
        ) : (
          <div
            className="brightness-meter brightness-meter--empty"
            aria-hidden="true"
          />
        )}
        <span className="brightness-row__value">
          {brightness == null ? '—' : `${brightness}%`}
        </span>
        {isPreview && brightness != null && (
          <span className="simulated-tag">SIMULATED</span>
        )}
      </section>

      <fieldset
        className="monitor-controls"
        disabled={pending}
        aria-label="Monitoring controls"
        aria-busy={pending}
      >
        {(canStart || canRetry) && (
          <button
            className="button button--primary button--large"
            type="button"
            onClick={canStart ? onStart : onRetry}
          >
            {canStart ? 'Start monitoring' : 'Try again'}
          </button>
        )}
        {isStarting && (
          <button
            className="button button--primary button--large"
            type="button"
            disabled
          >
            <span className="button-spinner" aria-hidden="true" />
            Starting…
          </button>
        )}
        {isMonitoring && (
          <button
            className="button button--quiet button--large"
            type="button"
            onClick={onTakeBreak}
          >
            <RestIcon />
            Take a break
          </button>
        )}
        {(isMonitoring || isPaused) && (
          <button
            className="button button--quiet button--large button--end"
            type="button"
            onClick={() => setConfirmingStop(true)}
          >
            <PowerIcon />
            End session
          </button>
        )}
        {state === 'ON_BREAK' && (
          <button
            className="button button--quiet button--large"
            type="button"
            disabled
          >
            Break in progress
          </button>
        )}
      </fieldset>
      {error && (
        <p className="form-error monitor-error" role="alert">
          {error}
        </p>
      )}
      {!isKnownState && (
        <p className="form-error monitor-error" role="alert">
          Unknown monitoring state: {state}
        </p>
      )}
      {isPreview && (
        <p className="demo-disclaimer">
          Preview · Sample measurements are simulated and are not medical
          advice.
        </p>
      )}

      {confirmingStop && (isMonitoring || isPaused) && !pending && (
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
