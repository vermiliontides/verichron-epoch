import { ipcMain, dialog, BrowserWindow } from 'electron';
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { discoverBackups, type Backup } from '@verichron/contracts';

interface StartPipelineOptions {
  workspace?: string;
  forceDecrypt?: boolean;
  refreshIOCs?: boolean;
  only?: string[];
}

const PASSWORD_PROMPT_RE = /password for (.+): $/;

export function registerPipelineHandlers(getMainWindow: () => BrowserWindow | null, repoRoot: string) {
  let runningMvtProcess: ChildProcessWithoutNullStreams | null = null;
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

    const args = ['--filter', '@verichron/mvt-runner', 'dev', '--', '--source', source];
    if (options?.workspace) args.push('--workspace', options.workspace);
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
      sendToRenderer('epoch:mvtFinished', { success: code === 0, exitCode: code });
    });

    return { started: true };
  });

  ipcMain.handle('epoch:submitMvtPassword', async (_event, password: string) => {
    if (!runningMvtProcess || !pendingPasswordResolve) {
      throw new Error('No password prompt is currently pending.');
    }
    const resolve = pendingPasswordResolve;
    pendingPasswordResolve = null;
    resolve(password);
  });
}