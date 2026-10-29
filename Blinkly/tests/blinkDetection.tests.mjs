import test from 'node:test';
import assert from 'node:assert/strict';
import { createBlinkDetector } from '../src/services/blinkDetection.js';

function face(ratio) {
  const landmarks = [];
  for (const indices of [
    [33, 160, 158, 133, 153, 144],
    [362, 385, 387, 263, 373, 380],
  ]) {
    const points = [
      [0, 0],
      [0.3, -ratio / 2],
      [0.7, -ratio / 2],
      [1, 0],
      [0.7, ratio / 2],
      [0.3, ratio / 2],
    ];
    indices.forEach((index, i) => {
      landmarks[index] = { x: points[i][0], y: points[i][1] };
    });
  }
  return landmarks;
}
function setup() {
  const detector = createBlinkDetector();
  return {
    detector,
    frame: (time, ratio) =>
      detector.update({
        timestamp: time,
        landmarks: ratio === null ? [] : face(ratio),
        width: 100,
        height: 100,
      }),
  };
}

test('counts open-closed-open once and rejects brief noise', () => {
  const { frame } = setup();
  frame(0, 0.3);
  frame(100, 0.1);
  assert.equal(frame(200, 0.1).eyeClosureDurationMs, 100);
  assert.equal(frame(250, 0.3).blinkCount, 1);
  assert.equal(frame(300, 0.3).blinkCount, 1);
  frame(400, 0.1);
  assert.equal(frame(420, 0.3).blinkCount, 1);
});

test('long closure is reported without counting repeated blinks', () => {
  const { frame } = setup();
  frame(0, 0.3);
  frame(100, 0.1);
  for (let time = 200; time <= 1100; time += 100) {
    const result = frame(time, 0.1);
    assert.equal(result.blinkCount, 0);
    assert.equal(result.eyeClosureDurationMs, time - 100);
  }
  assert.equal(frame(1200, 0.3).blinkCount, 0);
});

test('face loss, tracking gap and initial closed eyes do not create blinks', () => {
  const { frame } = setup();
  frame(0, 0.1);
  assert.equal(frame(100, 0.3).blinkCount, 0);
  frame(200, 0.1);
  assert.equal(frame(250, null).eyesClosed, null);
  assert.equal(frame(300, 0.3).blinkCount, 0);
  frame(400, 0.1);
  assert.equal(frame(1000, 0.3).blinkCount, 0);
});

test('rate warms up, expires old blinks, and reset clears count', () => {
  const { detector, frame } = setup();
  assert.equal(frame(0, 0.3).blinkRate, null);
  frame(100, 0.1);
  frame(200, 0.3);
  for (let time = 500; time <= 10000; time += 500) frame(time, 0.3);
  assert.equal(frame(10100, 0.3).blinkRate, 60000 / 10100);
  for (let time = 10500; time <= 61000; time += 500) frame(time, 0.3);
  assert.equal(frame(61100, 0.3).blinkRate, 0);
  detector.reset();
  assert.equal(frame(0, 0.3).blinkCount, 0);
});