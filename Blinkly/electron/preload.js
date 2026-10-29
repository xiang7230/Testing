const { contextBridge, ipcRenderer } = require('electron');
// Explicit allowlist only: NEVER expose ipcRenderer or raw SQL to React.
contextBridge.exposeInMainWorld('Blinkly', {
  getAppInfo: () => ipcRenderer.invoke('app:getInfo'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  createSession: (data) => ipcRenderer.invoke('sessions:create', data),
  updateSession: (id,changes) => ipcRenderer.invoke('sessions:update',id,changes),
  completeSession: (id,summary) => ipcRenderer.invoke('sessions:complete',id,summary),
  saveEvent: (id,event) => ipcRenderer.invoke('events:save',id,event),
  saveMeasurements: (id,measurements) => ipcRenderer.invoke('measurements:save',id,measurements),
  getSessions: () => ipcRenderer.invoke('sessions:list'),
  getSessionDetails: (id) => ipcRenderer.invoke('sessions:details',id),
  deleteSession: (id) => ipcRenderer.invoke('sessions:delete',id),
  showNotification: (data) => ipcRenderer.invoke('system:notify',data),
  getBrightness: () => ipcRenderer.invoke('brightness:get'),
  setBrightness: (value) => ipcRenderer.invoke('brightness:set',value),
});
