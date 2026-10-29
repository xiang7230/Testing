import test from 'node:test';
import assert from 'node:assert/strict';
import { createFaceTracker } from '../src/services/faceTracking.js';

const video = () => ({
  readyState: 2,
  videoWidth: 640,
  videoHeight: 480,
  currentTime: 1,
});

test('reports real face results, skips duplicate frames and clears missing face', async () => {
  let faces = [[{ x: 0.5, y: 0.5, z: 0 }]];
  let calls = 0;
  let closed = false;
  const tracker = createFaceTracker({
    createLandmarker: async () => ({
      detectForVideo: () => {
        calls++;
        return { faceLandmarks: faces };
      },
      close: () => {
        closed = true;
      },
    }),
  });
  await tracker.initialize();
  const frame = video();
  const result = tracker.detect(frame, 10, 1000);
  assert.equal(result.detection.faceDetected, true);
  assert.equal(result.detection.source, 'real');
  assert.equal(result.detection.blinkRate, null);
  assert.equal(result.landmarks.length, 1);
  assert.equal(tracker.detect(frame, 11), null);
  faces = [];
  frame.currentTime++;
  const missing = tracker.detect(frame, 12);
  assert.deepEqual(missing.landmarks, []);
  assert.equal(missing.detection.trackingAvailable, false);
  assert.equal(calls, 2);
  tracker.stop();
  assert.equal(closed, true);
});

test('stopping during model loading closes the late model', async () => {
  let resolve;
  let closed = false;
  const tracker = createFaceTracker({
    createLandmarker: () =>
      new Promise((r) => {
        resolve = r;
      }),
  });
  const pending = tracker.initialize();
  assert.equal(tracker.initialize(), pending);
  await Promise.resolve();
  tracker.stop();
  resolve({
    close: () => {
      closed = true;
    },
  });
  await assert.rejects(pending, /cancelled/);
  assert.equal(closed, true);
});

test('failed initialization can be retried and unready frames are ignored', async () => {
  let fail = true;
  const tracker = createFaceTracker({
    createLandmarker: async () => {
      if (fail) throw new Error('Model unavailable');
      return {
        close() {},
        detectForVideo() {
          throw new Error('Should not detect');
        },
      };
    },
  });
  await assert.rejects(tracker.initialize(), /Model unavailable/);
  fail = false;
  await tracker.initialize();
  assert.equal(tracker.detect({ ...video(), readyState: 0 }), null);
  tracker.stop();
});