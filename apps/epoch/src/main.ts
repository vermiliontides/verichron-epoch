/// <reference types="@electron-forge/plugin-vite/forge-vite-env" />
import electron from 'electron';
import path from 'path';
import { Pool } from 'pg';

const { app, BrowserWindow, ipcMain } = electron;

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

// DB pool lives in the main process. This is the only process with full
// Node access (net/tls/dns), which `pg` requires — a sandboxed preload
// script cannot resolve those core modules, which is why the previous
// preload-side Pool caused the renderer to fail to load (white screen).
// The renderer talks to this pool over IPC via the preload bridge instead.
const dbPool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'verichron_db',
  user: process.env.DB_USER || 'verichron',
  password: process.env.DB_PASSWORD || 'verichron',
  max: 10,
});

ipcMain.handle('epoch:getPipelineRuns', async () => {
  try {
    const result = await dbPool.query(`
      SELECT * FROM pipeline_runs
      ORDER BY created_at DESC
      LIMIT 100
    `);
    return result.rows;
  } catch (err) {
    console.error('DB error:', err);
    throw err;
  }
});

ipcMain.handle('epoch:getStageStatus', async (_event, runId: string) => {
  try {
    const result = await dbPool.query(`
      SELECT * FROM stage_runs
      WHERE pipeline_run_id = $1
      ORDER BY stage_order ASC
    `, [runId]);
    return result.rows;
  } catch (err) {
    console.error('DB error:', err);
    throw err;
  }
});

ipcMain.handle('epoch:getForensicRecords', async (_event, stageRunId: string) => {
  try {
    const result = await dbPool.query(`
      SELECT * FROM forensic_records
      WHERE stage_run_id = $1
      ORDER BY extracted_at ASC
      LIMIT 500
    `, [stageRunId]);
    return result.rows;
  } catch (err) {
    console.error('DB error:', err);
    throw err;
  }
});

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

app.on('before-quit', () => {
  dbPool.end().catch((err) => console.error('Error closing DB pool:', err));
});