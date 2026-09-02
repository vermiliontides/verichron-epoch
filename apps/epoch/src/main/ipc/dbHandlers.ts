import { ipcMain } from 'electron';
import { Pool } from 'pg';
import { getPipelineRuns, getStageStatus, getForensicRecords, getCorrelationPivots, getCorrelatedContext } from '@verichron/db-reader';

export function registerDbHandlers(dbPool: Pool) {
  ipcMain.handle('epoch:getPipelineRuns', async () => {
    try {
      return await getPipelineRuns(dbPool);
    } catch (err) {
      console.error('DB error:', err);
      throw err;
    }
  });

  ipcMain.handle('epoch:getStageStatus', async (_event, runId: string) => {
    try {
      return await getStageStatus(dbPool, runId);
    } catch (err) {
      console.error('DB error:', err);
      throw err;
    }
  });

  ipcMain.handle('epoch:getForensicRecords', async (_event, runId: string, sourceType?: string) => {
    try {
      return await getForensicRecords(dbPool, runId, { sourceType });
    } catch (err) {
      console.error('DB error:', err);
      throw err;
    }
  });

  ipcMain.handle('epoch:getCorrelationPivots', async (_event, runId: string) => {
    try {
      return await getCorrelationPivots(dbPool, runId);
    } catch (err) {
      console.error('DB error:', err);
      throw err;
    }
  });

  ipcMain.handle(
    'epoch:getCorrelatedContext',
    async (_event, runId: string, eventTime: string, excludeId: number, windowMinutes?: number) => {
      try {
        return await getCorrelatedContext(dbPool, runId, eventTime, excludeId, windowMinutes);
      } catch (err) {
        console.error('DB error:', err);
        throw err;
      }
    }
  );
}