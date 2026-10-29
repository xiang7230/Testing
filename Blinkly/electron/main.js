
import {
  app,
  BrowserWindow,
  ipcMain,
  Notification,
  Tray,
  Menu,
  nativeImage,
} from 'electron';

import path from 'node:path';
import started from 'electron-squirrel-startup';

import {
  initializeDatabase,
  closeDatabase,
  getSettings,
  saveSettings,
  createSession,
  updateSession,
  completeSession,
  saveEvent,
  saveMeasurements,
  getSessions,
  getSessionDetails,
  deleteSession,
} from './database.js';

import {
  getBrightness,
  setBrightness,
} from './brightness.js';

import { IPC_CHANNELS } from '../src/contracts/ipc.mjs';

if (started) app.quit();

let mainWindow = null;
let tray = null;
let isQuitting = false;
let quitPromise = null;
const activeNotifications = new Set();


function showBlinkly() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();
}

function createTray() {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'tray.png')
    : path.join(process.cwd(), 'assets', 'tray.png');

  const icon = nativeImage.createFromPath(iconPath);

  if (icon.isEmpty()) {
    throw new Error(`Tray icon unavailable: ${iconPath}`);
  }

  tray = new Tray(icon);
  tray.setToolTip('Blinkly');

  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Open Blinkly',
        click: showBlinkly,
      },
      { type: 'separator' },
      {
        label: 'Quit Blinkly',
        click: () => {
          void requestQuit();
        },
      },
    ]),
  );

  tray.on('double-click', showBlinkly);
}

function requestQuit() {
  if (quitPromise) return quitPromise;

  quitPromise = (async () => {
    const window = mainWindow;

    if (
      window &&
      !window.isDestroyed() &&
      !window.webContents.isDestroyed() &&
      !window.webContents.isLoading()
    ) {
      await new Promise((resolve) => {
        let finished = false;

        function done() {
          if (finished) return;
          finished = true;
          clearTimeout(timeout);
          ipcMain.removeListener(
            IPC_CHANNELS.quitReady,
            onReady,
          );
          resolve();
        }

        function onReady(event) {
          if (event.sender !== window.webContents) return;
          done();
        }

        ipcMain.on(IPC_CHANNELS.quitReady, onReady);

        // Prevent a broken renderer from blocking Quit forever.
        const timeout = setTimeout(done, 8000);

        window.webContents.send(
          IPC_CHANNELS.prepareQuit,
        );
      });
    }

    isQuitting = true;
    app.quit();
  })();

  return quitPromise;
}

function registerHandlers() {
  const handler = (name, fn) =>
    ipcMain.handle(
      IPC_CHANNELS[name],
      (_event, ...args) => fn(...args),
    );

  handler('getAppInfo', () => ({
    name: 'Blinkly',
    version: app.getVersion(),
  }));

  handler('getSettings', getSettings);
  handler('saveSettings', saveSettings);

  handler('createSession', createSession);
  handler('updateSession', updateSession);
  handler('completeSession', completeSession);

  handler('saveEvent', saveEvent);
  handler('saveMeasurements', saveMeasurements);

  handler('getSessions', getSessions);
  handler('getSessionDetails', getSessionDetails);
  handler('deleteSession', deleteSession);

  handler('showNotification', (payload) => {
    if (
      !payload ||
      typeof payload !== 'object' ||
      Array.isArray(payload)
    ) {
      throw new Error('Notification must be an object');
    }

    const { title, body } = payload;

    if (
      typeof title !== 'string' ||
      !title.trim() ||
      title.length > 100 ||
      typeof body !== 'string' ||
      body.length > 500
    ) {
      throw new Error('Invalid notification title/body');
    }

    if (!Notification.isSupported()) {
      return { supported: false, shown: false };
    }


    const notification = new Notification({
      title,
      body,
      silent: true,
    });

    activeNotifications.add(notification);

    notification.on('close', () => {
      activeNotifications.delete(notification);
    });

    notification.on('failed', () => {
      activeNotifications.delete(notification);
    });

    notification.show();

    return {
      supported: true,
      shown: true,
    };

  });

  handler('getBrightness', getBrightness);
  handler('setBrightness', setBrightness);

  handler('isWindowVisible', () => {
    return Boolean(
      mainWindow &&
      !mainWindow.isDestroyed() &&
      mainWindow.isVisible() &&
      !mainWindow.isMinimized(),
    );
  });

  handler('quitApp', () => {
    void requestQuit();
    return { requested: true };
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1050,
    height: 760,
    minWidth: 760,
    minHeight: 540,

    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(
      path.join(
        __dirname,
        `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`,
      ),
    );
  }
}

// Set a stable application identity for Windows integration.
if (process.platform === 'win32') {
  app.setAppUserModelId('com.team17.blinkly');
}

app.whenReady().then(() => {
  initializeDatabase();
  registerHandlers();
  createWindow();
  createTray();

  app.on('activate', () => {
    if (!mainWindow) {
      createWindow();
    } else {
      showBlinkly();
    }
  });
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('will-quit', () => {
  closeDatabase();
});

// Do not automatically quit when all windows are closed.
// The tray controls application termination.
app.on('window-all-closed', () => { });
