import { ipcMain, shell } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import type { Pool } from 'pg';
import { deriveResultsPath } from '@verichron/contracts';
import { getRunDecryptedPath, getRunResultsPath } from '@verichron/etl-db-reader';

/**
 * Where a run's report is: in the run's results path, where the orchestrator
 * points the reporting stage. Locations come from the database, where
 * registration keeps them current when a workspace moves; the run's
 * backup_source goes stale after a move.
 *
 * The mvt results the run read come first: they are specific to the run's
 * results set. A decrypt can be shared by results sets in several workspaces
 * and points wherever it was last registered, so it is only the fallback, for
 * a run that read no mvt results (check-backup failed). There the orchestrator
 * derived the results path from the decrypt (`deriveResultsPath`), as here.
 */
async function reportPathFor(dbPool: Pool, runId: string): Promise<string | undefined> {
  let resultsPath = await getRunResultsPath(dbPool, runId);
  if (!resultsPath) {
    const decryptedPath = await getRunDecryptedPath(dbPool, runId);
    resultsPath = decryptedPath ? (deriveResultsPath(decryptedPath) ?? null) : null;
  }
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
