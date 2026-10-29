// Dev 3/4 use these shared, production-relative URLs.
// Their availability in file:// packaged builds must be tested on Windows.
const base = new URL(import.meta.env.BASE_URL, document.baseURI);
export const MEDIAPIPE_PATHS = Object.freeze({
  wasm: new URL('wasm',base).href,
  faceModel: new URL('models/face_landmarker.task',base).href,
  handModel: new URL('models/hand_landmarker.task',base).href,
});
