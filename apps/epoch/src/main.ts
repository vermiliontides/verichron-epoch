/// <reference types="@electron-forge/plugin-vite/forge-vite-env" />
import { app, BrowserWindow } from 'electron';
import path from 'path';

console.log('\n=======================================');
console.log('MAIN PROCESS IS EXECUTING!');
console.log('=======================================\n');

// 1. Catch silent crashes and print them to the terminal
process.on('uncaughtException', (error) => {
  console.error('\n--- FATAL UNCAUGHT EXCEPTION ---');
  console.error(error);
  console.error('--------------------------------\n');
});

process.on('unhandledRejection', (reason) => {
  console.error('\n--- UNHANDLED PROMISE REJECTION ---');
  console.error(reason);
  console.error('-----------------------------------\n');
});

// Force X11 and disable acceleration for Linux display compatibility
app.commandLine.appendSwitch('ozone-platform', 'x11');
app.disableHardwareAcceleration();

let mainWindow: BrowserWindow | null = null;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

// 2. Safely check for injected variables to prevent ReferenceErrors
  if (typeof MAIN_WINDOW_VITE_DEV_SERVER_URL !== 'undefined') {
    // Force IPv4 loopback to avoid Node/Chromium IPv6 resolution mismatch
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL.replace('localhost', '127.0.0.1'));
  } else if (typeof MAIN_WINDOW_VITE_NAME !== 'undefined') {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  } else {
    console.error('Vite target variables are missing.');
  }

  mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

app.whenReady().then(createWindow);

// app.on('window-all-closed', () => {
//   if (process.platform !== 'darwin') {
//     app.quit();
//   }
// });

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});