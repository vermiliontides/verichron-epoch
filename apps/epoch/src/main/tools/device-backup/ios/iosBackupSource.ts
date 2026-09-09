import { spawn, execFileSync } from 'child_process';
import type { BackupProgress, DeviceBackupSource, DeviceInfo, ToolAvailabilityStatus } from '../../../../shared/types/tools';
import { bundledToolPath, detectBinary } from '../detection';
import { idevicebackup2InstallPrefix } from './iosAcquisitionStrategy';

/**
 * CLI syntax and behavior below verified against libimobiledevice's real
 * man pages and tools/idevicebackup2.c source, not guessed:
 *   idevicebackup2 [OPTIONS] backup --full DIRECTORY -u UDID
 *   idevice_id -l                          -- one UDID per line
 *   ideviceinfo -u UDID -k KEY              -- single lockdown value
 *
 * Known, deliberate gap: encrypted/password-protected device backups.
 * idevicebackup2 supports these via -i (interactive prompt, which would
 * hang forever with no TTY in a spawned Electron process) or the
 * BACKUP_PASSWORD environment variable. Neither is wired up here --
 * that's a real feature (password entry UI, secure handling of the value)
 * that today's scope doesn't cover. pullBackup() will fail against an
 * encrypted-backup device rather than hang or silently mishandle a
 * password; that failure surfaces through the normal error path.
 *
 * Also not implemented: a confirmed numeric progress percentage.
 * idevicebackup2's own source prints status strings ("Moving N files",
 * "Receiving files") rather than a documented, stable percent format --
 * forwarding those as BackupProgress.message with percent left undefined
 * is honest about what's actually knowable from stdout, rather than
 * inventing a parser for a format that was never confirmed to exist.
 */

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
    onProgress: (progress: BackupProgress) => void
  ): Promise<string> {
    const tools = toolBinaryPath();
    if (!tools.available || !tools.idevicebackup2) {
      throw new Error('idevicebackup2 is not available -- call checkToolAvailable() first.');
    }

    onProgress({ phase: 'preparing', message: `Starting backup of ${device.name}...` });

    return new Promise((resolve, reject) => {
      const proc = spawn(tools.idevicebackup2!, ['backup', '--full', destDir, '-u', device.id]);

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

      proc.once('error', (err) => {
        onProgress({ phase: 'error', message: err.message });
        reject(err);
      });

      proc.once('close', (code) => {
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