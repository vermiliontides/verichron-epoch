/// <reference types="@electron-forge/plugin-vite/forge-vite-env" />
import electron from 'electron';
import path from 'path';
import { Pool } from 'pg';
import { getPipelineRuns, getStageStatus, getForensicRecords } from '@verichron/db-reader';
import type { BrowserWindowConstructorOptions, BrowserWindow as BrowserWindowType } from 'electron';
import dotenv from 'dotenv'

const { app, BrowserWindow, ipcMain } = electron;

console.log('\n=======================================');
console.log('MAIN PROCESS IS EXECUTING!');
console.log('=======================================\n');

dotenv.config({ path: '../../../.env' })
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
// app.commandLine.appendSwitch('ozone-platform', 'x11');
// app.disableHardwareAcceleration();

// DB pool lives in the main process. This is the only process with full
// Node access (net/tls/dns), which `pg` requires — a sandboxed preload
// script cannot resolve those core modules, which is why the previous
// preload-side Pool caused the renderer to fail to load (white screen).
// The renderer talks to this pool over IPC via the preload bridge instead.
//
// Query logic itself now lives in @verichron/db-reader, not inline here —
// this file only owns the Pool/connection lifecycle and the IPC channel
// wiring. See that package for why reads are split from
// @verichron/db-writer's atomic-ingest boundary, and for three
// table/column-name corrections found by checking these queries against
// packages/db/migrations/0001_init.sql: the original inline queries here
// referenced a nonexistent `stage_runs` table, a nonexistent
// `pipeline_run_id` / `stage_order` / `extracted_at` / pipeline_runs
// `created_at` -- none of which exist in the actual schema.
const dbPool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'forensics',
  user: process.env.DB_USER || 'forensics',
  password: process.env.DB_PASSWORD || 'forensics_dev_only',
  max: 10,
});

ipcMain.handle('epoch:getPipelineRuns', async () => {
  try {
    return await getPipelineRuns(dbPool);
  } catch (err) {
    console.error('DB error:', err);
    throw err;
  }
});

ipcMain.handle('epoch:getStageStatus', async (_event, runId: string) => {
  try {
    return await getStageStatus(dbPool, runId);
  } catch (err) {
    console.error('DB error:', err);
    throw err;
  }
});

ipcMain.handle('epoch:getForensicRecords', async (_event, runId: string, sourceType?: string) => {
  try {
    return await getForensicRecords(dbPool, runId, { sourceType });
  } catch (err) {
    console.error('DB error:', err);
    throw err;
  }
});

let mainWindow: BrowserWindowType | null = null;

const createWindow = (): void => {
  const windowOptions: BrowserWindowConstructorOptions = {
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // enableRemoteModule was removed from Electron's types in v14+ —
      // remote module is gone entirely as of Electron 22. If tsc is
      // flagging this line specifically, that's why: it's not a missing
      // type, it's a property that no longer exists on
      // BrowserWindowConstructorOptions/WebPreferences.
    },
  };

  mainWindow = new BrowserWindow(windowOptions);

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

app.on('before-quit', () => {
  dbPool.end().catch((err) => console.error('Error closing DB pool:', err));
});