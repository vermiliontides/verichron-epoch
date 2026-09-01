import React, { useEffect, useState } from 'react';
import { FolderOpen, HardDrive, Play, AlertCircle, ChevronDown, ChevronRight, CheckCircle2, XCircle, Pencil, Microscope, ArrowRight } from 'lucide-react';
import { Badge } from '../components/ui/Badge';
import { BackupRow } from '../components/BackupRow';
import { TerminalLog } from '../components/TerminalLog';
import { DevicePullPanel } from '../components/DevicePullPanel';
import type { MvtLogEntry, MvtFinishedResult, StartPipelineOptions } from '../types/window';
import type { Backup } from '@verichron/contracts';
import { applyMvtLogLine, initMvtRunProgress, type MvtRunProgress } from '../lib/mvtLogParser';

export interface WorkspaceViewProps {
  // Called once Stage 3 (orchestrator) finishes successfully -- lets App.tsx
  // switch to the Runs section and refresh its (mount-only) run list, since
  // otherwise a freshly-created pipeline_runs row wouldn't show up until an
  // unrelated reload happened to occur.
  onAnalysisComplete: () => void;
}

export function WorkspaceView({ onAnalysisComplete }: WorkspaceViewProps) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  const [backups, setBackups] = useState<Backup[]>([]);
  const [discoveringBackups, setDiscoveringBackups] = useState(false);
  const [discoverError, setDiscoverError] = useState<string | null>(null);
  const [selectedLabels, setSelectedLabels] = useState<Set<string>>(new Set());

  const [showOptions, setShowOptions] = useState(false);
  const [workspace, setWorkspace] = useState('');
  const [forceDecrypt, setForceDecrypt] = useState(false);
  const [refreshIOCs, setRefreshIOCs] = useState(false);

  const [isStarting, setIsStarting] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [logLines, setLogLines] = useState<MvtLogEntry[]>([]);
  const [finishResult, setFinishResult] = useState<MvtFinishedResult | null>(null);

  // Plain-English progress, derived from the same log lines as logLines
  // above. null until the first run of this session starts; stays
  // populated after a run finishes so the backup list can show last-run
  // results once it reverts to checkboxes.
  const [runProgress, setRunProgress] = useState<MvtRunProgress | null>(null);

  const [pendingPasswordFor, setPendingPasswordFor] = useState<string | null>(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [submittingPassword, setSubmittingPassword] = useState(false);

  // Stage 3 (orchestrator) -- runs after mvt-runner finishes, against the
  // exact workspace mvt-runner just used. This is what actually creates a
  // pipeline_runs row; without it, a completed Stage 1 run has nowhere to
  // go (see epoch:startAnalysis's own comment in main.ts for the full
  // Stage 1 vs Stage 3 split).
  const [lastRunWorkspace, setLastRunWorkspace] = useState<string | null>(null);
  const [analysisRunning, setAnalysisRunning] = useState(false);
  const [analysisLog, setAnalysisLog] = useState<MvtLogEntry[]>([]);
  const [analysisResult, setAnalysisResult] = useState<MvtFinishedResult | null>(null);
  const [analysisStartError, setAnalysisStartError] = useState<string | null>(null);

  useEffect(() => {
    const unsubLog = window.epoch.onMvtLog((entry) => {
      setLogLines((prev) => [...prev, entry]);
      setRunProgress((prev) => (prev ? applyMvtLogLine(prev, entry.line) : prev));
    });
    const unsubPassword = window.epoch.onMvtPasswordRequired((backupName) => {
      setPendingPasswordFor(backupName);
      setPasswordInput('');
    });
    const unsubFinished = window.epoch.onMvtFinished((result) => {
      setIsRunning(false);
      setFinishResult(result);
    });
    const unsubOrchestratorLog = window.epoch.onOrchestratorLog((entry) => {
      setAnalysisLog((prev) => [...prev, entry]);
    });
    const unsubOrchestratorFinished = window.epoch.onOrchestratorFinished((result) => {
      setAnalysisRunning(false);
      setAnalysisResult(result);
    });
    return () => {
      unsubLog();
      unsubPassword();
      unsubFinished();
      unsubOrchestratorLog();
      unsubOrchestratorFinished();
    };
  }, []);

  const handleSelectDirectory = async () => {
    const dir = await window.epoch.selectBackupDirectory();
    if (dir) setSelectedPath(dir);
  };

  // Re-discover whenever the source directory changes, so the checkbox
  // list always reflects what mvt-runner would actually find under it --
  // not a stale list from a previously selected directory.
  useEffect(() => {
    if (!selectedPath) {
      setBackups([]);
      setSelectedLabels(new Set());
      setDiscoverError(null);
      return;
    }
    let cancelled = false;
    setDiscoveringBackups(true);
    setDiscoverError(null);
    window.epoch
      .discoverBackups(selectedPath)
      .then((found) => {
        if (cancelled) return;
        setBackups(found);
        setSelectedLabels(new Set(found.map((b) => b.label))); // default: everything selected
      })
      .catch((err) => {
        if (cancelled) return;
        setBackups([]);
        setSelectedLabels(new Set());
        setDiscoverError(err instanceof Error ? err.message : 'Unknown error');
      })
      .finally(() => {
        if (!cancelled) setDiscoveringBackups(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedPath]);

  const toggleBackup = (label: string) => {
    setSelectedLabels((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const selectAllBackups = () => setSelectedLabels(new Set(backups.map((b) => b.label)));
  const selectNoBackups = () => setSelectedLabels(new Set());

  const handleStartPipeline = async () => {
    if (!selectedPath || selectedLabels.size === 0) return;
    setIsStarting(true);
    setStartError(null);
    setLogLines([]);
    setFinishResult(null);
    // A fresh Stage 1 run invalidates any prior Stage 3 result -- it was
    // for a previous set of backups, not this one.
    setAnalysisResult(null);
    setAnalysisLog([]);
    setAnalysisStartError(null);
    const selected = Array.from(selectedLabels);
    setRunProgress(initMvtRunProgress(selected));
    try {
      const options: StartPipelineOptions = {
        workspace: workspace.trim() || undefined,
        forceDecrypt,
        refreshIOCs,
        only: selected,
      };
      const result = await window.epoch.startPipeline(selectedPath, options);
      setLastRunWorkspace(result.workspace);
      setIsRunning(true);
    } catch (err) {
      setStartError(err instanceof Error ? err.message : 'Unknown error');
      setRunProgress(null);
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

  const handleStartAnalysis = async () => {
    if (!lastRunWorkspace) return;
    setAnalysisRunning(true);
    setAnalysisStartError(null);
    setAnalysisLog([]);
    setAnalysisResult(null);
    try {
      await window.epoch.startAnalysis(lastRunWorkspace);
    } catch (err) {
      setAnalysisStartError(err instanceof Error ? err.message : 'Unknown error');
      setAnalysisRunning(false);
    }
  };

  const busy = isStarting || isRunning;

  const doneCount = runProgress ? runProgress.order.filter((l) => runProgress.byLabel[l].overall === 'done').length : 0;
  const failedCount = runProgress
    ? runProgress.order.filter((l) => runProgress.byLabel[l].overall === 'failed').length
    : 0;

  return (
    <div className="flex-1 flex flex-col p-8 max-w-4xl mx-auto w-full min-h-full gap-5">
      <div>
        <h1 className="font-display text-lg font-medium text-foreground mb-1">New Investigation</h1>
        <p className="text-sm text-muted-foreground">
          Select a directory of already-encrypted mobile backups to decrypt and scan with mvt-runner.
        </p>
      </div>

      {!selectedPath ? (
        <>
          <DevicePullPanel onBackupPulled={(destDir) => setSelectedPath(destDir)} />
          <div
            onClick={handleSelectDirectory}
            className="group relative flex flex-col items-center justify-center p-12 border-2 border-dashed border-border rounded-xl bg-surface/30 hover:bg-surface/60 hover:border-accent cursor-pointer transition-all"
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
        </>
      ) : (
        <>
          {/* Compact source bar -- replaces the import hero once a directory is
              picked, so it doesn't keep eating a third of the screen while the
              actual work (backup list, progress, log) needs the room. */}
          <div className="flex items-center gap-3 bg-surface border border-border rounded-lg px-4 py-3">
            <HardDrive className="text-accent shrink-0" size="1.125rem" />
            <div className="min-w-0 flex-1">
              <p className="text-2xs text-muted-foreground uppercase tracking-wide font-medium">Source directory</p>
              <p className="text-sm font-mono text-foreground truncate" title={selectedPath}>
                {selectedPath}
              </p>
            </div>
            {!busy && (
              <button
                onClick={handleSelectDirectory}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-accent transition-colors shrink-0"
              >
                <Pencil size="0.8rem" />
                Change
              </button>
            )}
          </div>

          <div className="bg-surface border border-border rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-foreground">
                Backups{backups.length > 0 ? ` (${backups.length})` : ''}
              </p>
              <div className="flex items-center gap-3">
                {backups.length > 1 && !busy && (
                  <div className="flex items-center gap-2 text-2xs">
                    <button onClick={selectAllBackups} className="text-accent hover:underline">
                      Select all
                    </button>
                    <span className="text-muted-foreground">/</span>
                    <button onClick={selectNoBackups} className="text-accent hover:underline">
                      Select none
                    </button>
                  </div>
                )}
                <button
                  onClick={handleStartPipeline}
                  disabled={busy || discoveringBackups || selectedLabels.size === 0}
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
                      Run{selectedLabels.size > 0 ? ` (${selectedLabels.size})` : ''}
                    </>
                  )}
                </button>
              </div>
            </div>

            {discoveringBackups && <p className="text-sm text-muted-foreground">Scanning directory for backups...</p>}

            {!discoveringBackups && discoverError && (
              <p className="text-sm text-danger">Could not scan directory: {discoverError}</p>
            )}

            {!discoveringBackups && !discoverError && backups.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No backups found under this directory (looked for Manifest.db / Info.plist in subdirectories).
              </p>
            )}

            {!discoveringBackups && backups.length > 0 && (
              <div className="border border-border rounded-md divide-y divide-border max-h-72 overflow-auto">
                {backups.map((b) => {
                  const progress = runProgress?.byLabel[b.label];
                  const isLive = busy && !!progress;
                  const overall = progress?.overall;
                  const lastResult: 'done' | 'failed' | undefined =
                    !busy && (overall === 'done' || overall === 'failed') ? overall : undefined;
                  return (
                    <BackupRow
                      key={b.label}
                      backup={b}
                      selected={selectedLabels.has(b.label)}
                      onToggle={() => toggleBackup(b.label)}
                      disabled={busy}
                      liveProgress={isLive ? progress : undefined}
                      awaitingPassword={isLive && pendingPasswordFor === b.label}
                      lastResult={lastResult}
                    />
                  );
                })}
              </div>
            )}

            <div className="mt-4 pt-4 border-t border-border">
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
          </div>
        </>
      )}

      {startError && (
        <div className="flex items-start gap-2 text-danger bg-danger/10 border border-danger/30 rounded-md p-3 text-sm">
          <AlertCircle size="1rem" className="shrink-0 mt-0.5" />
          {startError}
        </div>
      )}

      {finishResult && runProgress && (
        <div
          className={`flex items-center gap-3 rounded-lg p-4 border ${
            failedCount === 0 ? 'bg-accent/10 border-accent/30' : 'bg-danger/10 border-danger/30'
          }`}
        >
          {failedCount === 0 ? (
            <CheckCircle2 className="text-accent shrink-0" size="1.25rem" />
          ) : (
            <XCircle className="text-danger shrink-0" size="1.25rem" />
          )}
          <div className="text-sm">
            <p className={failedCount === 0 ? 'text-accent font-medium' : 'text-danger font-medium'}>
              {failedCount === 0
                ? `All ${doneCount} backup${doneCount === 1 ? '' : 's'} finished successfully.`
                : `${doneCount} of ${runProgress.order.length} backup${
                    runProgress.order.length === 1 ? '' : 's'
                  } finished; ${failedCount} couldn't be completed.`}
            </p>
            {!finishResult.success && finishResult.error && (
              <p className="text-muted-foreground text-xs mt-0.5">{finishResult.error}</p>
            )}
          </div>
        </div>
      )}

      {(isRunning || logLines.length > 0) && <TerminalLog lines={logLines} live={isRunning} />}

      {/* Stage 3: only offered once Stage 1 has at least one successfully
          decrypted+scanned backup to analyze. Nothing here happens
          automatically -- mvt-runner's own summary above is real and
          already complete on its own; this is a distinct next step, not a
          continuation of the same run. */}
      {finishResult && runProgress && doneCount > 0 && lastRunWorkspace && (
        <div className="bg-surface border border-border rounded-lg p-5">
          <div className="flex items-center gap-2 mb-2">
            <Microscope className="text-accent" size="1.125rem" />
            <h3 className="font-display text-base font-medium text-foreground">Analyze results</h3>
          </div>

          {!analysisRunning && !analysisResult && (
            <>
              <p className="text-sm text-muted-foreground mb-3">
                Run the forensic extractors against the {doneCount} decrypted backup
                {doneCount === 1 ? '' : 's'} above and record the results -- this is what makes them show up under
                Runs, Records, and Reports.
              </p>
              <button
                onClick={handleStartAnalysis}
                className="flex items-center gap-2 bg-accent text-background hover:bg-accent/90 px-4 py-2 rounded-md font-medium text-sm transition-colors"
              >
                <Microscope size="1rem" />
                Analyze {doneCount} backup{doneCount === 1 ? '' : 's'}
              </button>
              {analysisStartError && <p className="text-sm text-danger mt-2">{analysisStartError}</p>}
            </>
          )}

          {analysisRunning && (
            <p className="text-sm text-flag flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-flag/30 border-t-flag rounded-full animate-spin" />
              Running the forensic extractors...
            </p>
          )}

          {analysisResult && (
            <div>
              {analysisResult.success ? (
                <>
                  <p className="text-sm text-accent flex items-center gap-2 mb-3">
                    <CheckCircle2 size="1rem" /> Analysis complete.
                  </p>
                  <button
                    onClick={onAnalysisComplete}
                    className="flex items-center gap-2 bg-accent text-background hover:bg-accent/90 px-4 py-2 rounded-md font-medium text-sm transition-colors"
                  >
                    View results in Runs
                    <ArrowRight size="1rem" />
                  </button>
                </>
              ) : (
                <div>
                  <p className="text-sm text-danger flex items-center gap-2">
                    <XCircle size="1rem" /> Analysis failed{analysisResult.error ? `: ${analysisResult.error}` : '.'}
                  </p>
                  <button onClick={handleStartAnalysis} className="text-xs text-accent hover:underline mt-2">
                    Try again
                  </button>
                </div>
              )}
            </div>
          )}

          {(analysisRunning || analysisLog.length > 0) && (
            <div className="mt-3">
              <TerminalLog lines={analysisLog} live={analysisRunning} label="Orchestrator log" />
            </div>
          )}
        </div>
      )}

      {!selectedPath && (
        <div className="flex items-start gap-3 bg-surface border border-border rounded-lg p-4">
          <AlertCircle className="text-muted-foreground shrink-0 mt-1" size="1rem" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Tip:</strong> Pull a fresh backup directly from a connected iOS
            device above, or import a directory of backups already staged by Finder, iTunes, or another tool.
          </p>
        </div>
      )}

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