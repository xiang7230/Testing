const ERROR_MESSAGES = {
  NotAllowedError: 'Camera permission was denied. Allow camera access in your system settings and try again.',
  NotFoundError: 'No webcam was found. Connect a camera and try again.',
  NotReadableError: 'The webcam could not be opened. Close other apps using it and try again.',
  OverconstrainedError: 'The webcam does not support the requested video settings.',
};

// A factory allows tests to supply a fake camera without accessing real hardware.
export function createCameraService({
  getUserMedia = (constraints) => {
    if (!globalThis.navigator?.mediaDevices?.getUserMedia) {
      throw new Error('Camera access is unavailable in this environment.');
    }
    return navigator.mediaDevices.getUserMedia(constraints);
  },
} = {}) {
  let stream = null;
  let pending = null;
  let generation = 0;

  function getStream() {
    return stream?.getVideoTracks().some((track) => track.readyState === 'live')
      ? stream
      : null;
  }

  function stop() {
    generation += 1;
    pending = null;
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
  }

// start() returns a Promise that resolves to a MediaStream. It may reject if the user denies permission, if no camera is available, or if the camera cannot be opened. If start() is called while a previous start() is still pending, it will return the same Promise. If start() is called after stop(), it will request a new camera stream.
  function start() {
    const existing = getStream();
    if (existing) return Promise.resolve(existing);
    if (pending) return pending;
    // Release any remaining tracks from a disconnected stream.
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    const requestGeneration = generation;
    const request = Promise.resolve()
      .then(() => getUserMedia({ audio: false, video: { facingMode: 'user' } }))
      .then((openedStream) => {
        if (requestGeneration !== generation) {
          openedStream.getTracks().forEach((track) => track.stop());
          throw new Error('Camera start was cancelled.');
        }
        stream = openedStream;
        return stream;
      })
      .catch((error) => {
        throw new Error(ERROR_MESSAGES[error.name] ?? error.message ?? 'Unable to start the webcam.', {
          cause: error,
        });
      })
      .finally(() => {
        if (pending === request) pending = null;
      });
    pending = request;
    return request;
  }

  return { start, stop, getStream };
}

// Dev 3 and Dev 4 must import this same instance to share one webcam stream.
export const camera = createCameraService();
