import { contextBridge, ipcRenderer } from 'electron';
 
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
}
 
const dbApi = {
  selectBackupDirectory: () => ipcRenderer.invoke('epoch:selectBackupDirectory'),
  startPipeline: (source: string, options?: StartPipelineOptions) =>
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
};
 
contextBridge.exposeInMainWorld('epoch', dbApi);
 