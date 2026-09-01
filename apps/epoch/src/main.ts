
/// <reference types="@electron-forge/plugin-vite/forge-vite-env" />
import electron from 'electron';
import path from 'path';
import fs from 'fs/promises';
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { Pool } from 'pg';
import { getPipelineRuns, getStageStatus, getForensicRecords, getCorrelationPivots, getCorrelatedContext } from '@verichron/db-reader';
import { deriveResultsPath, discoverBackups, type Backup } from '@verichron/contracts';
import type { BrowserWindowConstructorOptions, BrowserWindow as BrowserWindowType } from 'electron';
import dotenv from 'dotenv'
import { listDeviceBackupSources, getDeviceBackupSource, getAcquisitionStrategy } from './tools/device-backup/registry';
import type { DeviceInfo, ToolAcquisitionCommand } from './tools/device-backup/types';
 
const { app, BrowserWindow, ipcMain, shell, dialog } = electron;
 
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
 
ipcMain.handle('epoch:getCorrelationPivots', async (_event, runId: string) => {
  try {
    return await getCorrelationPivots(dbPool, runId);
  } catch (err) {
    console.error('DB error:', err);
    throw err;
  }
});
 
ipcMain.handle(
  'epoch:getCorrelatedContext',
  async (_event, runId: string, eventTime: string, excludeId: number, windowMinutes?: number) => {
    try {
      return await getCorrelatedContext(dbPool, runId, eventTime, excludeId, windowMinutes);
    } catch (err) {
      console.error('DB error:', err);
      throw err;
    }
  }
);
 
function reportPathFor(backupSource: string): string | undefined {
  const resultsPath = deriveResultsPath(backupSource);
  if (!resultsPath) return undefined;
  return path.join(resultsPath, 'investigation_report.md');
}
 
ipcMain.handle('epoch:getReport', async (_event, backupSource: string) => {
  const reportPath = reportPathFor(backupSource);
  if (!reportPath) {
    return { status: 'no-results-path' as const };
  }
  try {
    const content = await fs.readFile(reportPath, 'utf-8');
    return { status: 'ok' as const, content, path: reportPath };
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') {
      return { status: 'not-found' as const, path: reportPath };
    }
    console.error('Report read error:', err);
    throw err;
  }
});
 
ipcMain.handle('epoch:openReport', async (_event, backupSource: string) => {
  const reportPath = reportPathFor(backupSource);
  if (!reportPath) return false;
  const result = await shell.openPath(reportPath);
  return result === '';
});
 
// This file is always Vite-bundled to apps/epoch/.vite/build/main.js, both
// in `electron-forge start` dev mode and when packaged -- never run raw via
// tsx from src/. __dirname at runtime is therefore always
// <repo>/apps/epoch/.vite/build, so repo root is four levels up. (Verified
// against the real build output, not assumed -- see the orchestrator's own
// comment for the equivalent three-levels-up computation from its
// unbundled apps/orchestrator/src/main.ts.)
const REPO_ROOT = path.resolve(__dirname, '../../../..');
 
/**
 * mvt-runner (apps/mvt-runner) is Stage 1 of the real pipeline: it hashes,
 * decrypts, repairs, and mvt-ios-scans one or more already-encrypted
 * backups under --source into a --workspace (default ~/mvt-workspace).
 * It does NOT touch the forensics database or create a pipeline_runs row
 * -- that's the orchestrator's job (Stage 3, not yet wired), run
 * separately against mvt-runner's decrypted output once the user picks
 * which backup(s) to analyze.
 *
 * mvt-runner prompts for a decryption password via raw stdin -- but only
 * when stdin is a real TTY (see its promptPassword()). Spawned here with
 * piped (non-TTY) stdio, it automatically falls back to its own
 * documented non-interactive mode: write the prompt to stdout with no
 * trailing newline, then read one line from stdin. That fallback is what
 * this bridge relies on -- no raw-terminal emulation needed on this side.
 *
 * Since mvt-runner processes backups strictly sequentially and blocks on
 * stdin between prompts, at most one password prompt is ever outstanding
 * at a time -- a single-slot resolver here is always correct, regardless
 * of whether --different-passwords is passed (not exposed by this UI yet).
 */
let runningMvtProcess: ChildProcessWithoutNullStreams | null = null;
let pendingPasswordResolve: ((password: string) => void) | null = null;
 
const PASSWORD_PROMPT_RE = /password for (.+): $/;
 
interface StartPipelineOptions {
  workspace?: string;
  forceDecrypt?: boolean;
  refreshIOCs?: boolean;
  // Backup labels (as returned by epoch:discoverBackups) to process,
  // rather than every backup found under `source`. Forwarded to
  // mvt-runner's own --only flag verbatim, comma-joined.
  only?: string[];
}
 
function sendToRenderer(channel: string, ...args: unknown[]) {
  mainWindow?.webContents.send(channel, ...args);
}
 
/**
 * Buffers partial (no-newline) chunks per stream so a password prompt or
 * log line split across multiple stdout 'data' events is still matched
 * correctly, and so log lines are only emitted once complete.
 */
function makeStreamBuffer(stream: 'stdout' | 'stderr', child: ChildProcessWithoutNullStreams) {
  let pending = '';
  return (chunk: Buffer) => {
    pending += chunk.toString('utf-8');
    const lines = pending.split('\n');
    pending = lines.pop() ?? ''; // last element: either '' (chunk ended in \n) or a partial line
 
    for (const line of lines) {
      sendToRenderer('epoch:mvtLog', { stream, line });
    }
 
    // Only stdout ever carries the password prompt (mvt-runner's
    // promptPassword writes to process.stdout, not stderr).
    if (stream === 'stdout') {
      const match = PASSWORD_PROMPT_RE.exec(pending);
      if (match) {
        sendToRenderer('epoch:mvtLog', { stream, line: pending });
        pendingPasswordResolve = (password: string) => {
          child.stdin.write(password + '\n');
        };
        sendToRenderer('epoch:mvtPasswordRequired', match[1]);
        pending = '';
      }
    }
  };
}
 
ipcMain.handle('epoch:selectBackupDirectory', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select a directory containing encrypted iOS backups',
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle('epoch:selectDeviceBackupDestination', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Choose where to save the new backup',
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});
 
// Lists the backups mvt-runner would find under `source`, so Stage 1 can
// let the user pick which one(s) to actually process instead of always
// running the whole directory. Uses the exact same discovery logic
// mvt-runner runs internally (see @verichron/contracts/discoverBackups) --
// two independent implementations here would drift the moment the nested-
// UDID-directory search logic changes in one place and not the other.
ipcMain.handle('epoch:discoverBackups', async (_event, source: string): Promise<Backup[]> => {
  if (!source || !source.trim()) {
    throw new Error('A source directory is required.');
  }
  return discoverBackups(source);
});
 
ipcMain.handle('epoch:startPipeline', async (_event, source: string, options?: StartPipelineOptions) => {
  if (runningMvtProcess) {
    throw new Error('mvt-runner is already running -- wait for it to finish before starting another.');
  }
  if (!source || !source.trim()) {
    throw new Error('A source directory is required.');
  }
 
  const args = ['--filter', '@verichron/mvt-runner', 'dev', '--', '--source', source];
  if (options?.workspace) args.push('--workspace', options.workspace);
  if (options?.forceDecrypt) args.push('--force-decrypt');
  if (options?.refreshIOCs) args.push('--refresh-iocs');
  if (options?.only && options.only.length > 0) args.push('--only', options.only.join(','));
 
  const child = spawn('pnpm', args, { cwd: REPO_ROOT, stdio: ['pipe', 'pipe', 'pipe'] });
  runningMvtProcess = child;
  pendingPasswordResolve = null;
 
  child.stdout.on('data', makeStreamBuffer('stdout', child));
  child.stderr.on('data', makeStreamBuffer('stderr', child));
 
  child.on('error', (err) => {
    runningMvtProcess = null;
    pendingPasswordResolve = null;
    sendToRenderer('epoch:mvtFinished', { success: false, error: err.message });
  });
 
  child.on('close', (code) => {
    runningMvtProcess = null;
    pendingPasswordResolve = null;
    sendToRenderer('epoch:mvtFinished', { success: code === 0, exitCode: code });
  });
 
  return { started: true };
});
 
ipcMain.handle('epoch:submitMvtPassword', async (_event, password: string) => {
  if (!runningMvtProcess || !pendingPasswordResolve) {
    throw new Error('No password prompt is currently pending.');
  }
  const resolve = pendingPasswordResolve;
  pendingPasswordResolve = null;
  resolve(password);
});

/**
 * Device backup acquisition -- pulling a fresh backup directly from a
 * connected device, as an alternative to selectBackupDirectory's "point at
 * something already on disk". See apps/epoch/src/tools/device-backup for
 * the actual DeviceBackupSource/ToolAcquisitionStrategy implementations;
 * this section is IPC wiring only. A pulled backup's directory feeds into
 * the exact same epoch:discoverBackups / epoch:startPipeline flow above
 * that an existing directory already does -- no separate pipeline entry
 * point needed for device-sourced vs. disk-sourced backups.
 */
ipcMain.handle('epoch:listDeviceBackupSources', async () => {
  return listDeviceBackupSources().map((source) => ({ id: source.id, label: source.label }));
});

ipcMain.handle('epoch:checkDeviceBackupToolAvailable', async (_event, sourceId: string) => {
  const source = getDeviceBackupSource(sourceId);
  if (!source) throw new Error(`Unknown device backup source: ${sourceId}`);
  return source.checkToolAvailable();
});

ipcMain.handle('epoch:listConnectedDevices', async (_event, sourceId: string) => {
  const source = getDeviceBackupSource(sourceId);
  if (!source) throw new Error(`Unknown device backup source: ${sourceId}`);
  return source.listConnectedDevices();
});

ipcMain.handle('epoch:getToolAcquisitionActions', async (_event, sourceId: string) => {
  const strategy = getAcquisitionStrategy(sourceId);
  if (!strategy) throw new Error(`Unknown device backup source: ${sourceId}`);
  return strategy.availableActions();
});

let deviceBackupInFlight = false;

ipcMain.handle(
  'epoch:pullDeviceBackup',
  async (_event, sourceId: string, device: DeviceInfo, destDir: string) => {
    if (deviceBackupInFlight) {
      throw new Error('A device backup is already in progress -- wait for it to finish before starting another.');
    }
    const source = getDeviceBackupSource(sourceId);
    if (!source) throw new Error(`Unknown device backup source: ${sourceId}`);

    deviceBackupInFlight = true;
    try {
      return await source.pullBackup(device, destDir, (progress) => {
        sendToRenderer('epoch:deviceBackupProgress', progress);
      });
    } finally {
      deviceBackupInFlight = false;
    }
  }
);

let acquisitionInFlight = false;

/** Runs a compile-from-source (or WSL-wrapped) step sequence in order,
 * stopping at the first failure. Each command's PKG_CONFIG_PATH is set to
 * the shared installPrefix so later repos in the chain find earlier ones --
 * see buildSteps.ts's own comment on why this is threaded through env
 * rather than a configure flag. */
ipcMain.handle('epoch:runToolAcquisitionSteps', async (_event, steps: ToolAcquisitionCommand[], installPrefix: string) => {
  if (acquisitionInFlight) {
    throw new Error('A tool acquisition run is already in progress.');
  }
  acquisitionInFlight = true;

  try {
    if (steps.length > 0) {
      const buildRoot = steps[0].cwd;
      if (buildRoot) await fs.mkdir(buildRoot, { recursive: true }).catch(() => undefined);
    }
    await fs.mkdir(installPrefix, { recursive: true }).catch(() => undefined);

    for (const step of steps) {
      sendToRenderer('epoch:toolAcquisitionStepStarted', step.label);
      const pkgConfigPath = path.join(installPrefix, 'lib', 'pkgconfig');
      const env = {
        ...process.env,
        PKG_CONFIG_PATH: [pkgConfigPath, process.env.PKG_CONFIG_PATH].filter(Boolean).join(path.delimiter),
      };

      const exitCode = await new Promise<number>((resolve, reject) => {
        const child = spawn(step.command, step.args, { cwd: step.cwd, env });
        child.stdout?.on('data', (chunk: Buffer) => {
          sendToRenderer('epoch:toolAcquisitionOutput', { step: step.label, line: chunk.toString('utf-8') });
        });
        child.stderr?.on('data', (chunk: Buffer) => {
          sendToRenderer('epoch:toolAcquisitionOutput', { step: step.label, line: chunk.toString('utf-8') });
        });
        child.once('error', reject);
        child.once('close', (code) => resolve(code ?? 1));
      });

      if (exitCode !== 0) {
        sendToRenderer('epoch:toolAcquisitionFinished', { success: false, failedStep: step.label });
        return { success: false, failedStep: step.label };
      }
    }

    sendToRenderer('epoch:toolAcquisitionFinished', { success: true });
    return { success: true };
  } finally {
    acquisitionInFlight = false;
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