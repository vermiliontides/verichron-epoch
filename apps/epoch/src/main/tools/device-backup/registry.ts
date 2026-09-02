import type { DeviceBackupSource, ToolAcquisitionStrategy } from '../../../shared/types/tools.';
import { IosBackupSource } from './ios/iosBackupSource';
import { IosToolAcquisitionStrategy } from './ios/iosAcquisitionStrategy';

/**
 * The actual extensibility point this whole module exists for: adding
 * Android (or anything else) later means writing a new DeviceBackupSource
 * + ToolAcquisitionStrategy pair and adding one entry here -- nothing in
 * main.ts's IPC wiring, WorkspaceView's UI, or any existing source's code
 * needs to change.
 */
const SOURCES: Array<{ source: DeviceBackupSource; acquisition: ToolAcquisitionStrategy }> = [
  { source: new IosBackupSource(), acquisition: new IosToolAcquisitionStrategy() },
];

export function listDeviceBackupSources(): DeviceBackupSource[] {
  return SOURCES.map((entry) => entry.source);
}

export function getDeviceBackupSource(id: string): DeviceBackupSource | undefined {
  return SOURCES.find((entry) => entry.source.id === id)?.source;
}

export function getAcquisitionStrategy(id: string): ToolAcquisitionStrategy | undefined {
  return SOURCES.find((entry) => entry.source.id === id)?.acquisition;
}
