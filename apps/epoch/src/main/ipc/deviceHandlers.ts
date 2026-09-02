import { ipcMain, dialog, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import { spawn } from 'child_process';
import { listDeviceBackupSources, getDeviceBackupSource, getAcquisitionStrategy } from '../tools/device-backup/registry';
import type { DeviceInfo, ToolAcquisitionCommand } from '../../shared/types/tools';

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
}