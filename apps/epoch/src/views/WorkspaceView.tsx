import React, { useEffect, useState } from 'react';
import { FolderOpen, HardDrive, Play, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '../components/ui/Badge';
import type { MvtLogEntry, MvtFinishedResult, StartPipelineOptions } from '../types/window';

export function WorkspaceView() {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  const [showOptions, setShowOptions] = useState(false);
  const [workspace, setWorkspace] = useState('');
  const [forceDecrypt, setForceDecrypt] = useState(false);
  const [refreshIOCs, setRefreshIOCs] = useState(false);

  const [isStarting, setIsStarting] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [logLines, setLogLines] = useState<MvtLogEntry[]>([]);
  const [finishResult, setFinishResult] = useState<MvtFinishedResult | null>(null);

  const [pendingPasswordFor, setPendingPasswordFor] = useState<string | null>(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [submittingPassword, setSubmittingPassword] = useState(false);

  useEffect(() => {
    const unsubLog = window.epoch.onMvtLog((entry) => setLogLines((prev) => [...prev, entry]));
    const unsubPassword = window.epoch.onMvtPasswordRequired((backupName) => {
      setPendingPasswordFor(backupName);
      setPasswordInput('');
    });
    const unsubFinished = window.epoch.onMvtFinished((result) => {
      setIsRunning(false);
      setFinishResult(result);
    });
    return () => {
      unsubLog();
      unsubPassword();
      unsubFinished();
    };
  }, []);

  const handleSelectDirectory = async () => {
    const dir = await window.epoch.selectBackupDirectory();
    if (dir) setSelectedPath(dir);
  };

  const handleStartPipeline = async () => {
    if (!selectedPath) return;
    setIsStarting(true);
    setStartError(null);
    setLogLines([]);
    setFinishResult(null);
    try {
      const options: StartPipelineOptions = {
        workspace: workspace.trim() || undefined,
        forceDecrypt,
        refreshIOCs,
      };
      await window.epoch.startPipeline(selectedPath, options);
      setIsRunning(true);
    } catch (err) {
      setStartError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsStarting(false);
    }
  };

  const handleSubmitPassword = async () => {
    setSubmittingPassword(true);
    try {
      await window.epoch.submitMvtPassword(passwordInput);
      setPendingPasswordFor(null);
      setPasswordInput('');
    } catch (err) {
      console.error('Failed to submit password:', err);
    } finally {
      setSubmittingPassword(false);
    }
  };

  const busy = isStarting || isRunning;

  return (
    <div className="flex-1 flex flex-col p-8 max-w-4xl mx-auto w-full min-h-full">
      <div className="mb-6">
        <h1 className="font-display text-lg font-medium text-foreground mb-2">New Investigation</h1>
        <p className="text-sm text-muted-foreground">
          Select a directory of already-encrypted mobile backups to decrypt and scan with mvt-runner.
        </p>
      </div>

      <div
        onClick={busy ? undefined : handleSelectDirectory}
        className={`group relative flex flex-col items-center justify-center p-12 border-2 border-dashed border-border rounded-xl bg-surface/30 transition-all mb-6 ${
          busy ? 'opacity-50' : 'hover:bg-surface/60 hover:border-accent cursor-pointer'
        }`}
      >
        <div className="bg-surface p-4 rounded-full border border-border mb-4">
          <FolderOpen size="2rem" className="text-muted-foreground group-hover:text-accent transition-colors" />
        </div>
        <h3 className="font-display text-base font-medium text-foreground mb-1">Import Directory</h3>
        <p className="text-sm text-muted-foreground font-mono mb-4 text-center max-w-md">
          macOS: ~/Library/Application Support/MobileSync/Backup/
          <br />
          Windows: %appdata%\Apple Computer\MobileSync\Backup\
        </p>
        <Badge variant="neutral">Browse Local Files</Badge>
      </div>

      {selectedPath && (
        <div className="bg-surface border border-border rounded-lg p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3 overflow-hidden pr-4">
              <HardDrive className="text-accent shrink-0" size="1.25rem" />
              <div className="min-w-0">
                <p className="text-2xs text-muted-foreground uppercase tracking-wide font-medium mb-1">
                  Source Directory
                </p>
                <p className="text-sm font-mono text-foreground truncate" title={selectedPath}>
                  {selectedPath}
                </p>
              </div>
            </div>
            <button
              onClick={handleStartPipeline}
              disabled={busy}
              className="flex items-center gap-2 bg-accent text-background hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded-md font-medium text-sm transition-colors shrink-0"
            >
              {busy ? (
                <>
                  <div className="w-4 h-4 border-2 border-background/30 border-t-background rounded-full animate-spin" />
                  {isStarting ? 'Starting...' : 'Running...'}
                </>
              ) : (
                <>
                  <Play size="1rem" fill="currentColor" />
                  Run mvt-runner
                </>
              )}
            </button>
          </div>

          <button
            onClick={() => setShowOptions((v) => !v)}
            disabled={busy}
            className="flex items-center gap-1 text-2xs uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            {showOptions ? <ChevronDown size="0.875rem" /> : <ChevronRight size="0.875rem" />}
            Options
          </button>
          {showOptions && (
            <div className="mt-3 flex flex-col gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-2xs uppercase tracking-wide text-muted-foreground">
                  Workspace (default: ~/mvt-workspace)
                </span>
                <input
                  type="text"
                  value={workspace}
                  onChange={(e) => setWorkspace(e.target.value)}
                  disabled={busy}
                  placeholder="~/mvt-workspace"
                  className="bg-background border border-border rounded-md px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground disabled:opacity-50"
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={forceDecrypt}
                  onChange={(e) => setForceDecrypt(e.target.checked)}
                  disabled={busy}
                />
                Re-decrypt even if already decrypted
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={refreshIOCs}
                  onChange={(e) => setRefreshIOCs(e.target.checked)}
                  disabled={busy}
                />
                Refresh IOC indicator feeds before scanning
              </label>
            </div>
          )}
        </div>
      )}

      {startError && (
        <div className="text-flag bg-flag/10 border border-flag/30 rounded-md p-3 text-sm mb-6">
          Error: {startError}
        </div>
      )}

      {(isRunning || logLines.length > 0) && (
        <div className="bg-surface border border-border rounded-lg mb-6 overflow-hidden">
          <div className="px-4 py-2 border-b border-border text-2xs uppercase tracking-wide text-muted-foreground">
            mvt-runner output
          </div>
          <pre className="p-4 text-xs font-mono whitespace-pre-wrap overflow-auto max-h-64 text-foreground">
            {logLines.map((entry, i) => (
              <div key={i} className={entry.stream === 'stderr' ? 'text-flag' : undefined}>
                {entry.line}
              </div>
            ))}
          </pre>
        </div>
      )}

      {finishResult && (
        <div
          className={`rounded-md p-3 text-sm mb-6 border ${
            finishResult.success ? 'bg-accent/10 border-accent/30 text-accent' : 'bg-flag/10 border-flag/30 text-flag'
          }`}
        >
          {finishResult.success
            ? 'mvt-runner finished successfully.'
            : `mvt-runner failed${finishResult.error ? `: ${finishResult.error}` : ` (exit code ${finishResult.exitCode})`}.`}
        </div>
      )}

      <div className="flex items-start gap-3 bg-surface border border-border rounded-lg p-4">
        <AlertCircle className="text-muted-foreground shrink-0 mt-1" size="1rem" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          <strong className="text-foreground">Tip:</strong> Live device extraction over USB is currently disabled.
          Please use an external tool (like Finder, iTunes, or libimobiledevice) to stage the evidence before running
          Verichron.
        </p>
      </div>

      {pendingPasswordFor && (
        <div className="fixed inset-0 bg-background/80 flex items-center justify-center z-50">
          <div className="bg-surface border border-border rounded-lg p-6 w-full max-w-sm">
            <h3 className="font-display text-base font-medium mb-2">Password required</h3>
            <p className="text-sm text-muted-foreground mb-4">
              mvt-runner needs the backup password for{' '}
              <span className="font-mono text-foreground">{pendingPasswordFor}</span>.
            </p>
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !submittingPassword && handleSubmitPassword()}
              autoFocus
              disabled={submittingPassword}
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm font-mono text-foreground mb-4 disabled:opacity-50"
            />
            <button
              onClick={handleSubmitPassword}
              disabled={submittingPassword}
              className="w-full bg-accent text-background hover:bg-accent/90 disabled:opacity-50 px-4 py-2 rounded-md font-medium text-sm transition-colors"
            >
              {submittingPassword ? 'Submitting...' : 'Continue'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
