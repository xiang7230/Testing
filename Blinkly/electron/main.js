import { app, BrowserWindow, ipcMain, Notification } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import {
  initializeDatabase, closeDatabase, getSettings, saveSettings,
  createSession, updateSession, completeSession, saveEvent, saveMeasurements,
  getSessions, getSessionDetails, deleteSession,
} from './database.js';
import { getBrightness, setBrightness } from './brightness.js';
import { IPC_CHANNELS } from '../src/contracts/ipc.mjs';

if (started) app.quit();

function registerHandlers() {
  const handler=(name,fn)=>ipcMain.handle(IPC_CHANNELS[name],(_event,...args)=>fn(...args));
  handler('getAppInfo',()=>({name:'Blinkly',version:app.getVersion()}));
  handler('getSettings',getSettings);
  handler('saveSettings',saveSettings);
  handler('createSession',createSession);
  handler('updateSession',updateSession);
  handler('completeSession',completeSession);
  handler('saveEvent',saveEvent);
  handler('saveMeasurements',saveMeasurements);
  handler('getSessions',getSessions);
  handler('getSessionDetails',getSessionDetails);
  handler('deleteSession',deleteSession);
  handler('showNotification',(payload)=>{
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('notification must be an object');
    const {title,body}=payload;
    if (typeof title!=='string' || !title.trim() || title.length>100 || typeof body!=='string' || body.length>500) throw new Error('Invalid notification title/body');
    if (!Notification.isSupported()) return {supported:false,shown:false};
    new Notification({title,body}).show();
    return {supported:true,shown:true};
  });
  handler('getBrightness',getBrightness);
  handler('setBrightness',setBrightness);
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1050, height: 760, minWidth: 760, minHeight: 540,
    webPreferences: {
      preload: path.join(__dirname,'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname,`../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }
}

app.whenReady().then(()=>{
  initializeDatabase();
  registerHandlers();
  createWindow();
  app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0) createWindow();});
});
app.on('before-quit',closeDatabase);
app.on('window-all-closed',()=>{if(process.platform!=='darwin') app.quit();});
