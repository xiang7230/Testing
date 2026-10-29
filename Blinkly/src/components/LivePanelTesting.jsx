
import { useEffect, useRef, useState } from 'react';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

import { camera } from '../services/camera.js';
import { MEDIAPIPE_PATHS } from '../services/mediapipeAssets.mjs';
import { HandTracker } from '../services/handTracking.js';
import { EyeRubbingDetector } from '../services/eyeRubbing.js';
import { DistanceDetector } from '../services/distance.js';
import { validateDetection } from '../contracts/detection.mjs';

export default function LivePanelTesting() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const runtimeRef = useRef(null);
  const runningRef = useRef(false);

  const calibrationRef = useRef(null);
  const [calibrationProgress, setCalibrationProgress] =
  useState(0);

  const [status, setStatus] = useState('STOPPED');
  const [error, setError] = useState('');
  const [detection, setDetection] = useState(null);
  const [calibrated, setCalibrated] = useState(false);

  function stop() {
    runningRef.current = false;

    calibrationRef.current = null;
    setCalibrationProgress(0);
    setCalibrated(false);

    const runtime = runtimeRef.current;
    runtimeRef.current = null;

    if (runtime) {
      cancelAnimationFrame(runtime.frameId);
      runtime.handTracker.close();
      runtime.faceTracker.close();
    }

    camera.stop();

    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }

    setStatus('STOPPED');
    setDetection(null);
    setCalibrated(false);
  }

  useEffect(() => {
    return () => {
      runningRef.current = false;

      const runtime = runtimeRef.current;
      runtimeRef.current = null;

      if (runtime) {
        cancelAnimationFrame(runtime.frameId);
        runtime.handTracker.close();
        runtime.faceTracker.close();
      }

      camera.stop();
    };
  }, []);

  async function start() {
    if (runningRef.current) return;

    runningRef.current = true;
    setStatus('STARTING');
    setError('');

    let handTracker = null;
    let faceTracker = null;

    try {
      const stream = await camera.start();

      if (!runningRef.current) return;

      const video = videoRef.current;
      video.srcObject = stream;
      await video.play();

      if (!runningRef.current) return;

      const vision = await FilesetResolver.forVisionTasks(
        MEDIAPIPE_PATHS.wasm
      );

      faceTracker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MEDIAPIPE_PATHS.faceModel,
          delegate: 'CPU',
        },
        runningMode: 'VIDEO',
        numFaces: 1,
      });

      handTracker = new HandTracker();
      await handTracker.initialize();

      if (!runningRef.current) {
        handTracker.close();
        faceTracker.close();
        return;
      }

      const runtime = {
        handTracker,
        faceTracker,
        rubbing: new EyeRubbingDetector(),
        distance: new DistanceDetector({
            faceWidthCm: 15,
            horizontalFovDegrees: 60,
            tooCloseCm: 45,
            recoveryCm: 50,
        }),
        lastFace: null,
        lastProcessed: -1,
        frameId: null,
    };

      runtimeRef.current = runtime;
      // Automatic calibration begins when AI monitoring starts.
    calibrationRef.current = {
    startedAt: null,
    samples: [],
    };

    setCalibrated(false);
    setCalibrationProgress(0);
      setStatus('RUNNING');

      function processFrame(timestamp) {
        if (!runningRef.current || runtimeRef.current !== runtime) {
          return;
        }

        runtime.frameId = requestAnimationFrame(processFrame);

        // Process at approximately 10 FPS.
        if (timestamp - runtime.lastProcessed < 100) return;

        const video = videoRef.current;
        if (!video || video.readyState < 2) return;

        runtime.lastProcessed = timestamp;

        try {
          const faceResult = runtime.faceTracker.detectForVideo(
            video,
            timestamp
          );

          const faceLandmarks = faceResult.faceLandmarks?.[0] ?? null;

          const handResult = runtime.handTracker.detect(
            video,
            timestamp
          );

          runtime.lastFace = faceLandmarks;

          // Collect baseline measurements for approximately 2 seconds.
        // Automatic distance baseline calibration.
        const calibration = calibrationRef.current;

        if (calibration) {
        if (calibration.startedAt === null) {
            calibration.startedAt = timestamp;
        }

        const elapsed = timestamp - calibration.startedAt;

        if (faceLandmarks) {
            calibration.samples.push(faceLandmarks);
        }

        setCalibrationProgress(
            Math.min(100, Math.round(elapsed / 2000 * 100))
        );

        if (elapsed >= 2000) {
            const expectedFrames =
            Math.max(1, Math.floor(elapsed / 100));

            // Reject the sample if face tracking was frequently lost.
            const enoughFrames =
            calibration.samples.length >=
            Math.max(12, Math.floor(expectedFrames * 0.75));

            const success =
            enoughFrames &&
            runtime.distance.calibrate(
                calibration.samples,
                {
                imageWidth: video.videoWidth,
                imageHeight: video.videoHeight,
                }
            );

            if (success) {
            calibrationRef.current = null;
            setCalibrated(true);
            setCalibrationProgress(100);
            setError('');
            } else {
            // Restart the calibration window automatically.
            calibration.startedAt = timestamp;
            calibration.samples = [];
            setCalibrationProgress(0);
            setCalibrated(false);
            }
        }
        }

          const common = {
            faceLandmarks,
            timestampMs: timestamp,
            imageWidth: video.videoWidth,
            imageHeight: video.videoHeight,
          };

          const rubbingResult = runtime.rubbing.update({
            ...common,
            hands: handResult.hands,
          });

          const distanceResult = runtime.distance.update(common);

          const output = validateDetection({
            timestamp: Date.now(),
            faceDetected: Boolean(faceLandmarks),
            handDetected: handResult.handDetected,
            blinkRate: null,
            eyesClosed: null,
            eyeClosureDurationMs: null,
            ...rubbingResult,
            ...distanceResult,
            trackingAvailable: true,
            source: 'real',
          });

          setDetection(output);

          // Draw hand landmarks for debugging.
          const canvas = canvasRef.current;
          if (canvas) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;

            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            ctx.fillStyle = '#b99aff';

            for (const hand of handResult.hands) {
              for (const point of hand.landmarks) {
                ctx.beginPath();
                ctx.arc(
                  point.x * canvas.width,
                  point.y * canvas.height,
                  4,
                  0,
                  Math.PI * 2
                );
                ctx.fill();
              }
            }
          }
        } catch (err) {
          runningRef.current = false;
          setError(err.message || 'Detection failed.');
          setStatus('ERROR');
        }
      }

      runtime.frameId = requestAnimationFrame(processFrame);
    } catch (err) {
      runningRef.current = false;

      handTracker?.close();
      faceTracker?.close();

      setError(err.message || 'Unable to start AI tracking.');
      setStatus('ERROR');
      camera.stop();
    }
  }

  function calibrateDistance() {
    const runtime = runtimeRef.current;

    if (!runtime || !runtime.lastFace) {
        setError(
        'Face not detected. Look towards the camera.'
        );
        return;
    }

    setError('');
    setCalibrated(false);
    setCalibrationProgress(0);

    // Reset previous calibration.
    runtime.distance.reset();

    calibrationRef.current = {
        startedAt: performance.now(),
        samples: [],
    };
}

  return (
    <section style={{
      padding: 20,
      marginTop: 24,
      border: '2px solid #c9c4ee',
      borderRadius: 16,
      background: 'white',
    }}>
      <h2>Dev 4 — Live AI Detection</h2>

      <p>
        Webcam processing runs locally. Distance uses
        relative face size, not physical centimetres.
      </p>

      <div style={{
        position: 'relative',
        width: '100%',
        maxWidth: 540,
        background: '#192336',
      }}>
        <video
          ref={videoRef}
          muted
          autoPlay
          playsInline
          style={{
            display: 'block',
            width: '100%',
            transform: 'scaleX(-1)',
          }}
        />

        <canvas
          ref={canvasRef}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            transform: 'scaleX(-1)',
            pointerEvents: 'none',
          }}
        />
      </div>

      <p>Tracking status: <strong>{status}</strong></p>

      <div style={{
        display: 'flex',
        gap: 10,
        flexWrap: 'wrap',
        marginBottom: 20,
      }}>
        <button
          onClick={start}
          disabled={status === 'RUNNING' || status === 'STARTING'}
        >
          Start AI Detection
        </button>

        <button
          onClick={stop}
          disabled={status === 'STOPPED'}
        >
          Stop AI Detection
        </button>
        </div>
            {calibrationProgress > 0 && calibrationProgress < 100 && (
        <div style={{ width: '100%', marginTop: 12 }}>
            <p>Calibrating distance... {calibrationProgress}%</p>

            <progress
            max="100"
            value={calibrationProgress}
            style={{ width: '100%' }}
            />
        </div>
        )}

      {error && (
        <p role="alert" style={{ color: '#bd4f5e' }}>
          {error}
        </p>
      )}

      <div aria-live="polite" style={{ lineHeight: 2 }}>
        <div>
          Face detected: <strong>
            {detection?.faceDetected ? 'YES' : 'NO'}
          </strong>
        </div>

        <div>
          Hand detected: <strong>
            {detection?.handDetected ? 'YES' : 'NO'}
          </strong>
        </div>

        <div>
          Possible eye rubbing: <strong>
            {detection?.possibleEyeRubbing ? 'YES' : 'NO'}
          </strong>
        </div>

        <div>
          Rubbing event ID: <strong>
            {detection?.rubbingEventId ?? 'None'}
          </strong>
        </div>

        <div>
          Distance calibrated: <strong>
            {calibrated ? 'YES' : 'NO'}
          </strong>
        </div>

        <div>
          Relative distance: <strong>
            {detection?.relativeDistanceStatus ?? 'UNKNOWN'}
          </strong>
        </div>
      </div>
    </section>
  );
}
