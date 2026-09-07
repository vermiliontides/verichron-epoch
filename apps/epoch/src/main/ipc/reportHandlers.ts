import { ipcMain, shell } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import { deriveResultsPath } from '@verichron/contracts';

function reportPathFor(backupSource: string): string | undefined {
  const resultsPath = deriveResultsPath(backupSource);
  if (!resultsPath) return undefined;
  return path.join(resultsPath, 'investigation_report.md');
}

export function registerReportHandlers() {
  ipcMain.handle('epoch:getReport', async (_event, backupSource: string) => {
    const reportPath = reportPathFor(backupSource);
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

  ipcMain.handle('epoch:openReport', async (_event, backupSource: string) => {
    const reportPath = reportPathFor(backupSource);
    if (!reportPath) return false;
    const result = await shell.openPath(reportPath);
    return result === '';
  });
}