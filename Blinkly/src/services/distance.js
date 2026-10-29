
/**
 * Dev 4 — Estimated physical viewing distance.
 *
 * Monocular webcam approximation:
 * distance = realFaceWidth * focalLength / imageFaceWidth
 *
 * Assumptions MUST be calibrated for better accuracy.
 */

const LEFT = 234;
const RIGHT = 454;

export function getFaceWidth(
  faceLandmarks,
  imageWidth = 640,
  imageHeight = 480
) {
  const a = faceLandmarks?.[LEFT];
  const b = faceLandmarks?.[RIGHT];

  if (
    !a || !b ||
    !Number.isFinite(a.x) ||
    !Number.isFinite(a.y) ||
    !Number.isFinite(b.x) ||
    !Number.isFinite(b.y) ||
    imageWidth <= 0 ||
    imageHeight <= 0
  ) {
    return null;
  }

  return Math.hypot(
    (a.x - b.x) * imageWidth,
    (a.y - b.y) * imageHeight
  ) || null;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

export class DistanceDetector {
  constructor({
    // Provisional estimates; not calibrated camera specifications.
    faceWidthCm = 15,
    horizontalFovDegrees = 60,

    // Warning threshold (estimated camera-to-face distance).
    tooCloseCm = 45,
    recoveryCm = 50,

    holdMs = 700,
    smoothing = 0.25,
    minimumSamples = 12,
  } = {}) {
    if (
      faceWidthCm <= 0 ||
      horizontalFovDegrees <= 0 ||
      horizontalFovDegrees >= 180 ||
      tooCloseCm <= 0 ||
      recoveryCm <= tooCloseCm ||
      holdMs < 0 ||
      smoothing <= 0 ||
      smoothing > 1 ||
      !Number.isInteger(minimumSamples) ||
      minimumSamples < 2
    ) {
      throw new Error('Invalid distance detector configuration');
    }

    Object.assign(this, {
      faceWidthCm,
      horizontalFovDegrees,
      tooCloseCm,
      recoveryCm,
      holdMs,
      smoothing,
      minimumSamples,
    });

    this.reset();
  }

  reset() {
    this.baselineWidth = null;
    this.baselineDistanceCm = null;
    this.smoothedDistanceCm = null;
    this.status = 'UNKNOWN';
    this.pendingStatus = null;
    this.pendingSince = null;
    this.lastTimestamp = null;
  }

  getFocalLengthPx(imageWidth) {
    const radians =
      this.horizontalFovDegrees * Math.PI / 180;

    return imageWidth / (2 * Math.tan(radians / 2));
  }

  estimateDistanceCm(
    faceLandmarks,
    imageWidth = 640,
    imageHeight = 480
  ) {
    const widthPx = getFaceWidth(
      faceLandmarks,
      imageWidth,
      imageHeight
    );

    if (widthPx === null) return null;

    return (
      this.faceWidthCm *
      this.getFocalLengthPx(imageWidth)
    ) / widthPx;
  }

  /**
   * Save baseline only when enough stable samples exist.
   * Reject missing or inconsistent face measurements.
   */
  calibrate(
    samples,
    {
      imageWidth = 640,
      imageHeight = 480,
    } = {}
  ) {
    if (!Array.isArray(samples)) return false;

    const widths = samples.map(face =>
      getFaceWidth(face, imageWidth, imageHeight)
    );

    // Require all collected frames to contain a valid face.
    if (
      widths.length < this.minimumSamples ||
      widths.some(width => width === null)
    ) {
      return false;
    }

    const baselineWidth = median(widths);

    const averageDeviation =
      widths.reduce(
        (sum, width) =>
          sum + Math.abs(width - baselineWidth),
        0
      ) / widths.length;

    const deviationRatio =
      averageDeviation / baselineWidth;

    // Reject moving / inconsistent measurements.
    if (deviationRatio > 0.04) {
      return false;
    }

    const focalLength =
      this.getFocalLengthPx(imageWidth);

    this.baselineWidth = baselineWidth;
    this.baselineDistanceCm =
      this.faceWidthCm * focalLength / baselineWidth;

    this.smoothedDistanceCm =
      this.baselineDistanceCm;

    this.status = this.baselineDistanceCm < this.tooCloseCm
      ? 'TOO_CLOSE'
      : 'OK';

    this.pendingStatus = null;
    this.pendingSince = null;
    this.lastTimestamp = null;

    return true;
  }

  update({
    faceLandmarks,
    timestampMs = Date.now(),
    imageWidth = 640,
    imageHeight = 480,
  } = {}) {
    const unavailable = {
      viewingDistanceCm: null,
      relativeDistanceStatus: 'UNKNOWN',
    };

    if (
      this.baselineWidth === null ||
      !Number.isFinite(timestampMs)
    ) {
      return unavailable;
    }

    const estimatedCm = this.estimateDistanceCm(
      faceLandmarks,
      imageWidth,
      imageHeight
    );

    if (
      estimatedCm === null ||
      !Number.isFinite(estimatedCm)
    ) {
      this.pendingStatus = null;
      this.pendingSince = null;
      this.smoothedDistanceCm = null;
      return unavailable;
    }

    if (
      this.lastTimestamp !== null &&
      timestampMs < this.lastTimestamp
    ) {
      this.pendingStatus = null;
      this.pendingSince = null;
    }

    this.lastTimestamp = timestampMs;

    this.smoothedDistanceCm =
      this.smoothedDistanceCm === null
        ? estimatedCm
        : this.smoothing * estimatedCm +
          (1 - this.smoothing) * this.smoothedDistanceCm;

    const distanceCm = this.smoothedDistanceCm;

    const targetStatus =
      this.status === 'TOO_CLOSE'
        ? distanceCm >= this.recoveryCm
          ? 'OK'
          : 'TOO_CLOSE'
        : distanceCm < this.tooCloseCm
          ? 'TOO_CLOSE'
          : 'OK';

    if (targetStatus === this.status) {
      this.pendingStatus = null;
      this.pendingSince = null;
    } else {
      if (this.pendingStatus !== targetStatus) {
        this.pendingStatus = targetStatus;
        this.pendingSince = timestampMs;
      }

      if (
        timestampMs - this.pendingSince >= this.holdMs
      ) {
        this.status = targetStatus;
        this.pendingStatus = null;
        this.pendingSince = null;
      }
    }

    return {
      viewingDistanceCm: Math.round(distanceCm),
      relativeDistanceStatus: this.status,
    };
  }
}
