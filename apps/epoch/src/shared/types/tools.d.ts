/**
 * Core interfaces for pulling a forensic backup directly from a connected
 * device, as an alternative entry point to WorkspaceView's existing
 * "select an existing backup directory" flow.
 *
 * Two concerns are deliberately kept separate here, because they vary
 * independently:
 *
 *   DeviceBackupSource    -- how to talk to a *kind* of device (iOS via
 *                             idevicebackup2 today; Android via adb, or
 *                             anything else, later). Each implementation
 *                             is a self-contained plugin behind this one
 *                             interface.
 *
 *   ToolAcquisitionStrategy -- how to get the underlying CLI tool onto
 *                             *this* machine for *this* platform. An iOS
 *                             source on Linux needs a completely different
 *                             acquisition story (detect a self-compiled
 *                             binary, or walk the user through compiling
 *                             one) than the same iOS source on Windows
 *                             (bundle one, or download a verified release).
 *                             A future Android source likely needs no
 *                             acquisition step at all -- adb ships with
 *                             most dev environments already.
 *
 * If these two were merged into one interface (as the original scaffolding
 * did, with download/verify/install logic baked directly into the device
 * class), adding a second device kind would mean reworking both at once
 * instead of just writing a new DeviceBackupSource against the existing
 * ToolAcquisitionStrategy contract.
 */

export interface DeviceInfo {
  /** Stable identifier for this device (UDID for iOS). */
  id: string;
  /** Human-readable name, e.g. "Robert's iPhone". */
  name: string;
  /** Free-form model/product string, e.g. "iPhone14,2". Source-specific. */
  model?: string;
  /** OS version string if the source can report one, e.g. "17.5.1". */
  osVersion?: string;
}

export type ToolAvailabilityStatus =
  | { available: true; path: string }
  | { available: false; reason: string };

export type BackupProgressPhase = 'preparing' | 'transferring' | 'verifying' | 'done' | 'error';

export interface BackupProgress {
  phase: BackupProgressPhase;
  /** 0-100 when known; omit when the underlying tool gives no percentage. */
  percent?: number;
  /** Short human-readable status line, safe to show directly in the UI. */
  message: string;
}

export interface DeviceBackupSource {
  readonly id: string;
  readonly label: string;
  checkToolAvailable(): Promise<ToolAvailabilityStatus>;
  listConnectedDevices(): Promise<DeviceInfo[]>;
  pullBackup(
    device: DeviceInfo,
    destDir: string,
    onProgress: (progress: BackupProgress) => void,
    password?: string
  ): Promise<string>;
}

export type ToolAcquisitionAction =
  | { kind: 'install-instructions'; title: string; commands: string[] }
  | { kind: 'compile-from-source'; title: string; steps: ToolAcquisitionCommand[] }
  | { kind: 'download-verified-release'; title: string; manifestUrl: string }
  | { kind: 'homebrew-install'; title: string; formulas: string[] };

/** Result of running an acquisition action. `homebrewFallbackAvailable` is
 * set only when a compile-from-source step failed on macOS AND `brew` is
 * present on the host -- it tells the UI it can offer the Homebrew path
 * instead of leaving the user stuck on manual terminal instructions. */
export interface ToolAcquisitionResult {
  success: boolean;
  failedStep?: string;
  homebrewFallbackAvailable?: boolean;
}

export interface ToolAcquisitionCommand {
  /** Short label shown above this step in the UI, e.g. "Install build
   * dependencies". Never shown as a raw command -- the app runs it and
   * streams output through a glossier presentation, not a terminal. */
  label: string;
  command: string;
  args: string[];
  /** Working directory relative to a per-run temp build dir the app
   * manages; undefined means the build dir root itself. */
  cwd?: string;
}

export interface ToolAcquisitionStrategy {
  /** What can this platform actually do to get the tool installed? Returns
   * every viable action so the UI can offer a choice (e.g. Linux: compile
   * from source, only option; Windows: bundled binary check, or a verified
   * download) rather than this layer picking one on the caller's behalf. */
  availableActions(): ToolAcquisitionAction[];
}
