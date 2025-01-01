// apps/epoch/src/main/tools/device-backup-manager.ts
import { app, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs-extra';
import { execSync, spawn } from 'child_process';
import crypto from 'crypto';
import axios from 'axios';
import { extract } from 'tar';
import AdmZip from 'adm-zip';
import { IDEVICEBACKUP2_TOOL } from './idevicebackup-config';
import { ToolDefinition } from './tool-types';

export interface BackupProgress {
  stage: 'download' | 'extract' | 'verify' | 'postinstall' | 'backup' | 'encrypt';
  percent: number;
  message: string;
  bytesTransferred?: number;
  totalBytes?: number;
}

export interface BackupOptions {
  udid: string;
  outputPath: string;
  password?: string;
  full?: boolean;
  encryption?: boolean;
}

export class DeviceBackupManager {
  private toolDef: ToolDefinition;
  private toolDir: string;
  private arch: string;

  constructor() {
    this.toolDef = IDEVICEBACKUP2_TOOL;
    this.toolDir = path.join(app.getPath('userData'), 'device-tools');
    this.arch = this.detectArch();
  }

  /**
   * Check if tool is properly installed
   */
  async isInstalled(): Promise<{ installed: boolean; missing: string[] }> {
    const missing: string[] = [];

    // Check executables
    for (const exe of this.toolDef.artifacts.executables) {
      if (exe.platforms.includes(process.platform as any)) {
        const exePath = this.getExecutablePath(exe.name);
        if (!await fs.pathExists(exePath)) {
          missing.push(exe.name);
        }
      }
    }

    // Check libraries
    for (const lib of this.toolDef.artifacts.libraries) {
      if (lib.platforms.includes(process.platform as any)) {
        const variants = lib.variants[process.platform];
        if (variants) {
          for (const variant of variants) {
            const libPath = this.getLibraryPath(variant);
            if (!await fs.pathExists(libPath)) {
              missing.push(`${lib.name} (${variant})`);
            }
          }
        }
      }
    }

    return {
      installed: missing.length === 0,
      missing
    };
  }

  /**
   * Install idevicebackup2 and dependencies
   */
  async install(onProgress?: (progress: BackupProgress) => void): Promise<void> {
    this.log('Starting idevicebackup2 installation');

    const tempDir = path.join(app.getPath('temp'), `idevice-${Date.now()}`);

    try {
      // Download
      this.emit(onProgress, 'download', 0, 'Downloading idevicebackup2...');
      const archivePath = await this.downloadRelease(tempDir, onProgress);

      // Extract
      this.emit(onProgress, 'extract', 30, 'Extracting files...');
      await this.extractRelease(archivePath, tempDir);

      // Verify
      this.emit(onProgress, 'verify', 60, 'Verifying installation...');
      await this.verifyArtifacts(tempDir);

      // Copy to tool directory
      await fs.ensureDir(this.toolDir);
      await fs.copy(path.join(tempDir, 'extracted'), this.toolDir, { overwrite: true });

      // Post-install steps
      this.emit(onProgress, 'postinstall', 80, 'Running post-install...');
      await this.runPostInstall();

      this.emit(onProgress, 'postinstall', 100, 'Installation complete!');
      this.log('idevicebackup2 installation successful');
    } catch (error) {
      this.log(`Installation failed: ${error}`, 'error');
      throw error;
    } finally {
      await fs.remove(tempDir);
    }
  }

  /**
   * Download release for current platform/arch
   */
  private async downloadRelease(
    outputDir: string,
    onProgress?: (progress: BackupProgress) => void
  ): Promise<string> {
    const release = this.toolDef.releases[process.platform];
    if (!release) {
      throw new Error(`Unsupported platform: ${process.platform}`);
    }

    const url = release.downloadUrl.replace('{arch}', this.arch);
    const filename = url.split('/').pop() || 'archive';
    const outputPath = path.join(outputDir, filename);

    await fs.ensureDir(outputDir);

    const response = await axios.get(url, {
      responseType: 'stream',
      timeout: 60000 * 15
    });

    const totalSize = parseInt(response.headers['content-length'] || '0');
    let downloadedSize = 0;

    return new Promise((resolve, reject) => {
      const stream = fs.createWriteStream(outputPath);

      response.data.on('data', (chunk: Buffer) => {
        downloadedSize += chunk.length;
        const percent = Math.round((downloadedSize / totalSize) * 100);
        this.emit(onProgress, 'download', percent, 
          `Downloading... ${this.formatBytes(downloadedSize)} / ${this.formatBytes(totalSize)}`,
          downloadedSize,
          totalSize
        );
      });

      response.data.pipe(stream);

      stream.on('finish', () => {
        this.log(`Downloaded: ${outputPath}`);
        resolve(outputPath);
      });
      stream.on('error', reject);
      response.data.on('error', reject);
    });
  }

  /**
   * Extract release and organize files
   */
  private async extractRelease(archivePath: string, tempDir: string): Promise<void> {
    const extractDir = path.join(tempDir, 'extracted');
    await fs.ensureDir(extractDir);

    if (archivePath.endsWith('.tar.gz') || archivePath.endsWith('.tgz')) {
      await extract({
        file: archivePath,
        cwd: extractDir
      });
    } else if (archivePath.endsWith('.zip')) {
      const zip = new AdmZip(archivePath);
      zip.extractAllTo(extractDir, true);
    }

    this.log(`Extracted to: ${extractDir}`);
  }

  /**
   * Verify all required artifacts are present
   */
  private async verifyArtifacts(extractDir: string): Promise<void> {
    const release = this.toolDef.releases[process.platform];
    const subdir = release.extractSubdir ? path.join(extractDir, release.extractSubdir) : extractDir;

    // Check executables
    for (const exe of this.toolDef.artifacts.executables) {
      if (exe.platforms.includes(process.platform as any)) {
        const exeName = process.platform === 'win32' ? `${exe.name}.exe` : exe.name;
        const exePath = path.join(subdir, exeName);
        if (!await fs.pathExists(exePath)) {
          throw new Error(`Missing executable: ${exeName}`);
        }
      }
    }

    // Check libraries
    for (const lib of this.toolDef.artifacts.libraries) {
      if (!lib.required) continue;
      if (lib.platforms.includes(process.platform as any)) {
        const variants = lib.variants[process.platform];
        for (const variant of variants) {
          const libPath = path.join(subdir, variant);
          if (!await fs.pathExists(libPath)) {
            throw new Error(`Missing library: ${variant}`);
          }
        }
      }
    }

    this.log('All artifacts verified');
  }

  /**
   * Run platform-specific post-install steps
   */
  private async runPostInstall(): Promise<void> {
    const steps = this.toolDef.postInstall[process.platform] || [];

    for (const step of steps) {
      try {
        switch (step.type) {
          case 'codesign':
            await this.codesign(step.files || [], step.identity);
            break;
          case 'chmod':
            await this.chmod(step.files || [], step.mode || 0o755);
            break;
          case 'register-dll':
            // Windows DLL registration (optional)
            if (step.optional) {
              await this.registerDlls(step.files || []).catch(() => {
                this.log('DLL registration skipped (not critical)');
              });
            }
            break;
        }
      } catch (error) {
        if (!step.optional) throw error;
        this.log(`Post-install step ${step.type} failed (non-critical): ${error}`);
      }
    }
  }

  /**
   * Code sign macOS binaries
   */
  private async codesign(files: string[], identity?: string): Promise<void> {
    if (process.platform !== 'darwin') return;

    for (const file of files) {
      const filePath = this.getExecutablePath(file);
      if (!await fs.pathExists(filePath)) continue;

      const cmd = `codesign -s ${identity || '-'} "${filePath}"`;
      this.log(`Codesigning: ${file}`);
      execSync(cmd);
    }
  }

  /**
   * Make files executable
   */
  private async chmod(files: string[], mode: number): Promise<void> {
    for (const file of files) {
      const filePath = this.getExecutablePath(file);
      if (await fs.pathExists(filePath)) {
        await fs.chmod(filePath, mode);
        this.log(`chmod +x: ${file}`);
      }
    }
  }

  /**
   * Register Windows DLLs
   */
  private async registerDlls(files: string[]): Promise<void> {
    if (process.platform !== 'win32') return;

    for (const file of files) {
      const filePath = this.getLibraryPath(file);
      if (!await fs.pathExists(filePath)) continue;

      const cmd = `regsvr32 /s