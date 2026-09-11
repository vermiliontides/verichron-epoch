import React, { useEffect, useState } from 'react';
import { FolderOpen, HardDrive, Play, AlertCircle, ChevronDown, ChevronRight, CheckCircle2, XCircle, Pencil, Microscope, ArrowRight } from 'lucide-react';
import { BackupRow } from '../features/devicePullPanel/BackupRow';
import { TerminalLog } from '../components/layout/TerminalLog';
import { DevicePullPanel } from '../features/devicePullPanel/DevicePullPanel';
import type { MvtLogEntry, MvtFinishedResult, StartPipelineOptions } from '../../shared/types/window';
import type { Backup } from '@verichron/contracts';
import { applyMvtLogLine, initMvtRunProgress, type MvtRunProgress } from '../../shared/lib/mvtLogParser';

export interface WorkspaceViewProps {
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

  const [runProgress, setRunProgress] = useState<MvtRunProgress | null>(null);

  const [pendingPasswordFor, setPendingPasswordFor] = useState<string | null>(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [submittingPassword, setSubmittingPassword] = useState(false);

  const [lastRunWorkspace, setLastRunWorkspace] = useState<string | null>(null);
  const [analysisRunning, setAnalysisRunning] = useState(false);
  const [analysisLog, setAnalysisLog] = useState<MvtLogEntry[]>([]);
  const [analysisResult, setAnalysisResult] = useState<MvtFinishedResult | null>(null);
  const [analysisStartError, setAnalysisStartError] = useState<string | null>(null);

  useEffect(() => {
    let mvtBuffer: MvtLogEntry[] = [];
    let mvtRafId: number | null = null;

    const flushMvtBuffer = () => {
      if (mvtBuffer.length > 0) {
        const batch = [...mvtBuffer];
        mvtBuffer = [];
        setLogLines((prev) => [...prev, ...batch]);
        setRunProgress((prev) => {
          if (!prev) return prev;
          let current = prev;
          for (const item of batch) {
            current = applyMvtLogLine(current, item.line);
          }
          return current;
        });
      }
      mvtRafId = null;
    };

    let orchBuffer: MvtLogEntry[] = [];
    let orchRafId: number | null = null;

    const flushOrchBuffer = () => {
      if (orchBuffer.length > 0) {
        const batch = [...orchBuffer];
        orchBuffer = [];
        setAnalysisLog((prev) => [...prev, ...batch]);
      }
      orchRafId = null;
    };

    const unsubLog = window.epoch.onMvtLog((entry) => {
      mvtBuffer.push(entry);
      if (mvtRafId === null) {
        mvtRafId = requestAnimationFrame(flushMvtBuffer);
      }
    });
    const unsubPassword = window.epoch.onMvtPasswordRequired((backupName) => {
      setPendingPasswordFor(backupName);
      setPasswordInput('');
    });
    const unsubFinished = window.epoch.onMvtFinished((result) => {
      if (mvtRafId !== null) {
        cancelAnimationFrame(mvtRafId);
        flushMvtBuffer();
      }
      setIsRunning(false);
      setFinishResult(result);
    });
    const unsubOrchestratorLog = window.epoch.onOrchestratorLog((entry) => {
      orchBuffer.push(entry);
      if (orchRafId === null) {
        orchRafId = requestAnimationFrame(flushOrchBuffer);
      }
    });
    const unsubOrchestratorFinished = window.epoch.onOrchestratorFinished((result) => {
      if (orchRafId !== null) {
        cancelAnimationFrame(orchRafId);
        flushOrchBuffer();
      }
      setAnalysisRunning(false);
      setAnalysisResult(result);
    });
    return () => {
      if (mvtRafId !== null) cancelAnimationFrame(mvtRafId);
      if (orchRafId !== null) cancelAnimationFrame(orchRafId);
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
        setSelectedLabels(new Set(found.map((b) => b.label)));
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

  const completedBackups = finishResult?.backups?.filter((backup) => backup.success && backup.decrypted);
  const failedBackups = finishResult?.backups?.filter((backup) => !backup.success);
  const doneCount = completedBackups?.length ?? (runProgress ? runProgress.order.filter((l) => runProgress.byLabel[l].overall === 'done').length : 0);
  const failedCount = failedBackups?.length ?? (runProgress
    ? runProgress.order.filter((l) => runProgress.byLabel[l].overall === 'failed').length
    : 0);
  const analysisFailedCount = analysisResult?.analysis?.filter((result) => result.status === 'failed').length ?? 0;

  return (
    <div className="flex-1 flex flex-col p-8 max-w-4xl mx-auto w-full min-h-full gap-7">
      <div>
        <h1 className="font-display text-xl font-bold text-foreground tracking-tight mb-2">Start an investigation</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Import an iPhone backup or connect a device to examine evidence for suspicious activity.
        </p>
      </div>

      {!selectedPath ? (
        <>
          <DevicePullPanel onBackupPulled={(destDir) => setSelectedPath(destDir)} />
          <div
            onClick={handleSelectDirectory}
            className="group relative flex flex-col items-center justify-center p-12 border-2 border-dashed border-border/90 rounded-2xl bg-surface/30 hover:bg-surface/60 hover:border-accent/60 cursor-pointer transition-all shadow-xs"
          >
            <div className="bg-surface-raised p-4 rounded-full border border-border mb-4 group-hover:scale-105 group-hover:border-accent/40 transition-all">
              <FolderOpen size="2rem" className="text-muted-foreground group-hover:text-accent transition-colors" />
            </div>
            <h3 className="font-display text-base font-semibold text-foreground mb-1">Import an iPhone backup</h3>
            <p className="text-sm text-muted-foreground mb-5 text-center max-w-md leading-relaxed">
              Choose the folder containing your iPhone backups. Epoch will identify compatible backups automatically.
            </p>
            <button
              type="button"
              className="inline-flex items-center gap-2 bg-surface-raised border border-border group-hover:border-accent/50 group-hover:bg-accent group-hover:text-background text-foreground font-semibold px-4 py-2 rounded-lg text-sm shadow-xs transition-all pointer-events-none"
            >
              <FolderOpen size="1rem" /> Choose backup folder
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-3 bg-surface border border-border rounded-xl px-4 py-3 shadow-xs">
            <div className="p-1.5 rounded-lg bg-accent/10 text-accent shrink-0">
              <HardDrive size="1.125rem" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-2xs text-muted-foreground uppercase tracking-wider font-semibold">Evidence location</p>
              <p className="text-sm font-mono text-foreground font-medium truncate" title={selectedPath}>
                {selectedPath}
              </p>
            </div>
            {!busy && (
              <button
                onClick={handleSelectDirectory}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-raised border border-border hover:border-accent/40 text-xs font-medium text-foreground hover:text-accent transition-all shadow-xs shrink-0 cursor-pointer"
              >
                <Pencil size="0.75rem" />
                Change
              </button>
            )}
          </div>

          <div className="bg-surface border border-border rounded-xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <p className="text-sm font-semibold text-foreground">
                Backups found{backups.length > 0 ? ` (${backups.length})` : ''}
              </p>
              <div className="flex items-center gap-3">
                {backups.length > 1 && !busy && (
                  <div className="flex items-center gap-1.5 text-xs bg-surface-raised border border-border/80 rounded-lg p-1">
                    <button
                      onClick={selectAllBackups}
                      className="px-2.5 py-1 rounded-md text-foreground/80 hover:text-foreground hover:bg-surface transition-colors cursor-pointer font-medium"
                    >
                      Select all
                    </button>
                    <span className="text-border">|</span>
                    <button
                      onClick={selectNoBackups}
                      className="px-2.5 py-1 rounded-md text-foreground/80 hover:text-foreground hover:bg-surface transition-colors cursor-pointer font-medium"
                    >
                      Select none
                    </button>
                  </div>
                )}
                <button
                  onClick={handleStartPipeline}
                  disabled={busy || discoveringBackups || selectedLabels.size === 0}
                  className="inline-flex items-center gap-2 bg-accent text-background hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99] px-5 py-2.5 rounded-lg font-semibold text-sm shadow-sm shadow-accent/15 transition-all shrink-0 cursor-pointer"
                >
                  {busy ? (
                    <>
                      <div className="w-4 h-4 border-2 border-background/30 border-t-background rounded-full animate-spin" />
                      <span>{isStarting ? 'Starting...' : 'Running...'}</span>
                    </>
                  ) : (
                    <>
                      <Play size="1rem" fill="currentColor" />
                      <span>Prepare evidence{selectedLabels.size > 0 ? ` (${selectedLabels.size})` : ''}</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {discoveringBackups && <p className="text-sm text-muted-foreground">Looking for compatible iPhone backups...</p>}

            {!discoveringBackups && discoverError && (
              <p className="text-sm text-danger">Could not scan directory: {discoverError}</p>
            )}

            {!discoveringBackups && !discoverError && backups.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No compatible iPhone backups were found here. Choose the folder where your device backups are stored.
              </p>
            )}

            {!discoveringBackups && backups.length > 0 && (
              <div className="border border-border/80 rounded-xl divide-y divide-border/60 max-h-80 overflow-auto bg-surface/40 shadow-inner">
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

            <div className="mt-6 pt-5 border-t border-border/70">
              <button
                onClick={() => setShowOptions((v) => !v)}
                disabled={busy}
                className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wider font-semibold text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 cursor-pointer"
              >
                {showOptions ? <ChevronDown size="0.9rem" /> : <ChevronRight size="0.9rem" />}
                Advanced settings
              </button>
              {showOptions && (
                <div className="mt-4 flex flex-col gap-4 p-4 rounded-xl bg-surface/30 border border-border/60">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-2xs uppercase tracking-wider font-semibold text-muted-foreground">
                      Analysis workspace (optional)
                    </span>
                    <input
                      type="text"
                      value={workspace}
                      onChange={(e) => setWorkspace(e.target.value)}
                      disabled={busy}
                      placeholder="Use the default workspace"
                      className="bg-background/90 border border-border/80 focus:border-accent focus:outline-none rounded-lg px-3.5 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground/60 disabled:opacity-50 transition-colors"
                    />
                  </label>
                  <label className="flex items-center gap-3 text-sm cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={forceDecrypt}
                      onChange={(e) => setForceDecrypt(e.target.checked)}
                      disabled={busy}
                      className="accent-accent w-4 h-4 rounded"
                    />
                    <span className="text-foreground/90">Process backups again, even if they were previously imported</span>
                  </label>
                  <label className="flex items-center gap-3 text-sm cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={refreshIOCs}
                      onChange={(e) => setRefreshIOCs(e.target.checked)}
                      disabled={busy}
                      className="accent-accent w-4 h-4 rounded"
                    />
                    <span className="text-foreground/90">Update threat indicators before analysis</span>
                  </label>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {startError && (
        <div className="flex items-start gap-3 text-danger bg-danger/10 border border-danger/30 rounded-xl p-4 sm:p-5 text-sm shadow-xs">
          <AlertCircle size="1.25rem" className="shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Failed to start preparation</p>
            <p className="text-xs text-danger/80 mt-0.5">{startError}</p>
          </div>
        </div>
      )}

      {finishResult && runProgress && (
        <div
          className={`flex items-start gap-3.5 rounded-xl p-5 border shadow-xs ${
            failedCount === 0 ? 'bg-accent/10 border-accent/30' : 'bg-danger/10 border-danger/30'
          }`}
        >
          {failedCount === 0 ? (
            <CheckCircle2 className="text-accent shrink-0 mt-0.5" size="1.25rem" />
          ) : (
            <XCircle className="text-danger shrink-0 mt-0.5" size="1.25rem" />
          )}
          <div className="text-sm">
            <p className={failedCount === 0 ? 'text-accent font-semibold' : 'text-danger font-semibold'}>
              {failedCount === 0
                ? `Analysis completed for all ${doneCount} backup${doneCount === 1 ? '' : 's'}.`
                : `${doneCount} of ${runProgress.order.length} backup${
                    runProgress.order.length === 1 ? '' : 's'
                  } finished; ${failedCount} couldn't be completed.`}
            </p>
            {!finishResult.success && finishResult.error && (
              <p className="text-muted-foreground text-xs mt-1">{finishResult.error}</p>
            )}
          </div>
        </div>
      )}

      {(isRunning || logLines.length > 0) && <TerminalLog lines={logLines} live={isRunning} />}

      {finishResult && runProgress && doneCount > 0 && lastRunWorkspace && (
        <div className="bg-surface border border-border rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="p-1.5 rounded-md bg-accent/10 text-accent">
              <Microscope size="1.25rem" />
            </div>
            <div>
              <h3 className="font-display text-base font-semibold text-foreground">Run forensic analysis</h3>
              <p className="text-xs text-muted-foreground">Examine prepared data for threat indicators and timeline anomalies</p>
            </div>
          </div>

          {!analysisRunning && !analysisResult && (
            <div className="mt-4">
              <p className="text-sm text-foreground/80 leading-relaxed mb-4">
                Run forensic analysis on the {doneCount} prepared backup{doneCount === 1 ? '' : 's'} to find indicators,
                and timeline anomalies.
              </p>
              <button
                onClick={handleStartAnalysis}
                className="inline-flex items-center gap-2 bg-accent text-background hover:bg-accent/90 active:scale-[0.99] px-5 py-2.5 rounded-lg font-semibold text-sm shadow-sm shadow-accent/15 cursor-pointer transition-all"
              >
                <Microscope size="1rem" />
                Run forensic analysis on {doneCount} backup{doneCount === 1 ? '' : 's'}
              </button>
              {analysisStartError && (
                <div className="flex items-center gap-2 text-sm text-danger mt-3">
                  <AlertCircle size="1rem" />
                  <span>{analysisStartError}</span>
                </div>
              )}
            </div>
          )}

          {analysisRunning && (
            <div className="flex items-center gap-3 text-sm text-flag py-3">
              <div className="w-4 h-4 border-2 border-flag/30 border-t-flag rounded-full animate-spin shrink-0" />
              <span>Examining the imported evidence...</span>
            </div>
          )}

          {analysisResult && (
            <div>
              {analysisResult.success && analysisFailedCount === 0 ? (
                <>
                  <p className="text-sm text-accent flex items-center gap-2 mb-3">
                    <CheckCircle2 size="1rem" /> Analysis complete.
                  </p>
                  {analysisResult.analysis && (
                    <p className="text-xs text-muted-foreground mb-3">
                      {analysisResult.analysis.filter((result) => result.status === 'succeeded').length} investigation
                      {analysisResult.analysis.filter((result) => result.status === 'succeeded').length === 1 ? '' : 's'}
                      analyzed
                      {analysisResult.analysis.filter((result) => result.status === 'skipped').length > 0
                        ? `, ${analysisResult.analysis.filter((result) => result.status === 'skipped').length} already up to date`
                        : ''}
                      .
                    </p>
                  )}
                  <button
                    onClick={onAnalysisComplete}
                    className="inline-flex items-center gap-2 bg-accent text-background hover:bg-accent/90 active:scale-[0.99] px-5 py-2.5 rounded-lg font-semibold text-sm shadow-sm shadow-accent/15 cursor-pointer transition-all"
                  >
                    View investigation
                    <ArrowRight size="1rem" />
                  </button>
                </>
              ) : (
                <div>
                  <p className="text-sm text-danger flex items-center gap-2">
                    <XCircle size="1rem" />
                    {analysisFailedCount > 0
                      ? `Analysis completed with ${analysisFailedCount} investigation${analysisFailedCount === 1 ? '' : 's'} needing attention.`
                      : `Analysis failed${analysisResult.error ? `: ${analysisResult.error}` : '.'}`}
                  </p>
                  {analysisResult.analysis && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {analysisResult.analysis.filter((result) => result.status === 'failed').length} investigation
                      {analysisResult.analysis.filter((result) => result.status === 'failed').length === 1 ? '' : 's'}
                      need attention.
                    </p>
                  )}
                  <button onClick={handleStartAnalysis} className="text-xs text-accent hover:underline mt-2">
                    Try again
                  </button>
                </div>
              )}
            </div>
          )}

          {(analysisRunning || analysisLog.length > 0) && (
            <div className="mt-4">
              <TerminalLog lines={analysisLog} live={analysisRunning} label="Analysis details" />
            </div>
          )}
        </div>
      )}

      {!selectedPath && (
        <div className="flex items-start gap-3.5 bg-surface-raised/40 border border-border/80 rounded-xl p-4 sm:p-5 shadow-xs">
          <AlertCircle className="text-accent shrink-0 mt-0.5" size="1.125rem" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            <strong className="text-foreground font-semibold">Tip:</strong> Connect an iPhone by USB to import a fresh backup,
            or choose an existing backup folder from your computer.
          </p>
        </div>
      )}

      {pendingPasswordFor && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-xs flex items-center justify-center z-50">
          <div className="bg-surface border border-border rounded-xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="font-display text-base font-semibold mb-1 text-foreground">Password required</h3>
            <p className="text-sm text-muted-foreground mb-4">
              The selected backup requires its password for{' '}
              <span className="font-mono text-foreground font-medium">{pendingPasswordFor}</span>.
            </p>
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !submittingPassword && handleSubmitPassword()}
              autoFocus
              disabled={submittingPassword}
              className="w-full bg-surface-raised border border-border focus:border-accent focus:outline-hidden rounded-lg px-3.5 py-2.5 text-sm font-mono text-foreground mb-4 disabled:opacity-50 transition-colors"
            />
            <button
              onClick={handleSubmitPassword}
              disabled={submittingPassword}
              className="w-full bg-accent text-background hover:bg-accent/90 active:scale-[0.99] disabled:opacity-50 px-4 py-2.5 rounded-lg font-semibold text-sm shadow-sm shadow-accent/15 cursor-pointer transition-all"
            >
              {submittingPassword ? 'Submitting...' : 'Continue'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}