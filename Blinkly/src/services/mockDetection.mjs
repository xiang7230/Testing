import { validateDetection } from '../contracts/detection.mjs';
// Dev 3/4 can use this exact object before webcam inference is integrated.
export function createMockDetection(overrides={}) {
  return validateDetection({
    timestamp: Date.now(), faceDetected:true, handDetected:false,
    blinkRate:12, eyesClosed:false, eyeClosureDurationMs:0,
    possibleEyeRubbing:false, rubbingEventId:null,
    viewingDistanceCm:null, relativeDistanceStatus:'UNKNOWN',
    trackingAvailable:true, source:'simulated', ...overrides,
  });
}
