// Dev 3/4 -> Dev 5. null = unavailable, not zero. Use source='simulated' for mock data.
export const EMPTY_DETECTION = Object.freeze({
  timestamp: null, faceDetected: false, handDetected: false,
  blinkRate: null, eyesClosed: null, eyeClosureDurationMs: null,
  possibleEyeRubbing: false, rubbingEventId: null,
  viewingDistanceCm: null, relativeDistanceStatus: 'UNKNOWN',
  trackingAvailable: false, source: 'simulated',
});

export function validateDetection(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Detection must be an object');

  const value = { ...EMPTY_DETECTION, ...input };
  const allowedKeys = Object.keys(EMPTY_DETECTION);

  for (const key of Object.keys(input))
    if (!allowedKeys.includes(key))
      throw new Error(`Unknown detection field: ${key}`);

  if (!Number.isFinite(value.timestamp) || value.timestamp < 0)
    throw new Error('timestamp must be a Unix millisecond number');

  for (const field of ['faceDetected', 'handDetected', 'possibleEyeRubbing', 'trackingAvailable'])
    if (typeof value[field] !== 'boolean')
      throw new Error(`${field} must be boolean`);

  if (value.eyesClosed !== null && typeof value.eyesClosed !== 'boolean')
    throw new Error('eyesClosed must be boolean or null');

  for (const field of ['blinkRate', 'eyeClosureDurationMs', 'viewingDistanceCm'])
    if (value[field] !== null && (!Number.isFinite(value[field]) || value[field] < 0))
      throw new Error(`${field} must be nonnegative or null`);

  if (!['UNKNOWN', 'TOO_CLOSE', 'OK'].includes(value.relativeDistanceStatus))
    throw new Error('Invalid distance status');

  if (!['real', 'simulated'].includes(value.source))
    throw new Error('source must be real or simulated');

  if (value.rubbingEventId !== null && typeof value.rubbingEventId !== 'string')
    throw new Error('rubbingEventId must be string or null');

  return value;
}
