import React, { useEffect, useState } from 'react';
import {
  FolderOpen,
  HardDrive,
  Play,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Pencil,
  Smartphone,
  Sliders,
  KeyRound,
  RotateCw,
  FolderSync,
  ShieldCheck,
} from 'lucide-react';
import { Badge } from '../components/ui/Badge';
import { BackupRow } from '../components/BackupRow';
import { TerminalLog } from '../components/TerminalLog';
import { DevicePullPanel } from '../components/DevicePullPanel';
import type { MvtLogEntry, MvtFinishedResult, StartPipelineOptions } from '../types/window';
import type { Backup } from '@verichron/contracts';
import { applyMvtLogLine, initMvtRunProgress, type MvtRunProgress } from '../lib/mvtLogParser';
import { useToast } from '../components/ui/Toast';

export function WorkspaceView() {
  const [activeTab, setActiveTab] = useState<'staged' | 'physical'>('staged');
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  const [backups, setBackups] = useState<Backup[]>([]);
  const [discoveringBackups, setDiscoveringBackups] = useState(false);
  const [discoverError, setDiscoverError] = useState<string | null>(null);
  const [selectedLabels, setSelectedLabels] = useState<Set<string>>(new Set());

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

  const { success, error: toastError } = useToast();

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
      if (result.success) {
        success('Pipeline Complete', 'All selected backups processed successfully');
      } else {
        toastError('Pipeline Finished with Errors', result.error);
      }
    });
    return () => {
      unsubLog();
      unsubPassword();
      unsubFinished();
    };
  }, [success, toastError]);

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
    const selected = Array.from(selectedLabels);
    setRunProgress(initMvtRunProgress(selected));
    try {
      const options: StartPipelineOptions = {
        workspace: workspace.trim() || undefined,
        forceDecrypt,
        refreshIOCs,
        only: selected,
      };
      await window.epoch.startPipeline(selectedPath, options);
      setIsRunning(true);
      success('Pipeline Launched', `Started analysis for ${selected.length} backup(s)`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setStartError(msg);
      setRunProgress(null);
      toastError('Failed to Start Pipeline', msg);
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

  const doneCount = runProgress
    ? runProgress.order.filter((l) => runProgress.byLabel[l].overall === 'done').length
    : 0;
  const failedCount = runProgress
    ? runProgress.order.filter((l) => runProgress.byLabel[l].overall === 'failed').length
    : 0;

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto p-8 space-y-6 bg-background">
      {/* Top Banner & Module Selector */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-border">
        <div>
          <h1 className="font-display text-xl font-bold text-foreground tracking-tight flex items-center gap-3">
            Acquisition & Ingestion Hub
            <Badge variant="accent">STATION 0</Badge>
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Physical iOS USB acquisition and cryptographically audited local backup processing
          </p>
        </div>

        {/* Tab switcher with clear segmented design */}
        <div className="flex items-center p-1 rounded-xl bg-surface border border-border shadow-sm shrink-0">
          <button
            onClick={() => setActiveTab('staged')}
            className={`flex items-center gap-2.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'staged'
                ? 'bg-surface-raised text-foreground border border-accent/40 shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <HardDrive size="0.95rem" className={activeTab === 'staged' ? 'text-accent' : ''} />
            Import Local Backups
          </button>
          <button
            onClick={() => setActiveTab('physical')}
            className={`flex items-center gap-2.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'physical'
                ? 'bg-surface-raised text-foreground border border-accent/40 shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Smartphone size="0.95rem" className={activeTab === 'physical' ? 'text-accent' : ''} />
            Live Device Pull (USB)
          </button>
        </div>
      </div>

      {/* Main Workspace Area */}
      {activeTab === 'physical' ? (
        <DevicePullPanel
          onBackupPulled={(destDir) => {
            setSelectedPath(destDir);
            setActiveTab('staged');
            success('Backup Ready', 'Switched to backup ingestion panel');
          }}
        />
      ) : (
        <>
          {!selectedPath ? (
            <div
              onClick={handleSelectDirectory}
              className="group relative flex flex-col items-center justify-center p-16 border-2 border-dashed border-border hover:border-accent/60 rounded-2xl bg-surface/30 hover:bg-surface/60 cursor-pointer transition-all forensic-glow text-center my-4"
            >
              <div className="w-16 h-16 rounded-2xl bg-surface border border-border flex items-center justify-center mb-5 group-hover:border-accent/40 group-hover:bg-accent/10 transition-colors shadow-sm">
                <FolderOpen size="2.25rem" className="text-muted-foreground group-hover:text-accent transition-colors" />
              </div>
              <h3 className="font-display text-lg font-bold text-foreground mb-2">
                Select Forensic iOS Backup Directory
              </h3>
              <p className="text-xs text-muted-foreground font-mono mb-6 max-w-xl leading-relaxed">
                macOS: <span className="text-foreground/90 font-medium">~/Library/Application Support/MobileSync/Backup/</span>
                <br />
                Windows: <span className="text-foreground/90 font-medium">%appdata%\Apple Computer\MobileSync\Backup\</span>
              </p>
              <div className="flex items-center gap-2.5 px-5 py-2.5 rounded-xl bg-surface-raised border border-border group-hover:border-accent/50 text-xs font-semibold text-foreground transition-all shadow-sm">
                <FolderOpen size="1rem" className="text-accent" />
                <span>Browse Local Forensic Storage</span>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Selected Source Header Banner */}
              <div className="flex items-center justify-between bg-surface border border-border rounded-xl px-5 py-4 shadow-sm">
                <div className="flex items-center gap-4 min-w-0 flex-1">
                  <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/30 flex items-center justify-center text-accent shrink-0">
                    <HardDrive size="1.25rem" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-3xs uppercase tracking-widest font-bold text-muted-foreground">
                      Target Forensic Volume
                    </p>
                    <p className="text-xs font-mono font-semibold text-foreground truncate mt-0.5" title={selectedPath}>
                      {selectedPath}
                    </p>
                  </div>
                </div>

                {!busy && (
                  <button
                    onClick={handleSelectDirectory}
                    className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-mono text-muted-foreground hover:text-foreground hover:border-accent/50 bg-surface-raised border border-border transition-colors shrink-0 cursor-pointer ml-4 shadow-sm"
                  >
                    <Pencil size="0.8rem" />
                    Change Path
                  </button>
                )}
              </div>

              {/* 2-Column Workstation Layout */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left (2 cols): Backups List */}
                <div className="lg:col-span-2 bg-surface border border-border rounded-xl p-5 shadow-sm space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-border">
                    <div className="flex items-center gap-2.5">
                      <p className="text-sm font-bold text-foreground">Discovered Backups</p>
                      <Badge variant="neutral">{backups.length} Available</Badge>
                    </div>

                    {backups.length > 1 && !busy && (
                      <div className="flex items-center gap-2 text-2xs font-mono">
                        <button
                          onClick={selectAllBackups}
                          className="text-accent hover:underline cursor-pointer"
                        >
                          Select All
                        </button>
                        <span className="text-muted-foreground">/</span>
                        <button
                          onClick={selectNoBackups}
                          className="text-muted-foreground hover:text-foreground cursor-pointer"
                        >
                          Select None
                        </button>
                      </div>
                    )}
                  </div>

                  {discoveringBackups && (
                    <div className="flex items-center justify-center gap-3 py-12 text-xs font-mono text-muted-foreground">
                      <RotateCw size="1rem" className="animate-spin text-accent" />
                      Scanning directory for iOS backups (Manifest.db / Info.plist)...
                    </div>
                  )}

                  {!discoveringBackups && discoverError && (
                    <div className="flex items-start gap-3 p-4 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs font-mono">
                      <AlertCircle size="1.1rem" className="shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold">Failed to Scan Target Directory</p>
                        <p className="mt-0.5">{discoverError}</p>
                      </div>
                    </div>
                  )}

                  {!discoveringBackups && !discoverError && backups.length === 0 && (
                    <div className="p-12 text-center text-xs text-muted-foreground">
                      <p className="font-bold text-foreground text-sm mb-1">No iOS Backups Discovered</p>
                      <p className="text-3xs font-mono max-w-sm mx-auto">
                        Looking for subdirectories with <code className="text-accent">Manifest.db</code> or{' '}
                        <code className="text-accent">Info.plist</code>.
                      </p>
                    </div>
                  )}

                  {!discoveringBackups && backups.length > 0 && (
                    <div className="border border-border rounded-xl divide-y divide-border max-h-80 overflow-auto bg-surface-raised/20">
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
                </div>

                {/* Right (1 col): Parameters & Launcher */}
                <div className="space-y-4">
                  <div className="bg-surface border border-border rounded-xl p-5 shadow-sm space-y-4">
                    <div className="flex items-center gap-2 pb-3 border-b border-border">
                      <Sliders size="0.95rem" className="text-accent" />
                      <h3 className="font-display text-xs font-bold uppercase tracking-wider text-foreground">
                        Execution Parameters
                      </h3>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="text-3xs uppercase tracking-wider font-bold text-muted-foreground block mb-1">
                          Workspace Directory
                        </label>
                        <input
                          type="text"
                          value={workspace}
                          onChange={(e) => setWorkspace(e.target.value)}
                          disabled={busy}
                          placeholder="~/mvt-workspace"
                          className="w-full bg-background border border-border focus:border-accent rounded-lg px-3 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground/50 disabled:opacity-50"
                        />
                      </div>

                      <div className="space-y-2 pt-1">
                        <label className="flex items-start gap-2.5 text-xs text-foreground cursor-pointer">
                          <input
                            type="checkbox"
                            checked={forceDecrypt}
                            onChange={(e) => setForceDecrypt(e.target.checked)}
                            disabled={busy}
                            className="mt-0.5 rounded border-border text-accent focus:ring-accent accent-accent"
                          />
                          <span className="text-2xs text-muted-foreground leading-snug">
                            Force re-decryption of previously decrypted artifacts
                          </span>
                        </label>

                        <label className="flex items-start gap-2.5 text-xs text-foreground cursor-pointer">
                          <input
                            type="checkbox"
                            checked={refreshIOCs}
                            onChange={(e) => setRefreshIOCs(e.target.checked)}
                            disabled={busy}
                            className="mt-0.5 rounded border-border text-accent focus:ring-accent accent-accent"
                          />
                          <span className="text-2xs text-muted-foreground leading-snug">
                            Sync latest IOC threat indicators prior to scan
                          </span>
                        </label>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-border">
                      <button
                        onClick={handleStartPipeline}
                        disabled={busy || discoveringBackups || selectedLabels.size === 0}
                        className="w-full flex items-center justify-center gap-2.5 bg-accent text-background hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed px-5 py-3 rounded-xl font-bold text-xs transition-all shadow-md cursor-pointer"
                      >
                        {busy ? (
                          <>
                            <div className="w-4 h-4 border-2 border-background/30 border-t-background rounded-full animate-spin" />
                            <span>{isStarting ? 'Initializing...' : 'Running Pipeline...'}</span>
                          </>
                        ) : (
                          <>
                            <Play size="1rem" fill="currentColor" />
                            <span>Execute Pipeline ({selectedLabels.size})</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Summary Card */}
                  <div className="p-4 rounded-xl border border-border bg-surface-raised/20 space-y-2">
                    <p className="text-3xs uppercase tracking-wider font-bold text-muted-foreground">
                      Station Guidance
                    </p>
                    <p className="text-3xs text-muted-foreground leading-relaxed">
                      mvt-runner sequentially decrypts, hashes, and scans selected backups. Passwords will be prompted interactively if required.
                    </p>
                  </div>
                </div>
              </div>

              {/* Start Error Callout */}
              {startError && (
                <div className="flex items-start gap-3 text-danger bg-danger/10 border border-danger/30 rounded-xl p-4 text-xs font-mono">
                  <AlertCircle size="1.25rem" className="shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-xs">Pipeline Execution Interrupted</p>
                    <p className="mt-0.5">{startError}</p>
                  </div>
                </div>
              )}

              {/* Result Status Banner */}
              {finishResult && runProgress && (
                <div
                  className={`flex items-center gap-3 rounded-xl p-5 border shadow-sm ${
                    failedCount === 0 ? 'bg-success/10 border-success/30' : 'bg-danger/10 border-danger/30'
                  }`}
                >
                  {failedCount === 0 ? (
                    <CheckCircle2 className="text-success shrink-0" size="1.5rem" />
                  ) : (
                    <XCircle className="text-danger shrink-0" size="1.5rem" />
                  )}
                  <div className="text-xs">
                    <p className={`font-bold ${failedCount === 0 ? 'text-success' : 'text-danger'}`}>
                      {failedCount === 0
                        ? `All ${doneCount} backup(s) processed and analyzed successfully.`
                        : `${doneCount} of ${runProgress.order.length} backup(s) completed; ${failedCount} encountered errors.`}
                    </p>
                    {!finishResult.success && finishResult.error && (
                      <p className="text-muted-foreground text-3xs font-mono mt-1">{finishResult.error}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Execution Terminal Log */}
              {(isRunning || logLines.length > 0) && <TerminalLog lines={logLines} live={isRunning} />}
            </div>
          )}
        </>
      )}

      {/* Decryption Password Prompt Modal */}
      {pendingPasswordFor && (
        <div className="fixed inset-0 bg-background/85 backdrop-blur-md flex items-center justify-center z-50 p-6">
          <div className="bg-surface border border-border rounded-2xl p-7 w-full max-w-md shadow-2xl space-y-5 forensic-glow">
            <div className="flex items-center gap-3.5 pb-4 border-b border-border">
              <div className="w-11 h-11 rounded-xl bg-flag/15 border border-flag/30 flex items-center justify-center text-flag">
                <KeyRound size="1.35rem" />
              </div>
              <div>
                <h3 className="font-display text-base font-bold text-foreground">Backup Decryption Key</h3>
                <p className="text-3xs text-muted-foreground">iOS Encrypted Backup Key Request</p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Enter the master encryption password for{' '}
              <strong className="text-accent font-mono">{pendingPasswordFor}</strong> to derive the decryption keys.
            </p>

            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !submittingPassword && handleSubmitPassword()}
              placeholder="Enter backup password..."
              autoFocus
              disabled={submittingPassword}
              className="w-full bg-background border border-border focus:border-accent rounded-xl px-4 py-3 text-xs font-mono text-foreground placeholder:text-muted-foreground/50 disabled:opacity-50"
            />

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={handleSubmitPassword}
                disabled={submittingPassword || !passwordInput}
                className="flex items-center gap-2 bg-accent text-background hover:bg-accent/90 disabled:opacity-50 px-5 py-2.5 rounded-xl font-bold text-xs transition-colors cursor-pointer"
              >
                {submittingPassword ? 'Verifying Key...' : 'Unlock & Decrypt'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
