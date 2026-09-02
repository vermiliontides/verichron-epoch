import { contextBridge, ipcRenderer } from 'electron';
import type { Backup } from '@verichron/contracts';
import type { ReportResult } from '../shared/types/window';
import type {
  BackupProgress,
  DeviceInfo,
  ToolAcquisitionAction,
  ToolAcquisitionCommand,
  ToolAvailabilityStatus,
} from '../shared/types/tools.';
 
// This file previously created its own `pg.Pool` and issued its own SQL
// directly from the preload script, bypassing main.ts's `ipcMain.handle`
// channels entirely -- those handlers existed but nothing ever called
// them. main.ts's comment already documented the reason this shape is
// wrong (a sandboxed preload script can't reliably resolve the Node core
// modules `pg` needs, which previously crashed the renderer to a white
// screen); this file just hadn't been updated to match. There is now
// exactly one Pool in the app, owned by main.ts, and this file only
// relays IPC calls to it.
interface StartPipelineOptions {
  workspace?: string;
  forceDecrypt?: boolean;
  refreshIOCs?: boolean;
  only?: string[];
}
 
const dbApi = {
  selectBackupDirectory: () => ipcRenderer.invoke('epoch:selectBackupDirectory'),
  selectDeviceBackupDestination: (): Promise<string | null> => ipcRenderer.invoke('epoch:selectDeviceBackupDestination'),
  discoverBackups: (source: string): Promise<Backup[]> => ipcRenderer.invoke('epoch:discoverBackups', source),
  startPipeline: (source: string, options?: StartPipelineOptions): Promise<{ started: boolean; workspace: string }> =>
    ipcRenderer.invoke('epoch:startPipeline', source, options),
  submitMvtPassword: (password: string) => ipcRenderer.invoke('epoch:submitMvtPassword', password),
  onMvtLog: (callback: (entry: { stream: 'stdout' | 'stderr'; line: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, entry: { stream: 'stdout' | 'stderr'; line: string }) =>
      callback(entry);
    ipcRenderer.on('epoch:mvtLog', listener);
    return () => ipcRenderer.removeListener('epoch:mvtLog', listener);
  },
  onMvtPasswordRequired: (callback: (backupName: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, backupName: string) => callback(backupName);
    ipcRenderer.on('epoch:mvtPasswordRequired', listener);
    return () => ipcRenderer.removeListener('epoch:mvtPasswordRequired', listener);
  },
  onMvtFinished: (callback: (result: { success: boolean; exitCode?: number | null; error?: string }) => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      result: { success: boolean; exitCode?: number | null; error?: string }
    ) => callback(result);
    ipcRenderer.on('epoch:mvtFinished', listener);
    return () => ipcRenderer.removeListener('epoch:mvtFinished', listener);
  },
  getPipelineRuns: () => ipcRenderer.invoke('epoch:getPipelineRuns'),
  getStageStatus: (runId: string) => ipcRenderer.invoke('epoch:getStageStatus', runId),
  getForensicRecords: (runId: string, sourceType?: string) =>
    ipcRenderer.invoke('epoch:getForensicRecords', runId, sourceType),
  getCorrelationPivots: (runId: string) => ipcRenderer.invoke('epoch:getCorrelationPivots', runId),
  getCorrelatedContext: (runId: string, eventTime: string, excludeId: number, windowMinutes?: number) =>
    ipcRenderer.invoke('epoch:getCorrelatedContext', runId, eventTime, excludeId, windowMinutes),
  getReport: (backupSource: string): Promise<ReportResult> => ipcRenderer.invoke('epoch:getReport', backupSource),
  openReport: (backupSource: string): Promise<boolean> => ipcRenderer.invoke('epoch:openReport', backupSource),

  // Stage 3: runs the orchestrator (creates pipeline_runs/stage rows for
  // everything mvt-runner has decrypted in `workspace`). See main.ts's
  // epoch:startAnalysis handler for why this doesn't need a list of which
  // backups succeeded -- orchestrator discovers that itself.
  startAnalysis: (workspace: string): Promise<{ started: boolean }> =>
    ipcRenderer.invoke('epoch:startAnalysis', workspace),
  onOrchestratorLog: (callback: (entry: { stream: 'stdout' | 'stderr'; line: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, entry: { stream: 'stdout' | 'stderr'; line: string }) =>
      callback(entry);
    ipcRenderer.on('epoch:orchestratorLog', listener);
    return () => ipcRenderer.removeListener('epoch:orchestratorLog', listener);
  },
  onOrchestratorFinished: (callback: (result: { success: boolean; exitCode?: number | null; error?: string }) => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      result: { success: boolean; exitCode?: number | null; error?: string }
    ) => callback(result);
    ipcRenderer.on('epoch:orchestratorFinished', listener);
    return () => ipcRenderer.removeListener('epoch:orchestratorFinished', listener);
  },

  // Device backup acquisition -- see apps/epoch/src/tools/device-backup.
  listDeviceBackupSources: (): Promise<Array<{ id: string; label: string }>> =>
    ipcRenderer.invoke('epoch:listDeviceBackupSources'),
  checkDeviceBackupToolAvailable: (sourceId: string): Promise<ToolAvailabilityStatus> =>
    ipcRenderer.invoke('epoch:checkDeviceBackupToolAvailable', sourceId),
  listConnectedDevices: (sourceId: string): Promise<DeviceInfo[]> =>
    ipcRenderer.invoke('epoch:listConnectedDevices', sourceId),
  getToolAcquisitionActions: (sourceId: string): Promise<ToolAcquisitionAction[]> =>
    ipcRenderer.invoke('epoch:getToolAcquisitionActions', sourceId),
  pullDeviceBackup: (sourceId: string, device: DeviceInfo, destDir: string): Promise<string> =>
    ipcRenderer.invoke('epoch:pullDeviceBackup', sourceId, device, destDir),
  runToolAcquisitionSteps: (
    steps: ToolAcquisitionCommand[],
    installPrefix: string
  ): Promise<{ success: boolean; failedStep?: string }> =>
    ipcRenderer.invoke('epoch:runToolAcquisitionSteps', steps, installPrefix),
  onDeviceBackupProgress: (callback: (progress: BackupProgress) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: BackupProgress) => callback(progress);
    ipcRenderer.on('epoch:deviceBackupProgress', listener);
    return () => ipcRenderer.removeListener('epoch:deviceBackupProgress', listener);
  },
  onToolAcquisitionStepStarted: (callback: (label: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, label: string) => callback(label);
    ipcRenderer.on('epoch:toolAcquisitionStepStarted', listener);
    return () => ipcRenderer.removeListener('epoch:toolAcquisitionStepStarted', listener);
  },
  onToolAcquisitionOutput: (callback: (entry: { step: string; line: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, entry: { step: string; line: string }) => callback(entry);
    ipcRenderer.on('epoch:toolAcquisitionOutput', listener);
    return () => ipcRenderer.removeListener('epoch:toolAcquisitionOutput', listener);
  },
  onToolAcquisitionFinished: (callback: (result: { success: boolean; failedStep?: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, result: { success: boolean; failedStep?: string }) =>
      callback(result);
    ipcRenderer.on('epoch:toolAcquisitionFinished', listener);
    return () => ipcRenderer.removeListener('epoch:toolAcquisitionFinished', listener);
  },
};
 
contextBridge.exposeInMainWorld('epoch', dbApi);