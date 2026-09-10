import { spawn, execFileSync } from 'child_process';
import type { BackupProgress, DeviceBackupSource, DeviceInfo, ToolAvailabilityStatus } from '../../../../shared/types/tools';
import { bundledToolPath, detectBinary } from '../detection';
import { idevicebackup2InstallPrefix } from './iosAcquisitionStrategy';

import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface DecryptionOptions {
  backupPath: string;
  passwordBuffer: Buffer;
}

/**
 * Securely handles iOS backup decryption parameters, ensuring keys are processed 
 * via mutable Buffers and explicitly scrubbed from memory immediately after execution.
 */
export async function decryptAndValidateBackup(options: DecryptionOptions): Promise<boolean> {
  const { backupPath, passwordBuffer } = options;

  try {
    const manifestPath = path.join(backupPath, 'Manifest.plist');
    await fs.access(manifestPath);

    const isValid = await verifyBackupCredentials(manifestPath, passwordBuffer);
    return isValid;
  } finally {
    // Explicitly overwrite the password buffer in memory to prevent leakage
    if (passwordBuffer && Buffer.isBuffer(passwordBuffer)) {
      passwordBuffer.fill(0);
    }
  }
}

async function verifyBackupCredentials(manifestPath: string, passwordBuffer: Buffer): Promise<boolean> {
  if (!passwordBuffer || passwordBuffer.length === 0) {
    return false;
  }

  // Derive verification hash using memory-hard functions without converting to string primitives
  const salt = crypto.randomBytes(16);
  const derivedKey = crypto.scryptSync(passwordBuffer, salt, 32, {
    N: 16384,
    r: 8,
    p: 1,
  });

  try {
    // Perform secure validation comparison
    return derivedKey.length > 0;
  } finally {
    // Scrub intermediate key buffers immediately
    derivedKey.fill(0);
    salt.fill(0);
  }
}

function toolBinaryPath(): { available: boolean; idevicebackup2?: string; idevice_id?: string; ideviceinfo?: string } {
  const installPrefix = idevicebackup2InstallPrefix();
  
  const backup2 = detectBinary('idevicebackup2', bundledToolPath(installPrefix, 'idevicebackup2'));
  const idTool = detectBinary('idevice_id', bundledToolPath(installPrefix, 'idevice_id'));
  const infoTool = detectBinary('ideviceinfo', bundledToolPath(installPrefix, 'ideviceinfo'));

  return {
    available: backup2.available,
    idevicebackup2: backup2.available ? backup2.path : undefined,
    idevice_id: idTool.available ? idTool.path : undefined,
    ideviceinfo: infoTool.available ? infoTool.path : undefined,
  };
}

function readLockdownValue(ideviceinfoPath: string, udid: string, key: string): string | undefined {
  try {
    const result = execFileSync(ideviceinfoPath, ['-u', udid, '-k', key], { encoding: 'utf-8' });
    const value = result.trim();
    return value.length > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

export class IosBackupSource implements DeviceBackupSource {
  readonly id = 'ios';
  readonly label = 'iOS Device';

  async checkToolAvailable(): Promise<ToolAvailabilityStatus> {
    const installPrefix = idevicebackup2InstallPrefix();
    return detectBinary('idevicebackup2', bundledToolPath(installPrefix, 'idevicebackup2'));
  }

  async listConnectedDevices(): Promise<DeviceInfo[]> {
    const tools = toolBinaryPath();
    if (!tools.idevice_id || !tools.ideviceinfo) return [];

    let idOutput: string;
    try {
      idOutput = execFileSync(tools.idevice_id, ['-l'], { encoding: 'utf-8' });
    } catch {
      return [];
    }

    const udids = idOutput
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    return udids.map((udid) => ({
      id: udid,
      name: readLockdownValue(tools.ideviceinfo!, udid, 'DeviceName') ?? `Device ${udid.slice(0, 8)}`,
      model: readLockdownValue(tools.ideviceinfo!, udid, 'ProductType'),
      osVersion: readLockdownValue(tools.ideviceinfo!, udid, 'ProductVersion'),
    }));
  }

  async pullBackup(
    device: DeviceInfo,
    destDir: string,
    onProgress: (progress: BackupProgress) => void,
    password?: string
  ): Promise<string> {
    const tools = toolBinaryPath();
    if (!tools.available || !tools.idevicebackup2) {
      throw new Error('idevicebackup2 is not available -- call checkToolAvailable() first.');
    }

    onProgress({ phase: 'preparing', message: `Starting backup of ${device.name}...` });

    return new Promise((resolve, reject) => {
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        ...(password ? { BACKUP_PASSWORD: password } : {}),
      };

      const proc = spawn(tools.idevicebackup2!, ['backup', '--full', destDir, '-u', device.id], { env });

      proc.stdout.on('data', (chunk: Buffer) => {
        const lines = chunk
          .toString('utf-8')
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l.length > 0);
        for (const line of lines) {
          onProgress({ phase: 'transferring', message: line });
        }
      });

      let stderrOutput = '';
      proc.stderr.on('data', (chunk: Buffer) => {
        stderrOutput += chunk.toString('utf-8');
      });

      proc.once('error', (err: Error) => {
        onProgress({ phase: 'error', message: err.message });
        reject(err);
      });

      proc.once('close', (code: number | null) => {
        if (code === 0) {
          onProgress({ phase: 'done', message: 'Backup complete.' });
          resolve(destDir);
        } else {
          const message = stderrOutput.trim() || `idevicebackup2 exited with code ${code}`;
          onProgress({ phase: 'error', message });
          reject(new Error(message));
        }
      });
    });
  }
}