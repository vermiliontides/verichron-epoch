import { ipcMain, shell } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import type { Pool } from 'pg';
import { getRunResultsLocation } from '@verichron/etl-db-reader';

/** A run's report is in its results location (see getRunResultsLocation). */
async function reportPathFor(dbPool: Pool, runId: string): Promise<string | undefined> {
  const resultsPath = await getRunResultsLocation(dbPool, runId);
  return resultsPath ? path.join(resultsPath, 'investigation_report.md') : undefined;
}

export function registerReportHandlers(dbPool: Pool) {
  ipcMain.handle('epoch:getReport', async (_event, runId: string) => {
    const reportPath = await reportPathFor(dbPool, runId);
    if (!reportPath) {
      return { status: 'no-results-path' as const };
    }
    try {
      const content = await fs.readFile(reportPath, 'utf-8');
      return { status: 'ok' as const, content, path: reportPath };
    } catch (err) {
      if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') {
        return { status: 'not-found' as const, path: reportPath };
      }
      console.error('Report read error:', err);
      throw err;
    }
  });

  ipcMain.handle('epoch:openReport', async (_event, runId: string) => {
    const reportPath = await reportPathFor(dbPool, runId);
    if (!reportPath) return false;
    const result = await shell.openPath(reportPath);
    return result === '';
  });
}
