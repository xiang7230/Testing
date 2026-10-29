// The exact names used by electron/preload.js and electron/main.js. Do not invent REST routes.
export const IPC_CHANNELS = Object.freeze({
  getAppInfo: 'app:getInfo', getSettings: 'settings:get', saveSettings: 'settings:save',
  createSession: 'sessions:create', updateSession: 'sessions:update', completeSession: 'sessions:complete',
  saveEvent: 'events:save', saveMeasurements: 'measurements:save',
  getSessions: 'sessions:list', getSessionDetails: 'sessions:details', deleteSession: 'sessions:delete',
  showNotification: 'system:notify', getBrightness: 'brightness:get', setBrightness: 'brightness:set',
  isWindowVisible: 'window:is-visible',
  quitApp: 'app:quit',
  prepareQuit: 'app:prepare-quit',
  quitReady: 'app:quit-ready',
});
