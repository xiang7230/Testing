
/**
 * Dev 4 — Possible Eye Rubbing Detection
 *
 * Supports:
 * - Single fingertip rubbing
 * - Multiple fingers
 * - Curled hand / knuckles
 * - Horizontal, vertical and circular movement
 *
 * Uses MediaPipe hand and face landmarks.
 * Detection is heuristic, not a medical diagnosis.
 */

export const LEFT_EYE = [33, 133, 159, 145, 160, 144, 158, 153];
export const RIGHT_EYE = [362, 263, 386, 374, 385, 380, 387, 373];

const FINGERTIPS = [4, 8, 12, 16, 20];
const KNUCKLES = [5, 9, 13, 17];
const MIDDLE_JOINTS = [6, 10, 14, 18];

function valid(point) {
  return point &&
    Number.isFinite(point.x) &&
    Number.isFinite(point.y);
}

function distance(a, b, aspect = 1) {
  return Math.hypot(
    (a.x - b.x) * aspect,
    a.y - b.y
  );
}

function average(points) {
  return {
    x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
    y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
  };
}

function getEye(face, ids, aspect) {
  if (!Array.isArray(face)) return null;

  const points = ids.map(id => face[id]);
  if (!points.every(valid)) return null;

  const center = average(points);
  const width = distance(face[ids[0]], face[ids[1]], aspect);

  if (width < 0.005) return null;

  return { center, width };
}

/**
 * Finds a hand feature near an eye.
 *
 * For an extended hand, track fingertips.
 * For a curled hand, also track knuckles and middle joints.
 *
 * The returned point is a representative position,
 * rather than always the nearest single fingertip.
 */
export function findFingerNearEye(
  faceLandmarks,
  hands = [],
  aspect = 1,
  threshold = 1.45
) {
  if (
    !Array.isArray(faceLandmarks) ||
    !Array.isArray(hands) ||
    !Number.isFinite(aspect) ||
    aspect <= 0
  ) {
    return null;
  }

  const eyes = [
    getEye(faceLandmarks, LEFT_EYE, aspect),
    getEye(faceLandmarks, RIGHT_EYE, aspect),
  ];

  let best = null;

  for (let eyeIndex = 0; eyeIndex < eyes.length; eyeIndex++) {
    const eye = eyes[eyeIndex];
    if (!eye) continue;

    for (let handIndex = 0; handIndex < hands.length; handIndex++) {
      const landmarks = hands[handIndex]?.landmarks;
      if (!Array.isArray(landmarks)) continue;

      const featureGroups = [
        { type: 'finger', ids: FINGERTIPS },
        { type: 'knuckle', ids: KNUCKLES },
        { type: 'joint', ids: MIDDLE_JOINTS },
      ];

      for (const group of featureGroups) {
        const nearPoints = group.ids
          .map(id => landmarks[id])
          .filter(valid)
          .filter(point =>
            distance(point, eye.center, aspect) / eye.width
            <= threshold
          );

        if (nearPoints.length === 0) continue;

        const point = average(nearPoints);

        const proximity = distance(
          point,
          eye.center,
          aspect
        ) / eye.width;

        if (!best || proximity < best.distance) {
          best = {
            eyeIndex,
            handIndex,
            type: group.type,
            point,
            distance: proximity,
            eyeWidth: eye.width,
          };
        }
      }
    }
  }

  return best;
}

export class EyeRubbingDetector {
  constructor({
    proximityThreshold = 1.45,
    minimumDurationMs = 550,
    minimumTravel = 0.65,
    minimumDisplacement = 0.28,
    motionThreshold = 0.035,
    cooldownMs = 350,
  } = {}) {
    Object.assign(this, {
      proximityThreshold,
      minimumDurationMs,
      minimumTravel,
      minimumDisplacement,
      motionThreshold,
      cooldownMs,
    });

    this.reset();
  }

  reset() {
    this.startMs = null;
    this.lastNearMs = null;
    this.lastPoint = null;
    this.startPoint = null;
    this.lastKey = null;

    this.travel = 0;
    this.maxDisplacement = 0;
    this.motionFrames = 0;
    this.eventId = null;
    this.sequence = 0;
    this.lastTimestamp = null;
  }

  clearGesture() {
    this.startMs = null;
    this.lastPoint = null;
    this.startPoint = null;
    this.lastKey = null;
    this.travel = 0;
    this.maxDisplacement = 0;
    this.motionFrames = 0;
    this.eventId = null;
    this.lastNearMs = null;
  }

  update({
    faceLandmarks,
    hands = [],
    timestampMs = Date.now(),
    imageWidth = 640,
    imageHeight = 480,
  } = {}) {
    const none = {
      possibleEyeRubbing: false,
      rubbingEventId: null,
    };

    if (
      !Number.isFinite(timestampMs) ||
      imageWidth <= 0 ||
      imageHeight <= 0
    ) {
      this.clearGesture();
      return none;
    }

    if (
      this.lastTimestamp !== null &&
      timestampMs < this.lastTimestamp
    ) {
      this.clearGesture();
    }

    this.lastTimestamp = timestampMs;

    const aspect = imageWidth / imageHeight;

    const near = findFingerNearEye(
      faceLandmarks,
      hands,
      aspect,
      this.proximityThreshold
    );

    if (!near) {
      if (
        this.lastNearMs !== null &&
        timestampMs - this.lastNearMs > this.cooldownMs
      ) {
        this.clearGesture();
      }

      return none;
    }

    // Track the same hand and eye.
    // Do not reset just because the closest fingertip changes.
    const key = `${near.handIndex}-${near.eyeIndex}`;

    const gap = this.lastNearMs === null
      ? Infinity
      : timestampMs - this.lastNearMs;

    if (
      this.startMs === null ||
      this.lastKey !== key ||
      gap > this.cooldownMs
    ) {
      this.startMs = timestampMs;
      this.startPoint = near.point;
      this.lastPoint = near.point;
      this.travel = 0;
      this.maxDisplacement = 0;
      this.motionFrames = 0;
      this.eventId = null;
    } else {
      // Normalize movement by eye width so that
      // distance from the camera affects it less.
      const movement =
        distance(near.point, this.lastPoint, aspect) /
        near.eyeWidth;

      if (movement >= this.motionThreshold) {
        this.travel += movement;
        this.motionFrames += 1;
      }

      const displacement =
        distance(near.point, this.startPoint, aspect) /
        near.eyeWidth;

      this.maxDisplacement = Math.max(
        this.maxDisplacement,
        displacement
      );

      this.lastPoint = near.point;
    }

    this.lastKey = key;
    this.lastNearMs = timestampMs;

    const duration = timestampMs - this.startMs;

    const enoughMovement =
      this.motionFrames >= 3 &&
      this.travel >= this.minimumTravel &&
      (
        this.maxDisplacement >= this.minimumDisplacement ||
        this.travel >= this.minimumTravel * 1.5
      );

    if (
      duration >= this.minimumDurationMs &&
      enoughMovement
    ) {
      if (!this.eventId) {
        this.eventId = `rub-${Math.floor(timestampMs)}-${++this.sequence}`;
      }

      return {
        possibleEyeRubbing: true,
        rubbingEventId: this.eventId,
      };
    }

    // Preserve an existing event throughout the gesture.
    if (this.eventId) {
      return {
        possibleEyeRubbing: true,
        rubbingEventId: this.eventId,
      };
    }

    return none;
  }
}
