import React, { useEffect, useState } from 'react';
import {
  Inbox,
  MousePointerClick,
  Layers,
  Copy,
  Clock,
  Search,
  ArrowRight,
  Bug,
  Globe,
  MessageSquare,
  Wifi,
  Cloud,
  FileText,
  Workflow,
} from 'lucide-react';
import type { PipelineRunRow, StageStatusRow } from '@verichron/db-reader';
import { Badge } from '../components/ui/Badge';
import { useToast } from '../components/ui/Toast';

function runPhase(run: PipelineRunRow): 'in_progress' | 'finished' {
  return run.finished_at ? 'finished' : 'in_progress';
}

function stageDurationMs(stage: StageStatusRow): number | null {
  if (!stage.started_at || !stage.finished_at) return null;
  return new Date(stage.finished_at).getTime() - new Date(stage.started_at).getTime();
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

function getStageIcon(stageName: string) {
  switch (stageName.toLowerCase()) {
    case 'crash':
      return Bug;
    case 'safari':
      return Globe;
    case 'sms':
      return MessageSquare;
    case 'network':
      return Wifi;
    case 'gcloud':
      return Cloud;
    case 'report':
      return FileText;
    default:
      return Workflow;
  }
}

interface RunsViewProps {
  runs: PipelineRunRow[];
  loading: boolean;
  error: string | null;
  selectedRun: PipelineRunRow | null;
  stages: StageStatusRow[];
  onSelectRun: (run: PipelineRunRow) => void;
  onRefreshStages?: (runId: string) => void;
  onNavigateToRecords?: (sourceType?: string) => void;
}

export function RunsView({
  runs,
  loading,
  error,
  selectedRun,
  stages,
  onSelectRun,
  onRefreshStages,
  onNavigateToRecords,
}: RunsViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const { success } = useToast();

  useEffect(() => {
    const hasInProgressRun = runs.some((run) => runPhase(run) === 'in_progress');
    if (!hasInProgressRun || !selectedRun) return;

    const interval = setInterval(async () => {
      try {
        if (onRefreshStages) {
          onRefreshStages(selectedRun.run_id);
        }
      } catch (err) {
        console.error('Failed to poll stage status:', err);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [runs, selectedRun, onRefreshStages]);

  const filteredRuns = runs.filter((r) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return r.run_id.toLowerCase().includes(q) || r.backup_source.toLowerCase().includes(q);
  });

  const copyId = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id);
    success('Run ID Copied', id);
  };

  return (
    <div className="flex flex-1 min-h-0 divide-x divide-border h-full overflow-hidden bg-background">
      {/* Left Column: Runs Master List (38% width for optimal density) */}
      <div className="w-[38%] min-w-[360px] max-w-[460px] flex flex-col min-h-0 bg-surface/30">
        {/* Header & Search */}
        <div className="p-5 border-b border-border space-y-3 shrink-0 bg-surface/60">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <h2 className="font-display text-sm font-bold text-foreground tracking-tight">
                Pipeline Telemetry Runs
              </h2>
              {!loading && !error && (
                <Badge variant="neutral">{filteredRuns.length} Runs</Badge>
              )}
            </div>
          </div>

          <div className="relative">
            <Search size="0.9rem" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search UUID or backup path..."
              className="w-full bg-background border border-border focus:border-accent rounded-xl pl-10 pr-3.5 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground/50 transition-colors"
            />
          </div>
        </div>

        {/* Runs List */}
        <div className="flex-1 overflow-auto divide-y divide-border/60">
          {error ? (
            <div className="p-5 m-5 text-xs font-mono text-danger bg-danger/10 border border-danger/30 rounded-xl">
              {error}
            </div>
          ) : loading ? (
            <div className="p-5 space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-20 rounded-xl bg-surface/60 border border-border animate-pulse" />
              ))}
            </div>
          ) : filteredRuns.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-72 text-muted-foreground p-6 text-center">
              <Inbox size="2.25rem" strokeWidth={1.5} className="mb-2.5 opacity-50" />
              <p className="text-sm font-bold text-foreground">No Pipeline Runs Found</p>
              <p className="text-3xs font-mono mt-1 max-w-xs leading-relaxed">
                Launch an extraction or ingestion from the Acquisition & Ingest tab.
              </p>
            </div>
          ) : (
            filteredRuns.map((run) => {
              const phase = runPhase(run);
              const isSelected = selectedRun?.run_id === run.run_id;
              const backupName = run.backup_source.split('/').pop() ?? run.backup_source;

              return (
                <div
                  key={run.run_id}
                  onClick={() => onSelectRun(run)}
                  className={`p-4 cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-surface-raised border-l-2 border-l-accent shadow-sm'
                      : 'hover:bg-surface-raised/40 border-l-2 border-l-transparent'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => copyId(e, run.run_id)}
                        className="flex items-center gap-1 font-mono text-2xs font-bold text-accent hover:underline"
                        title="Click to copy full UUID"
                      >
                        {run.run_id.slice(0, 8)}
                        <Copy size="0.65rem" className="opacity-60" />
                      </button>
                      <Badge variant={phase === 'finished' ? 'success' : 'running'}>
                        {phase === 'finished' ? 'Completed' : 'Running'}
                      </Badge>
                    </div>

                    <span className="text-3xs font-mono text-muted-foreground">
                      {new Date(run.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  <p className="text-xs font-semibold text-foreground truncate mb-1.5" title={run.backup_source}>
                    {backupName}
                  </p>

                  <div className="flex items-center justify-between text-3xs font-mono text-muted-foreground">
                    <span className="truncate max-w-[200px]" title={run.backup_source}>
                      {run.backup_source}
                    </span>
                    <span>{new Date(run.started_at).toLocaleDateString()}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right Column: Stage Breakdown & DAG Flow (62% width for rich details) */}
      <div className="flex-1 flex flex-col min-h-0 bg-background overflow-hidden">
        {selectedRun ? (
          <div className="flex-1 overflow-auto p-6 space-y-6">
            {/* Header banner */}
            <div className="p-5 rounded-2xl bg-surface border border-border flex items-center justify-between shadow-sm">
              <div>
                <span className="text-3xs font-mono uppercase tracking-widest font-bold text-accent">
                  Active Execution Telemetry
                </span>
                <h3 className="font-display text-base font-bold text-foreground mt-0.5">
                  Target: {selectedRun.backup_source.split('/').pop() ?? selectedRun.backup_source}
                </h3>
                <p className="text-3xs font-mono text-muted-foreground mt-1 truncate max-w-lg">
                  Run UUID: <span className="text-foreground">{selectedRun.run_id}</span>
                </p>
              </div>

              <Badge variant={runPhase(selectedRun) === 'finished' ? 'success' : 'running'} className="px-3 py-1">
                {runPhase(selectedRun) === 'finished' ? 'ALL STAGES SETTLED' : 'ACTIVE PIPELINE'}
              </Badge>
            </div>

            {/* Pipeline Flowchart / DAG ribbon */}
            <div className="p-4 rounded-xl bg-surface border border-border shadow-sm">
              <p className="text-3xs uppercase tracking-widest font-bold text-muted-foreground/80 mb-3">
                Forensic Pipeline Sequence
              </p>
              <div className="flex items-center gap-2 overflow-x-auto pb-1 text-2xs font-mono">
                {['MVT Ingest', 'Decryption', 'Extraction', 'Correlation', 'Audit Dossier'].map((step, idx, arr) => (
                  <React.Fragment key={step}>
                    <div className="px-3 py-1.5 rounded-lg bg-surface-raised border border-border text-foreground font-semibold shrink-0 shadow-sm">
                      {step}
                    </div>
                    {idx < arr.length - 1 && (
                      <ArrowRight size="0.85rem" className="text-muted-foreground/60 shrink-0" />
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>

            {/* Stages Grid */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-3xs uppercase tracking-widest font-bold text-muted-foreground/80">
                  Registered Extractor Stages ({stages.length})
                </p>
              </div>

              {stages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground text-center">
                  <Layers size="2rem" strokeWidth={1.5} className="mb-2 opacity-50" />
                  <p className="text-xs font-bold text-foreground">No Stages Registered</p>
                  <p className="text-3xs font-mono mt-1">
                    Stages register dynamically as extractors execute.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {stages.map((stage) => {
                    const durationMs = stageDurationMs(stage);
                    const Icon = getStageIcon(stage.stage_name);
                    const isSucceeded = stage.status === 'succeeded';
                    const isFailed = stage.status === 'failed';
                    const isRunning = stage.status === 'running';

                    return (
                      <div
                        key={`${stage.run_id}-${stage.stage_name}`}
                        className={`p-5 rounded-xl border transition-all shadow-sm flex flex-col justify-between ${
                          isSucceeded
                            ? 'bg-surface border-border hover:border-success/40'
                            : isFailed
                            ? 'bg-danger/10 border-danger/40'
                            : isRunning
                            ? 'bg-surface border-accent/50 forensic-glow'
                            : 'bg-surface/60 border-border/60'
                        }`}
                      >
                        <div>
                          <div className="flex items-start justify-between gap-3 mb-3">
                            <div className="flex items-center gap-3">
                              <div
                                className={`w-9 h-9 rounded-lg flex items-center justify-center border ${
                                  isSucceeded
                                    ? 'bg-success/10 border-success/30 text-success'
                                    : isFailed
                                    ? 'bg-danger/15 border-danger/40 text-danger'
                                    : isRunning
                                    ? 'bg-accent/15 border-accent/30 text-accent animate-pulse'
                                    : 'bg-surface-raised border-border text-muted-foreground'
                                }`}
                              >
                                <Icon size="1.1rem" />
                              </div>
                              <div>
                                <h4 className="font-display text-xs font-bold text-foreground capitalize">
                                  {stage.stage_name} Extractor
                                </h4>
                                <p className="text-3xs font-mono text-muted-foreground">
                                  Stage ID: {stage.run_id.slice(0, 8)}
                                </p>
                              </div>
                            </div>

                            <Badge variant={stage.status}>{stage.status}</Badge>
                          </div>

                          {stage.error_message && (
                            <div className="p-3 mb-3 rounded-lg bg-danger/15 border border-danger/30 text-danger text-3xs font-mono break-all leading-relaxed">
                              <strong>Error:</strong> {stage.error_message}
                            </div>
                          )}
                        </div>

                        {/* Footer telemetry and action */}
                        <div className="flex items-center justify-between pt-3 border-t border-border/60 text-3xs font-mono text-muted-foreground mt-2">
                          <div className="flex items-center gap-1.5">
                            <Clock size="0.75rem" />
                            <span>Duration:</span>
                            <strong className="text-foreground font-semibold">
                              {durationMs !== null ? formatDuration(durationMs) : '—'}
                            </strong>
                          </div>

                          {onNavigateToRecords && isSucceeded && (
                            <button
                              onClick={() => onNavigateToRecords(stage.stage_name)}
                              className="flex items-center gap-1.5 text-accent hover:underline font-semibold cursor-pointer"
                            >
                              <span>View Records</span>
                              <ArrowRight size="0.7rem" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8 text-center">
            <MousePointerClick size="2.75rem" strokeWidth={1.5} className="mb-3 text-accent/60 animate-bounce" />
            <p className="text-sm font-bold text-foreground">Select a Pipeline Run</p>
            <p className="text-3xs font-mono mt-1.5 max-w-sm leading-relaxed">
              Click any pipeline run on the left to inspect its complete stage breakdown, execution telemetry, and extracted records.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}