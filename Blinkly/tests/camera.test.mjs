import test from 'node:test';
import assert from 'node:assert/strict';
import { createCameraService } from '../src/services/camera.js';

function fakeStream() {
  const track = { readyState: 'live', stop() { this.readyState = 'ended'; } };
  return { getTracks: () => [track], getVideoTracks: () => [track] };
}

test('concurrent callers share one video-only request and stop releases it', async () => {
  let calls = 0;
  const stream = fakeStream();
  const camera = createCameraService({ getUserMedia: async (constraints) => {
    calls += 1;
    assert.equal(constraints.audio, false);
    return stream;
  } });
  const [first, second] = await Promise.all([camera.start(), camera.start()]);
  assert.equal(first, second);
  assert.equal(await camera.start(), stream);
  assert.equal(calls, 1);
  camera.stop();
  camera.stop();
  assert.equal(stream.getTracks()[0].readyState, 'ended');
  assert.equal(camera.getStream(), null);
});

test('stopping during permission request releases a late stream', async () => {
  let resolveRequest;
  const stream = fakeStream();
  const camera = createCameraService({ getUserMedia: () => new Promise((resolve) => {
    resolveRequest = resolve;
  }) });
  const pending = camera.start();
  await Promise.resolve();
  camera.stop();
  resolveRequest(stream);
  await assert.rejects(pending, /cancelled/);
  assert.equal(stream.getTracks()[0].readyState, 'ended');
  assert.equal(camera.getStream(), null);
});

for (const [name, message] of [
  ['NotAllowedError', /permission was denied/],
  ['NotFoundError', /No webcam/],
  ['NotReadableError', /Close other apps/],
]) {
  test(`${name} is explained and start can be retried`, async () => {
    let fail = true;
    const stream = fakeStream();
    const camera = createCameraService({ getUserMedia: async () => {
      if (fail) throw Object.assign(new Error('Device error'), { name });
      return stream;
    } });
    await assert.rejects(camera.start(), message);
    fail = false;
    assert.equal(await camera.start(), stream);
    camera.stop();
  });
}

test('camera can restart after stopping', async () => {
  const camera = createCameraService({ getUserMedia: async () => fakeStream() });
  const first = await camera.start();
  camera.stop();
  const second = await camera.start();
  assert.notEqual(first, second);
  assert.equal(camera.getStream(), second);
  camera.stop();
});
