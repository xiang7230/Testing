// Landmarks stay separate from the shared detection contract for Dev 4 to consume.
import { validateDetection } from '../contracts/detection.mjs';

async function loadLandmarker() {
  const [{ FaceLandmarker, FilesetResolver }, { MEDIAPIPE_PATHS }] =
    await Promise.all([
      import('@mediapipe/tasks-vision'),
      import('./mediapipeAssets.mjs'),
    ]);
  const files = await FilesetResolver.forVisionTasks(MEDIAPIPE_PATHS.wasm);
  return FaceLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetPath: MEDIAPIPE_PATHS.faceModel },
    runningMode: 'VIDEO',
    numFaces: 1,
  });
}

export function createFaceTracker({ createLandmarker = loadLandmarker } = {}) {
  let model = null;
  let pending = null;
  let generation = 0;
  let lastVideoTime = -1;
  let lastTimestamp = -1;

  function stop() {
    generation += 1;
    pending = null;
    model?.close();
    model = null;
    lastVideoTime = -1;
    lastTimestamp = -1;
  }

  function initialize() {
    if (model) return Promise.resolve();
    if (pending) return pending;
    const current = generation;
    const request = Promise.resolve()
      .then(createLandmarker)
      .then((loaded) => {
        if (current !== generation) {
          loaded.close();
          throw new Error('Face tracking start was cancelled.');
        }
        model = loaded;
      })
      .finally(() => {
        if (pending === request) pending = null;
      });
    pending = request;
    return request;
  }

  // Caller owns the frame loop and camera. Repeated/not-ready frames return null.
  function detect(
    video,
    frameTimestamp = performance.now(),
    timestamp = Date.now(),
  ) {
    if (!model)
      throw new Error('Initialize face tracking before detecting frames.');
    if (
      video.readyState < 2 ||
      !video.videoWidth ||
      !video.videoHeight ||
      video.currentTime === lastVideoTime
    )
      return null;
    if (!Number.isFinite(frameTimestamp) || frameTimestamp <= lastTimestamp)
      return null;
    const result = model.detectForVideo(video, frameTimestamp);
    lastVideoTime = video.currentTime;
    lastTimestamp = frameTimestamp;
    const landmarks = result.faceLandmarks[0] ?? [];
    return {
      landmarks,
      detection: validateDetection({
        timestamp,
        faceDetected: landmarks.length > 0,
        trackingAvailable: landmarks.length > 0,
        source: 'real',
      }),
    };
  }

  return { initialize, detect, stop };
}

export const faceTracker = createFaceTracker();