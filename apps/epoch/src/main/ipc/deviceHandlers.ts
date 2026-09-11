import { ipcMain, dialog, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import { spawn } from 'child_process';
import { listDeviceBackupSources, getDeviceBackupSource, getAcquisitionStrategy } from '../tools/device-backup/registry';
import { isHomebrewAvailable } from '../tools/device-backup/ios/buildSteps';
import type { DeviceInfo, ToolAcquisitionCommand, BackupProgress, ToolAcquisitionResult } from '../../shared/types/tools';

export function registerDeviceHandlers(getMainWindow: () => BrowserWindow | null) {
  function sendToRenderer(channel: string, ...args: unknown[]) {
    const win = getMainWindow();
    if (win) {
      win.webContents.send(channel, ...args);
    }
  }

  ipcMain.handle('epoch:selectDeviceBackupDestination', async () => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Choose where to save the new backup',
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

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
    async (_event, sourceId: string, device: DeviceInfo, destDir: string, password?: string) => {
      if (!password || password.trim() === '') {
        throw new Error('A secure password is required to encrypt the backup session.');
      }

      if (deviceBackupInFlight) {
        throw new Error('A device backup is already in progress -- wait for it to finish before starting another.');
      }
      const source = getDeviceBackupSource(sourceId);
      if (!source) throw new Error(`Unknown device backup source: ${sourceId}`);

      deviceBackupInFlight = true;
      try {
        return await source.pullBackup(
          device,
          destDir,
          (progress: BackupProgress) => {
            sendToRenderer('epoch:deviceBackupProgress', progress);
          },
          password
        );
      } finally {
        deviceBackupInFlight = false;
      }
    }
  );

  let acquisitionInFlight = false;

  ipcMain.handle('epoch:runToolAcquisitionSteps', async (_event, steps: ToolAcquisitionCommand[], installPrefix: string): Promise<ToolAcquisitionResult> => {
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
        
        const env: NodeJS.ProcessEnv = {
          ...process.env,
          PKG_CONFIG_PATH: [pkgConfigPath, process.env.PKG_CONFIG_PATH].filter(Boolean).join(path.delimiter),
        };

        if (process.platform === 'darwin') {
          const macPaths = [
            '/opt/homebrew/bin',
            '/usr/local/bin',
            '/opt/homebrew/opt/libtool/bin',
            '/usr/local/opt/libtool/bin'
          ].join(':');
          
          env.PATH = env.PATH ? `${macPaths}:${env.PATH}` : macPaths;
        }

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
          const homebrewFallbackAvailable = process.platform === 'darwin' && isHomebrewAvailable();
          const result: ToolAcquisitionResult = { success: false, failedStep: step.label, homebrewFallbackAvailable };
          sendToRenderer('epoch:toolAcquisitionFinished', result);
          return result;
        }
      }

      const result: ToolAcquisitionResult = { success: true };
      sendToRenderer('epoch:toolAcquisitionFinished', result);
      return result;
    } finally {
      acquisitionInFlight = false;
    }
  });

  ipcMain.handle('epoch:runHomebrewInstall', async (_event, formulas: string[]): Promise<{ success: boolean }> => {
    if (acquisitionInFlight) {
      throw new Error('A tool acquisition run is already in progress.');
    }
    if (process.platform !== 'darwin') {
      throw new Error('Homebrew installation is only supported on macOS.');
    }
    if (!isHomebrewAvailable()) {
      throw new Error('brew was not found on PATH.');
    }

    acquisitionInFlight = true;
    const label = `Install via Homebrew (${formulas.join(', ')})`;

    try {
      sendToRenderer('epoch:toolAcquisitionStepStarted', label);

      const env: NodeJS.ProcessEnv = {
        ...process.env,
      };
      const macPaths = [
        '/opt/homebrew/bin',
        '/usr/local/bin',
        '/opt/homebrew/opt/libtool/bin',
        '/usr/local/opt/libtool/bin',
      ].join(':');
      env.PATH = env.PATH ? `${macPaths}:${env.PATH}` : macPaths;

      const exitCode = await new Promise<number>((resolve, reject) => {
        const child = spawn('brew', ['install', ...formulas], { env });
        child.stdout?.on('data', (chunk: Buffer) => {
          sendToRenderer('epoch:toolAcquisitionOutput', { step: label, line: chunk.toString('utf-8') });
        });
        child.stderr?.on('data', (chunk: Buffer) => {
          sendToRenderer('epoch:toolAcquisitionOutput', { step: label, line: chunk.toString('utf-8') });
        });
        child.once('error', reject);
        child.once('close', (code) => resolve(code ?? 1));
      });

      const success = exitCode === 0;
      const result: ToolAcquisitionResult = success ? { success: true } : { success: false, failedStep: label };
      sendToRenderer('epoch:toolAcquisitionFinished', result);
      return { success };
    } finally {
      acquisitionInFlight = false;
    }
  });
}