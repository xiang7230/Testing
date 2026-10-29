export class HandTracker {
  constructor({ maxHands = 2 } = {}) {
    this.maxHands = maxHands;
    this.landmarker = null;
    this.initializing = null;
    this.lastTimestamp = -1;
  }

  async initialize() {
    if (this.landmarker) return;

    if (this.initializing) {
      return this.initializing;
    }

    this.initializing = this.loadModel();

    try {
      await this.initializing;
    } finally {
      this.initializing = null;
    }
  }

  async loadModel() {
    const { MEDIAPIPE_PATHS } =
      await import('./mediapipeAssets.mjs');

    const { FilesetResolver, HandLandmarker } =
      await import('@mediapipe/tasks-vision');

    const vision = await FilesetResolver.forVisionTasks(
      MEDIAPIPE_PATHS.wasm
    );

    this.landmarker = await HandLandmarker.createFromOptions(
      vision,
      {
        baseOptions: {
          modelAssetPath: MEDIAPIPE_PATHS.handModel,
          delegate: 'CPU',
        },

        runningMode: 'VIDEO',
        numHands: this.maxHands,

        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      }
    );
  }

  detect(video, timestampMs = performance.now()) {
    if (!this.landmarker) {
      throw new Error(
        'HandTracker must be initialized before detection.'
      );
    }

    if (
      !video ||
      video.readyState < 2 ||
      !video.videoWidth ||
      !video.videoHeight
    ) {
      return {
        handDetected: false,
        hands: [],
      };
    }

    const timestamp = Math.max(
      timestampMs,
      this.lastTimestamp + 1
    );

    this.lastTimestamp = timestamp;

    const result = this.landmarker.detectForVideo(
      video,
      timestamp
    );

    const hands = (result.landmarks ?? []).map(
      (landmarks, index) => ({
        landmarks,

        handedness:
          result.handedness?.[index]?.[0]?.categoryName ??
          'Unknown',
      })
    );

    return {
      handDetected: hands.length > 0,
      hands,
    };
  }

  close() {
    this.landmarker?.close();
    this.landmarker = null;
    this.lastTimestamp = -1;
  }
}
