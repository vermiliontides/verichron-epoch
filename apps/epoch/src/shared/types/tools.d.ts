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
  /** Stable id, e.g. 'ios'. Used as the key in the source registry and in
   * IPC calls -- never shown to the user directly (use `label` for that). */
  readonly id: string;
  /** Display name, e.g. "iOS Device". */
  readonly label: string;

  /** Is the underlying CLI tool available right now on this machine? */
  checkToolAvailable(): Promise<ToolAvailabilityStatus>;

  /** Devices of this kind currently connected. Only meaningful once
   * checkToolAvailable() reports available -- callers should gate on that
   * first rather than rely on this returning an empty list to mean "no
   * tool", since a real "no devices connected" empty list and a "the tool
   * itself isn't installed" empty list mean very different things to show
   * the user. */
  listConnectedDevices(): Promise<DeviceInfo[]>;

  /** Pull a full backup of `device` into `destDir` (which must already
   * exist and be empty), reporting progress as it goes. Resolves with the
   * backup directory path on success -- the same shape WorkspaceView's
   * existing selectBackupDirectory() flow already hands to startPipeline,
   * so a caller doesn't need to know whether a directory came from the
   * user's own filesystem or a fresh pull. */
  pullBackup(device: DeviceInfo, destDir: string, onProgress: (progress: BackupProgress) => void): Promise<string>;
}

export type ToolAcquisitionAction =
  | { kind: 'install-instructions'; title: string; commands: string[] }
  | { kind: 'compile-from-source'; title: string; steps: ToolAcquisitionCommand[] }
  | { kind: 'download-verified-release'; title: string; manifestUrl: string };

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
