// Six eye contour points per eye: corners, upper lid, lower lid.
const EYES = [
  [33, 160, 158, 133, 153, 144],
  [362, 385, 387, 263, 373, 380],
];

export function eyeAspectRatio(landmarks, indices, width, height) {
  const points = indices.map((index) => landmarks[index]);
  if (points.some((p) => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y)))
    return null;
  const distance = (a, b) =>
    Math.hypot((a.x - b.x) * width, (a.y - b.y) * height);
  const horizontal = distance(points[0], points[3]);
  if (horizontal <= 0) return null;
  return (
    (distance(points[1], points[5]) + distance(points[2], points[4])) /
    (2 * horizontal)
  );
}

export function createBlinkDetector({
  closeThreshold = 0.2,
  openThreshold = 0.24,
  minBlinkMs = 50,
  maxBlinkMs = 800,
  maxGapMs = 500,
  windowMs = 60000,
  warmupMs = 10000,
} = {}) {
  let count, state, closedAt, lastTime, observedSince, blinks;
  function reset() {
    count = 0;
    state = null;
    closedAt = null;
    lastTime = null;
    observedSince = null;
    blinks = [];
  }
  reset();

  function update({ landmarks, width, height, timestamp = performance.now() }) {
    if (
      !Number.isFinite(timestamp) ||
      (lastTime !== null && timestamp <= lastTime)
    ) {
      throw new Error('Blink timestamps must increase monotonically.');
    }
    const ratios =
      width > 0 && height > 0
        ? EYES.map((eye) => eyeAspectRatio(landmarks, eye, width, height))
        : [null, null];
    const unavailable = ratios.some((ratio) => ratio === null);
    if (unavailable || (lastTime !== null && timestamp - lastTime > maxGapMs)) {
      state = null;
      closedAt = null;
      observedSince = null;
      blinks = [];
    }
    lastTime = timestamp;
    if (unavailable)
      return {
        blinkCount: count,
        blinkRate: null,
        eyesClosed: null,
        eyeClosureDurationMs: null,
      };
    if (observedSince === null) observedSince = timestamp;
    const closed = ratios.every((ratio) => ratio < closeThreshold);
    const open = ratios.every((ratio) => ratio > openThreshold);
    if (closed && state !== 'closed') {
      // Only an observed open eye can arm a blink; starting closed is not a blink.
      closedAt = { time: timestamp, armed: state === 'open' };
      state = 'closed';
    } else if (open) {
      if (state === 'closed' && closedAt?.armed) {
        const duration = timestamp - closedAt.time;
        if (duration >= minBlinkMs && duration <= maxBlinkMs) {
          count++;
          blinks.push(timestamp);
        }
      }
      state = 'open';
      closedAt = null;
    }
    blinks = blinks.filter((time) => time > timestamp - windowMs);
    const observedMs = Math.min(timestamp - observedSince, windowMs);
    return {
      blinkCount: count,
      blinkRate:
        observedMs >= warmupMs ? (blinks.length * 60000) / observedMs : null,
      eyesClosed: state === null ? null : state === 'closed',
      eyeClosureDurationMs:
        state === null ? null : closedAt ? timestamp - closedAt.time : 0,
    };
  }
  return { update, reset };
}