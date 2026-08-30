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
const dbApi = {
  selectBackupDirectory: () => ipcRenderer.invoke('epoch:selectBackupDirectory'),
  startPipeline: (targetPath: string) => ipcRenderer.invoke('epoch:startPipeline', targetPath),
  getPipelineRuns: () => ipcRenderer.invoke('epoch:getPipelineRuns'),
  getStageStatus: (runId: string) => ipcRenderer.invoke('epoch:getStageStatus', runId),
  getForensicRecords: (runId: string, sourceType?: string) =>
    ipcRenderer.invoke('epoch:getForensicRecords', runId, sourceType),
  getCorrelationPivots: (runId: string) => ipcRenderer.invoke('epoch:getCorrelationPivots', runId),
  getCorrelatedContext: (runId: string, eventTime: string, excludeId: number, windowMinutes?: number) =>
    ipcRenderer.invoke('epoch:getCorrelatedContext', runId, eventTime, excludeId, windowMinutes),
};
 
contextBridge.exposeInMainWorld('epoch', dbApi);
 