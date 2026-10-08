import { ipcMain, shell } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import type { Pool } from 'pg';
import { getRunResultsPath } from '@verichron/etl-db-reader';

/**
 * A run's report is written beside the mvt results it read. The results'
 * location comes from the database, where registration keeps a derivative's
 * path current when its workspace moves; the run's backup_source keeps the
 * path the run started from and goes stale after a move.
 */
async function reportPathFor(dbPool: Pool, runId: string): Promise<string | undefined> {
  const resultsPath = await getRunResultsPath(dbPool, runId);
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
