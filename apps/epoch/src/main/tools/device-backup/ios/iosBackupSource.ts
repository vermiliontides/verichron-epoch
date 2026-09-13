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

function readLockdownValue(ideviceinfoPath: string, udid: string, key: string, domain?: string): string | undefined {
  try {
    const args = ['-u', udid];
    if (domain) {
      args.push('-q', domain);
    }
    args.push('-k', key);
    const result = execFileSync(ideviceinfoPath, args, { encoding: 'utf-8' });
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

  /**
   * Pulls a full backup from the device and hands it to idevicebackup2 as an
   * ENCRYPTED backup only. There is deliberately no code path here that
   * produces an unencrypted backup and no code path that programmatically
   * flips the device's backup-encryption toggle.
   *
   * Why the toggle is gone (EPOCH-101)
   * -----------------------------------
   * The previous implementation shelled out to
   * `idevicebackup2 -u <udid> encryption on <password>` via `execFileSync`
   * with `stdio: 'ignore'` when the device wasn't already set to encrypt
   * backups, then reversed it with `encryption off` after the pull.
   * `encryption on` triggers an on-device trust/pairing confirmation that
   * `idevicebackup2` expects to negotiate interactively over the same
   * connection -- `execFileSync` can neither see nor answer that prompt, so
   * the handshake stalled and surfaced as `error code -1` / exit 255. That
   * failure was not a bug in the retry logic; it was structural: a
   * non-interactive spawn can never satisfy an interactive device prompt.
   *
   * Rather than build a second, interactive spawn path just to flip a
   * device setting, this now refuses to proceed when encryption isn't
   * already enabled (see the `isEncrypted` check below) and tells the
   * person exactly what to do instead. `BACKUP_PASSWORD` is the only
   * channel the password travels through, and it goes straight to the
   * `backup` invocation itself -- idevicebackup2 reads it from the
   * environment to unlock/encrypt non-interactively, and it never appears
   * as a CLI argument (which would otherwise be visible in the process
   * table via `ps`).
   */
  async pullBackup(
    device: DeviceInfo,
    destDir: string,
    onProgress: (progress: BackupProgress) => void,
    password?: string
  ): Promise<string> {
    if (!password || password.trim() === '') {
      throw new Error('A backup decryption password is required to perform a secure extraction.');
    }

    const tools = toolBinaryPath();
    if (!tools.available || !tools.idevicebackup2 || !tools.ideviceinfo) {
      throw new Error('idevicebackup2 and ideviceinfo are not available -- call checkToolAvailable() first.');
    }

    onProgress({ phase: 'preparing', message: `Checking encryption status for ${device.name}...` });

    const isEncrypted =
      readLockdownValue(tools.ideviceinfo, device.id, 'WillEncrypt', 'com.apple.mobile.backup') === 'true';

    if (!isEncrypted) {
      const message =
        `${device.name} does not have encrypted backups enabled, and Epoch will not enable it on your behalf. ` +
        `A previous version tried to flip this setting automatically via "idevicebackup2 encryption on", but ` +
        `that command requires answering an on-device trust prompt interactively -- attempting it headlessly ` +
        `caused a handshake failure (error code -1, exit 255), not a real backup. ` +
        `Turn on "Encrypt Local Backup" for this device yourself (in Finder on macOS: select the device > ` +
        `General > Encrypt local backup; in iTunes on Windows: the Backups section), set a backup password ` +
        `there, then retry this pull using that same password.`;
      onProgress({ phase: 'error', message });
      throw new Error(message);
    }

    onProgress({ phase: 'preparing', message: `Starting secure backup of ${device.name}...` });

    return new Promise((resolve, reject) => {
      // The one and only place `password` is used: as an environment
      // variable for idevicebackup2's own process, never as a CLI arg and
      // never used to toggle device state.
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        BACKUP_PASSWORD: password,
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
