import { ipcMain, dialog, BrowserWindow } from 'electron';
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import os from 'node:os';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import type { Pool } from 'pg';
import { discoverBackups, type Backup } from '@verichron/contracts';
import type { MvtFinishedResult, AnalysisRunStatus } from '../../shared/types/window';

interface StartPipelineOptions {
  workspace?: string;
  forceDecrypt?: boolean;
  refreshIOCs?: boolean;
  only?: string[];
}

const PASSWORD_PROMPT_RE = /password for (.+): $/;

// EPOCH-305: how long the orchestrator subprocess may run before Epoch gives
// up waiting and kills it. A real investigation over several large backups
// can legitimately run long, so this is intentionally generous -- it exists
// to catch a genuinely hung/deadlocked process (e.g. blocked on a stalled
// Postgres connection), not to cap ordinary runtimes. Flagging this as a
// default guess rather than a considered value -- worth tuning once there's
// real data on how long a full run against a large backup set takes.
const ORCHESTRATOR_TIMEOUT_MS = 45 * 60 * 1000; // 45 minutes

// Grace period between SIGTERM and SIGKILL when cancelling or timing out.
const KILL_GRACE_MS = 5000;

export function registerPipelineHandlers(getMainWindow: () => BrowserWindow | null, repoRoot: string, dbPool: Pool) {
  let runningMvtProcess: ChildProcessWithoutNullStreams | null = null;
  let runningOrchestratorProcess: ChildProcessWithoutNullStreams | null = null;
  // Which workspace the currently-tracked orchestrator invocation is for --
  // lets epoch:getAnalysisRunStatus tell "still actually running" apart from
  // "nothing tracked, but the DB has a dangling run from a past crash."
  let runningOrchestratorWorkspace: string | null = null;
  let orchestratorTimeoutHandle: NodeJS.Timeout | null = null;
  let orchestratorKillEscalationHandle: NodeJS.Timeout | null = null;
  // Set immediately before *we* kill the process, so the 'close'/'error'
  // handlers -- which fire identically for a crash, a clean exit, or a kill
  // we ourselves triggered -- can tell those three apart and give the
  // person an accurate message instead of a generic "orchestrator failed".
  let orchestratorTerminationReason: 'cancelled' | 'timeout' | null = null;
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

  function backupSourceLikePrefix(workspace: string): string {
    return `${path.join(workspace, 'decrypted')}${path.sep}%`;
  }

  /**
   * EPOCH-305: closes out any pipeline_runs / pipeline_stage_status rows the
   * orchestrator subprocess left dangling for this workspace when it did not
   * exit cleanly (crash, timeout, or manual cancel).
   *
   * apps/orchestrator/src/main.ts already has markRunFailed() for an
   * in-process JS exception, but that code never runs if the whole process
   * is killed or dies outright -- so a run row can be left with
   * finished_at IS NULL and stage rows stuck 'pending'/'running' forever,
   * which is indistinguishable from "still genuinely running" the next time
   * anything queries it (the exact ambiguity EPOCH-305's persistence
   * criterion is about). Epoch's main process is the one thing that
   * reliably knows the subprocess is gone, so it takes responsibility for
   * closing those rows out here.
   *
   * Scoped by workspace (backup_source LIKE '<workspace>/decrypted/%')
   * rather than by run_id: the orchestrator creates run rows per backup
   * internally and never reports their ids back over stdout, so this is the
   * coarsest-but-correct boundary available without changing that protocol.
   * Best-effort: a DB failure here doesn't block reporting the real error to
   * the renderer.
   */
  async function markWorkspaceRunsAborted(workspace: string, reason: string): Promise<void> {
    const backupSourcePrefix = backupSourceLikePrefix(workspace);
    try {
      await dbPool.query(
        `UPDATE pipeline_stage_status
            SET status = 'failed', error_message = $2, finished_at = now()
          WHERE status IN ('pending', 'running')
            AND run_id IN (
              SELECT run_id FROM pipeline_runs
               WHERE backup_source LIKE $1 AND finished_at IS NULL
            )`,
        [backupSourcePrefix, reason]
      );
      await dbPool.query(
        `UPDATE pipeline_runs
            SET finished_at = now()
          WHERE backup_source LIKE $1 AND finished_at IS NULL`,
        [backupSourcePrefix]
      );
    } catch (err) {
      console.error('[pipelineHandlers] failed to mark dangling pipeline runs aborted:', err);
    }
  }

  function clearOrchestratorTimers(): void {
    if (orchestratorTimeoutHandle) {
      clearTimeout(orchestratorTimeoutHandle);
      orchestratorTimeoutHandle = null;
    }
    if (orchestratorKillEscalationHandle) {
      clearTimeout(orchestratorKillEscalationHandle);
      orchestratorKillEscalationHandle = null;
    }
  }

  function killOrchestrator(reason: 'cancelled' | 'timeout'): void {
    if (!runningOrchestratorProcess) return;
    orchestratorTerminationReason = reason;
    runningOrchestratorProcess.kill('SIGTERM');
    orchestratorKillEscalationHandle = setTimeout(() => {
      if (runningOrchestratorProcess) {
        runningOrchestratorProcess.kill('SIGKILL');
      }
    }, KILL_GRACE_MS);
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
    const trimmedWorkspace = workspace.trim();

    const child = spawn(
      'pnpm',
      ['--filter', '@verichron/orchestrator', 'investigate', '--', '--workspace', trimmedWorkspace],
      { cwd: repoRoot, stdio: ['pipe', 'pipe', 'pipe'] }
    );
    runningOrchestratorProcess = child;
    runningOrchestratorWorkspace = trimmedWorkspace;
    orchestratorTerminationReason = null;

    // EPOCH-305 timeout guardrail: a hung orchestrator (e.g. blocked on a
    // stalled DB connection) never fires 'error' or 'close' on its own --
    // this is the only thing that gets the renderer out of an indefinite
    // spinner in that case.
    orchestratorTimeoutHandle = setTimeout(() => {
      killOrchestrator('timeout');
    }, ORCHESTRATOR_TIMEOUT_MS);

    const stdoutBuffer = makeOrchestratorStreamBuffer('stdout');
    const stderrBuffer = makeOrchestratorStreamBuffer('stderr');
    child.stdout.on('data', stdoutBuffer.onChunk);
    child.stderr.on('data', stderrBuffer.onChunk);

    child.on('error', (err) => {
      clearOrchestratorTimers();
      const reason = orchestratorTerminationReason;
      const workspaceAtFailure = runningOrchestratorWorkspace;
      runningOrchestratorProcess = null;
      runningOrchestratorWorkspace = null;
      orchestratorTerminationReason = null;
      if (workspaceAtFailure) {
        void markWorkspaceRunsAborted(workspaceAtFailure, `orchestrator process error: ${err.message}`);
      }
      sendToRenderer('epoch:orchestratorFinished', {
        success: false,
        error: err.message,
        cancelled: reason === 'cancelled',
        timedOut: reason === 'timeout',
      });
    });

    child.on('close', (code) => {
      clearOrchestratorTimers();
      stdoutBuffer.emitPending();
      stderrBuffer.emitPending();
      const reason = orchestratorTerminationReason;
      const workspaceAtClose = runningOrchestratorWorkspace ?? trimmedWorkspace;
      runningOrchestratorProcess = null;
      runningOrchestratorWorkspace = null;
      orchestratorTerminationReason = null;

      const cancelled = reason === 'cancelled';
      const timedOut = reason === 'timeout';

      // A clean `code === 0` exit means the orchestrator's own main()
      // already closed out pipeline_runs/pipeline_stage_status itself.
      // Any other outcome -- a crash, our own timeout kill, or a manual
      // cancel -- can leave rows dangling and needs the same cleanup path.
      if (code !== 0) {
        const closeReason = cancelled
          ? 'cancelled by user'
          : timedOut
            ? `orchestrator timed out after ${ORCHESTRATOR_TIMEOUT_MS / 60000} minute(s)`
            : `orchestrator process exited unexpectedly (code ${code})`;

        void markWorkspaceRunsAborted(workspaceAtClose, closeReason).then(() =>
          readAnalysisSummary(workspaceAtClose)
        ).then((analysis) => {
          sendToRenderer('epoch:orchestratorFinished', {
            success: false,
            exitCode: code,
            analysis,
            cancelled,
            timedOut,
            error: cancelled
              ? 'Analysis was cancelled.'
              : timedOut
                ? `Analysis timed out after ${ORCHESTRATOR_TIMEOUT_MS / 60000} minutes and was stopped.`
                : undefined,
          });
        });
        return;
      }

      void readAnalysisSummary(workspaceAtClose).then((analysis) => {
        sendToRenderer('epoch:orchestratorFinished', { success: true, exitCode: code, analysis });
      });
    });

    return { started: true };
  });

  ipcMain.handle('epoch:cancelAnalysis', async (): Promise<{ cancelled: boolean }> => {
    if (!runningOrchestratorProcess) {
      return { cancelled: false };
    }
    killOrchestrator('cancelled');
    return { cancelled: true };
  });

  /**
   * EPOCH-305 persistence criterion: lets the renderer ask, for a given
   * workspace, whether there's a run actually in flight right now (tracked
   * in this process), a run that was interrupted and never closed out
   * (a dangling pipeline_runs row from a past crash/cancel/timeout in an
   * earlier app session), or nothing to report. This is what lets
   * WorkspaceView reflect an interrupted run honestly on remount instead of
   * either looking falsely fresh or spinning forever.
   */
  ipcMain.handle('epoch:getAnalysisRunStatus', async (_event, workspace: string): Promise<AnalysisRunStatus> => {
    const trimmedWorkspace = (workspace ?? '').trim();
    if (!trimmedWorkspace) return { status: 'idle' };

    if (runningOrchestratorProcess && runningOrchestratorWorkspace === trimmedWorkspace) {
      return { status: 'running' };
    }

    try {
      const result = await dbPool.query(
        `SELECT 1 FROM pipeline_runs WHERE backup_source LIKE $1 AND finished_at IS NULL LIMIT 1`,
        [backupSourceLikePrefix(trimmedWorkspace)]
      );
      return { status: (result.rowCount ?? 0) > 0 ? 'interrupted' : 'idle' };
    } catch (err) {
      console.error('[pipelineHandlers] could not check analysis run status:', err);
      return { status: 'idle' };
    }
  });
}