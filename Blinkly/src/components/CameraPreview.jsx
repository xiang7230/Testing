
import { useEffect, useRef, useState } from 'react';

import { camera } from '../services/camera.js';
import { faceTracker } from '../services/faceTracking.js';
import { createBlinkDetector } from '../services/blinkDetection.js';
import { HandTracker } from '../services/handTracking.js';
import { EyeRubbingDetector } from '../services/eyeRubbing.js';
import { DistanceDetector } from '../services/distance.js';
import { validateDetection } from '../contracts/detection.mjs';
import EndSessionDialog from './EndSessionDialog.jsx';

const CALIBRATION_MS = 2000;
const FRAME_INTERVAL_MS = 100;

const emptyHand = {
  handDetected: false,
  hands: [],
};

// Dev 5 integration: monitoring.js owns the session timer, totals,
// alerts and persistence. This component reports camera results to it.
export default function CameraPreview({
  settings,
  elapsedLabel = '00:00',
  totals = null,
  pending = false,
  onReady,
  onError,
  onDetection,
  onBrightness,
  onTakeBreak,
  onStop,
}) {
  const videoRef = useRef(null);

  const [status, setStatus] = useState('STARTING');
  const [showPreview, setShowPreview] = useState(true);
  const [confirmingStop, setConfirmingStop] = useState(false);
  const [error, setError] = useState('');
  const [detection, setDetection] = useState(null);
  const [blinkCount, setBlinkCount] = useState(0);
  const [rubbingCount, setRubbingCount] = useState(0);
  const [calibrationStatus, setCalibrationStatus] =
    useState('CALIBRATING');
  const [brightness, setBrightness] = useState(null);

  const runtimeRef = useRef(null);
  const stoppedRef = useRef(false);

  // Latest callbacks, so new props do not restart the camera.
  const callbacksRef = useRef({});
  callbacksRef.current = { onReady, onError, onDetection, onBrightness };

  useEffect(() => {
    let cancelled = false;
    let frameId = null;
    let handTracker = null;
    let blinkDetector = createBlinkDetector();

    const rubbingDetector = new EyeRubbingDetector();
    const distanceDetector = new DistanceDetector({
      faceWidthCm: 15,
      horizontalFovDegrees: 60,
      tooCloseCm: 45,
      recoveryCm: 50,
      minimumSamples: 12,
    });

    const calibration = {
      startedAt: null,
      samples: [],
      totalFrames: 0,
      complete: false,
    };

    const stats = {
      totalBlinks: 0,
      rubbingEvents: new Set(),
      distanceSum: 0,
      distanceSamples: 0,
    };

    let lastProcessed = -1;
    let lastFrameTimestamp = -1;

    runtimeRef.current = {
      stats,
      calibration,
    };

    async function initialize() {
      try {
        setStatus('STARTING');
        setError('');

        const stream = await camera.start();

        if (cancelled) return;

        const video = videoRef.current;

        if (!video) {
          throw new Error('Video element unavailable');
        }

        video.srcObject = stream;
        await video.play();

        if (cancelled) return;

        // Dev 3 face tracking
        await faceTracker.initialize();

        if (cancelled) return;

        // Dev 4 hand tracking
        if (settings?.handTrackingEnabled !== false) {
          handTracker = new HandTracker();
          await handTracker.initialize();
        }

        if (cancelled) return;

        setStatus('RUNNING');
        callbacksRef.current.onReady?.();

        frameId = requestAnimationFrame(processFrame);
      } catch (err) {
        if (cancelled) return;

        const message = err.message || 'Could not start monitoring.';
        setStatus('ERROR');
        setError(message);
        camera.stop();
        callbacksRef.current.onError?.(message);
      }
    }

    function processFrame(timestamp) {
      if (cancelled || stoppedRef.current) return;

      frameId = requestAnimationFrame(processFrame);

      if (
        timestamp - lastProcessed <
        FRAME_INTERVAL_MS
      ) {
        return;
      }

      const video = videoRef.current;

      if (
        !video ||
        video.readyState < 2 ||
        !video.videoWidth ||
        !video.videoHeight
      ) {
        return;
      }

      lastProcessed = timestamp;

      const frameTimestamp = Math.max(
        timestamp,
        lastFrameTimestamp + 1
      );

      lastFrameTimestamp = frameTimestamp;

      try {
        // Dev 3: detect face landmarks.
        const faceResult = faceTracker.detect(
          video,
          frameTimestamp,
          Date.now()
        );

        // No fresh camera frame; skip processing.
        if (!faceResult) return;

        const face = faceResult.landmarks.length
          ? faceResult.landmarks
          : null;

        // Dev 3: blink detection.
        const blink = blinkDetector.update({
          landmarks: face ?? [],
          width: video.videoWidth,
          height: video.videoHeight,
          timestamp: frameTimestamp,
        });

        // Dev 4: hand tracking.
        const hand = handTracker
          ? handTracker.detect(video, frameTimestamp)
          : emptyHand;

        const common = {
          faceLandmarks: face,
          timestampMs: frameTimestamp,
          imageWidth: video.videoWidth,
          imageHeight: video.videoHeight,
        };

        // Automatic two-second distance calibration.
        if (!calibration.complete) {
          if (calibration.startedAt === null) {
            calibration.startedAt = frameTimestamp;
          }

          calibration.totalFrames += 1;

          if (face) {
            calibration.samples.push(face);
          }

          if (
            frameTimestamp - calibration.startedAt >=
            CALIBRATION_MS
          ) {
            const coverage =
              calibration.samples.length /
              calibration.totalFrames;

            const success =
              calibration.totalFrames >= 12 &&
              coverage >= 0.75 &&
              distanceDetector.calibrate(
                calibration.samples,
                {
                  imageWidth: video.videoWidth,
                  imageHeight: video.videoHeight,
                }
              );

            if (success) {
              calibration.complete = true;
              setCalibrationStatus('COMPLETE');
            } else {
              // Retry automatically if unstable.
              calibration.startedAt = frameTimestamp;
              calibration.samples = [];
              calibration.totalFrames = 0;
              setCalibrationStatus('RETRYING');
            }
          }
        }

        // Dev 4: possible eye rubbing.
        const rubbing = rubbingDetector.update({
          ...common,
          hands: hand.hands,
        });

        // Dev 4: estimated distance.
        const distance = calibration.complete
          ? distanceDetector.update(common)
          : {
              viewingDistanceCm: null,
              relativeDistanceStatus: 'UNKNOWN',
            };

        const result = validateDetection({
          timestamp: Date.now(),
          faceDetected: Boolean(face),
          handDetected: hand.handDetected,
          blinkRate: blink.blinkRate,
          eyesClosed: blink.eyesClosed,
          eyeClosureDurationMs:
            blink.eyeClosureDurationMs,
          ...rubbing,
          ...distance,
          trackingAvailable: Boolean(face),
          source: 'real',
        });

        // Dev 5: monitoring rules, alerts and persistence.
        callbacksRef.current.onDetection?.(result, {
          newBlinks: blink.blinkCount - stats.totalBlinks,
        });

        // Accumulate session measurements.
        stats.totalBlinks = blink.blinkCount;

        if (result.rubbingEventId) {
          stats.rubbingEvents.add(
            result.rubbingEventId
          );
        }

        if (
          Number.isFinite(
            result.viewingDistanceCm
          )
        ) {
          stats.distanceSum +=
            result.viewingDistanceCm;
          stats.distanceSamples += 1;
        }

        setDetection(result);
        setBlinkCount(blink.blinkCount);
        setRubbingCount(stats.rubbingEvents.size);
      } catch (err) {
        console.error('Detection error:', err);
        const message = err.message || 'AI detection failed.';
        setError(message);
        setStatus('ERROR');
        callbacksRef.current.onError?.(message);
        stoppedRef.current = true;
        cancelAnimationFrame(frameId);
        handTracker?.close();
        handTracker = null;
        faceTracker.stop();
        camera.stop();
      }
    }

    initialize();

    // Read brightness from Electron.
    async function refreshBrightness() {
      try {
        if (!window.Blinkly?.getBrightness) return;

        const result =
          await window.Blinkly.getBrightness();

        if (!cancelled) {
          setBrightness(result);
          callbacksRef.current.onBrightness?.(
            result?.supported ? result.value : null
          );
        }
      } catch {
        if (!cancelled) {
          setBrightness({
            supported: false,
            value: null,
          });
        }
      }
    }

    refreshBrightness();
    const brightnessTimer = setInterval(
      refreshBrightness,
      10000
    );

    return () => {
      cancelled = true;

      clearInterval(brightnessTimer);
      cancelAnimationFrame(frameId);

      handTracker?.close();
      faceTracker.stop();
      camera.stop();

      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
      }

      runtimeRef.current = null;
    };
  }, [settings?.handTrackingEnabled]);

  return (
    <section
      className="monitoring"
      aria-label="Blinkly active monitoring"
    >
      <header className="monitor-heading">
        <div>
          <span className="monitor-eyebrow">
            BLINKLY / YOUR SESSION
          </span>

          <h2>Eye comfort, in focus.</h2>
        </div>

        <span className="privacy-badge">
          On-device monitoring
        </span>
      </header>

      <div className="session-banner">
        <span>
          {status === 'RUNNING'
            ? 'Active Monitoring'
            : status === 'ERROR'
              ? 'Monitoring unavailable'
              : 'Starting Monitoring...'}
        </span>

        <time aria-label="Session time">{elapsedLabel}</time>
      </div>

      {/* Hidden camera used only for inference. */}
      {/* <video
        ref={videoRef}
        muted
        playsInline
        autoPlay
        aria-hidden="true"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          opacity: 0,
          pointerEvents: 'none',
        }}
      /> */}
      {/* Camera visibility toggle */}
      <div className="preview-toolbar">
        <div>
          <h3>Live Monitoring</h3>
          <p>
            Your camera runs locally for blink and hand tracking.
          </p>
        </div>

        <button
          type="button"
          className="preview-toggle"
          onClick={() => setShowPreview(previous => !previous)}
          aria-pressed={showPreview}
        >
          {showPreview ? 'Hide Preview' : 'Show Preview'}
        </button>
      </div>

      {/* Dynamic two-column / full-width layout */}
      <div
        className={
          showPreview
            ? 'monitor-layout monitor-layout--preview'
            : 'monitor-layout monitor-layout--full'
        }
      >
        {/* Keep the video mounted even when hidden.
            MediaPipe uses this same video for inference. */}
        <div
          className={
            showPreview
              ? 'camera-preview-card'
              : 'camera-preview-card camera-preview-card--hidden'
          }
        >
          <div className="camera-preview-heading">
            <h3>Camera Preview</h3>
            <span className="camera-preview-badge">
              {status === 'RUNNING'
                ? 'Camera Active'
                : 'Starting...'}
            </span>
          </div>

          <video
            ref={videoRef}
            muted
            playsInline
            autoPlay
            className="camera-preview-video"
            aria-label="Live webcam preview"
          />

          <p className="camera-preview-note">
            Camera processing stays on your device.
          </p>
        </div>

        <div className="measurements">
          <div className="metric-grid">
            <article className="metric-card">
              <span>Blink rate</span>
              <strong>
                {detection?.blinkRate == null
                  ? '—'
                  : detection.blinkRate.toFixed(1)}
              </strong>
              <small>blinks / min</small>
            </article>

            <article className="metric-card">
              <span>Estimated viewing distance</span>
              <strong>
                {detection?.viewingDistanceCm ?? '—'}
              </strong>
              <small>
                {detection?.viewingDistanceCm != null
                  ? 'cm (estimated)'
                  : calibrationStatus === 'RETRYING'
                    ? 'Retrying calibration...'
                    : 'Calibrating automatically...'}
              </small>
            </article>

            <article className="metric-card">
              <span>Total blinks</span>
              <strong>{totals?.blinks ?? blinkCount}</strong>
              <small>This session</small>
            </article>

            <article className="metric-card">
              <span>Eye state</span>
              <strong className="eye-value">
                {detection?.eyesClosed == null
                  ? 'Unknown'
                  : detection.eyesClosed
                    ? 'Closed'
                    : 'Open'}
              </strong>
              <small>Live eye tracking</small>
            </article>

            <article className="metric-card">
              <span>Hand detected</span>
              <strong className="eye-value">
                {detection?.handDetected
                  ? 'Yes'
                  : 'No'}
              </strong>
              <small>MediaPipe hand tracking</small>
            </article>

            <article className="metric-card">
              <span>Possible eye rubbing</span>
              <strong className="eye-value">
                {detection?.possibleEyeRubbing
                  ? 'Detected'
                  : 'Not detected'}
              </strong>
              <small>
                {totals?.rubbingEvents ?? rubbingCount} possible events
              </small>
            </article>
          </div>

          {detection?.relativeDistanceStatus ===
            'TOO_CLOSE' && (
            <p role="alert">
              You may be sitting too close to
              the screen. Consider moving back.
            </p>
          )}

          <article className="brightness-card">
            <div>
              <span>Current screen brightness</span>

              <strong>
                {brightness?.supported &&
                Number.isFinite(brightness.value)
                  ? `${brightness.value}%`
                  : 'Unavailable'}
              </strong>
            </div>

            {brightness?.supported &&
              Number.isFinite(brightness.value) && (
                <progress
                  max="100"
                  value={brightness.value}
                  aria-label="Current brightness"
                />
              )}
          </article>

          <p className="monitor-note">
            Viewing distance is an approximate
            camera-based estimate, not a precise
            physical measurement.
          </p>
        </div>
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}

      <div className="session-actions">
        <button
          className="button button--quiet"
          disabled={pending || status !== 'RUNNING'}
          onClick={onTakeBreak}
          type="button"
        >
          Take a break
        </button>
        <button
          className="end-session"
          disabled={pending}
          onClick={() => setConfirmingStop(true)}
          type="button"
        >
          End Session
        </button>
      </div>

      {confirmingStop && !pending && (
        <EndSessionDialog
          onCancel={() => setConfirmingStop(false)}
          onConfirm={() => {
            setConfirmingStop(false);
            stoppedRef.current = true;
            onStop?.();
          }}
        />
      )}
    </section>
  );
}
