import { createMockDetection } from '../services/mockDetection.mjs';

const sample = {
  detection: createMockDetection({ timestamp: 0, viewingDistanceCm: 25 }),
  currentBrightness: 60,
  elapsedSeconds: 125,
  monitoringError: '',
};

// Only the preview imports these fixtures. Real monitoring supplies BlinklyApp props.
export const previewFixtures = {
  IDLE: { ...sample, monitoringState: 'IDLE', elapsedSeconds: 0 },
  STARTING: { ...sample, monitoringState: 'STARTING', elapsedSeconds: 0 },
  MONITORING: { ...sample, monitoringState: 'MONITORING' },
  ON_BREAK: { ...sample, monitoringState: 'ON_BREAK' },
  ERROR: {
    ...sample,
    monitoringState: 'ERROR',
    monitoringError:
      'Camera access was denied. Allow camera access in your device settings, then try again.',
  },
  COMPLETED: { ...sample, monitoringState: 'COMPLETED', elapsedSeconds: 0 },
  MISSING_DATA: {
    ...sample,
    monitoringState: 'MONITORING',
    currentBrightness: null,
    detection: createMockDetection({
      timestamp: 0,
      faceDetected: false,
      trackingAvailable: false,
      blinkRate: null,
    }),
  },
};
