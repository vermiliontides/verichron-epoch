import { ipcMain, dialog, BrowserWindow } from 'electron';
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import os from 'node:os';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { discoverBackups, type Backup } from '@verichron/contracts';
import type { MvtFinishedResult } from '../../shared/types/window';

interface StartPipelineOptions {
  workspace?: string;
  forceDecrypt?: boolean;
  refreshIOCs?: boolean;
  only?: string[];
}

const PASSWORD_PROMPT_RE = /password for (.+): $/;

export function registerPipelineHandlers(getMainWindow: () => BrowserWindow | null, repoRoot: string) {
  let runningMvtProcess: ChildProcessWithoutNullStreams | null = null;
  let runningOrchestratorProcess: ChildProcessWithoutNullStreams | null = null;
  let pendingPasswordResolve: ((password: string) => void) | null = null;

  function sendToRenderer(channel: string, ...args: unknown[]) {
    const win = getMainWindow();
    if (win) {
      win.webContents.send(channel, ...args);
    }
  }

  function makeStreamBuffer(stream: 'stdout' | 'stderr', child: ChildProcessWithoutNullStreams) {
    let pending = '';
    return (chunk: Buffer) => {
      pending += chunk.toString('utf-8');
      const lines = pending.split('\n');
      pending = lines.pop() ?? '';

      for (const line of lines) {
        sendToRenderer('epoch:mvtLog', { stream, line });
      }

      if (stream === 'stdout') {
        const match = PASSWORD_PROMPT_RE.exec(pending);
        if (match) {
          sendToRenderer('epoch:mvtLog', { stream, line: pending });
          pendingPasswordResolve = (password: string) => {
            child.stdin.write(password + '\n');
          };
          sendToRenderer('epoch:mvtPasswordRequired', match[1]);
          pending = '';
        }
      }
    };
  }

  function makeOrchestratorStreamBuffer(stream: 'stdout' | 'stderr') {
    let pending = '';
    const emitPending = () => {
      if (pending) {
        sendToRenderer('epoch:orchestratorLog', { stream, line: pending });
        pending = '';
      }
    };
    const onChunk = (chunk: Buffer) => {
      pending += chunk.toString('utf-8');
      const lines = pending.split('\n');
      pending = lines.pop() ?? '';
      for (const line of lines) {
        sendToRenderer('epoch:orchestratorLog', { stream, line });
      }
    };
    return { onChunk, emitPending };
  }

  async function readPreparationSummary(workspace: string) {
    try {
      const raw = await readFile(path.join(workspace, 'summary.json'), 'utf8');
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { backups?: unknown }).backups)) {
        return undefined;
      }
      return (parsed as { backups: Array<{ label: string; success: boolean; decrypted: boolean }> }).backups;
    } catch {
      return undefined;
    }
  }

  async function readAnalysisSummary(workspace: string) {
    try {
      const raw = await readFile(path.join(workspace, 'analysis-summary.json'), 'utf8');
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { results?: unknown }).results)) {
        return undefined;
      }
      return (parsed as { results: MvtFinishedResult['analysis'] }).results;
    } catch {
      return undefined;
    }
  }

  ipcMain.handle('epoch:selectBackupDirectory', async () => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Select a directory containing encrypted iOS backups',
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('epoch:discoverBackups', async (_event, source: string): Promise<Backup[]> => {
    if (!source || !source.trim()) {
      throw new Error('A source directory is required.');
    }
    return discoverBackups(source);
  });

  ipcMain.handle('epoch:startPipeline', async (_event, source: string, options?: StartPipelineOptions) => {
    if (runningMvtProcess) {
      throw new Error('mvt-runner is already running -- wait for it to finish before starting another.');
    }
    if (!source || !source.trim()) {
      throw new Error('A source directory is required.');
    }

    const workspacePath = options?.workspace?.trim() || path.join(os.homedir(), 'mvt-workspace');
    const args = ['--filter', '@verichron/mvt-runner', 'dev', '--', '--source', source];
    args.push('--workspace', workspacePath);
    if (options?.forceDecrypt) args.push('--force-decrypt');
    if (options?.refreshIOCs) args.push('--refresh-iocs');
    if (options?.only && options.only.length > 0) args.push('--only', options.only.join(','));

    const child = spawn('pnpm', args, { cwd: repoRoot, stdio: ['pipe', 'pipe', 'pipe'] });
    runningMvtProcess = child;
    pendingPasswordResolve = null;

    child.stdout.on('data', makeStreamBuffer('stdout', child));
    child.stderr.on('data', makeStreamBuffer('stderr', child));

    child.on('error', (err) => {
      runningMvtProcess = null;
      pendingPasswordResolve = null;
      sendToRenderer('epoch:mvtFinished', { success: false, error: err.message });
    });

    child.on('close', (code) => {
      runningMvtProcess = null;
      pendingPasswordResolve = null;
      void readPreparationSummary(workspacePath).then((backups) => {
        sendToRenderer('epoch:mvtFinished', {
          success: code === 0,
          exitCode: code,
          workspace: workspacePath,
          backups,
        });
      });
    });

    return { started: true, workspace: workspacePath };
  });

  ipcMain.handle('epoch:submitMvtPassword', async (_event, password: string) => {
    if (!runningMvtProcess || !pendingPasswordResolve) {
      throw new Error('No password prompt is currently pending.');
    }
    const resolve = pendingPasswordResolve;
    pendingPasswordResolve = null;
    resolve(password);
  });

  ipcMain.handle('epoch:startAnalysis', async (_event, workspace: string) => {
    if (runningOrchestratorProcess) {
      throw new Error('The orchestrator is already running -- wait for analysis to finish before starting another.');
    }
    if (!workspace || !workspace.trim()) {
      throw new Error('An analysis workspace is required.');
    }

    const child = spawn(
      'pnpm',
      ['--filter', '@verichron/orchestrator', 'investigate', '--', '--workspace', workspace.trim()],
      { cwd: repoRoot, stdio: ['pipe', 'pipe', 'pipe'] }
    );
    runningOrchestratorProcess = child;

    const stdoutBuffer = makeOrchestratorStreamBuffer('stdout');
    const stderrBuffer = makeOrchestratorStreamBuffer('stderr');
    child.stdout.on('data', stdoutBuffer.onChunk);
    child.stderr.on('data', stderrBuffer.onChunk);

    child.on('error', (err) => {
      runningOrchestratorProcess = null;
      sendToRenderer('epoch:orchestratorFinished', { success: false, error: err.message });
    });

    child.on('close', (code) => {
      stdoutBuffer.emitPending();
      stderrBuffer.emitPending();
      runningOrchestratorProcess = null;
      void readAnalysisSummary(workspace.trim()).then((analysis) => {
        sendToRenderer('epoch:orchestratorFinished', { success: code === 0, exitCode: code, analysis });
      });
    });

    return { started: true };
  });
}