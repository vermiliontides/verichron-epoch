import React, { useEffect, useState } from 'react';
import { Inbox, MousePointerClick, Layers, RefreshCw } from 'lucide-react';
import type { PipelineRunRow, StageStatusRow } from '@verichron/etl-db-reader';
import type { MvtLogEntry, MvtFinishedResult } from '../../shared/types/window';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { TerminalLog } from '../components/layout/TerminalLog';
import { pipelineApi } from '../api/pipeline';
/**
 * Field names here are pulled directly from PipelineRunRow/StageStatusRow
 * (packages/db-reader), checked against packages/db/migrations/0001_init.sql.
 *
 * pipeline_runs has no `status` column at all -- run-level "did it happen"
 * and stage-level "what succeeded" are deliberately separate per the
 * schema's own header comment. What's shown for a run is only what
 * pipeline_runs actually has: whether it's finished, and when. A real
 * success/failure rollup at the runs-list level needs either a Postgres
 * view aggregating worst-stage-status per run, or a second query -- worth
 * doing, but that's a feature to design, not implemented here.
 */
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
 
interface RunsViewProps {
  runs: PipelineRunRow[];
  loading: boolean;
  error: string | null;
  selectedRun: PipelineRunRow | null;
  stages: StageStatusRow[];
  onSelectRun: (run: PipelineRunRow) => void;
  onRefreshStages?: (runId: string) => void;
  onRefreshRun?: (runId: string) => void | Promise<void>;
}
 
const thClass =
  'sticky top-0 bg-surface/90 backdrop-blur-md z-10 text-left text-muted-foreground px-4 py-3 border-b border-border text-label uppercase tracking-wider';
const tdClass = 'px-4 py-3 border-b border-border text-data';
 
function EmptyState({ icon: Icon, title, detail }: { icon: typeof Inbox; title: string; detail?: string }) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-2 text-muted-foreground py-16">
      <Icon size="1.5rem" strokeWidth={1.5} />
      <p className="text-data">{title}</p>
      {detail && <p className="text-data font-mono opacity-80">{detail}</p>}
    </div>
  );
}
 
function RunsTableSkeleton() {
  return (
    <table className="w-full border-collapse relative">
      <thead>
        <tr>
          <th className={thClass}>Evidence source</th>
          <th className={thClass}>Status</th>
          <th className={thClass}>Started</th>
        </tr>
      </thead>
      <tbody>
        {[...Array(6)].map((_, i) => (
          <tr key={i}>
            <td className={tdClass}>
              <div className="h-3 w-32 rounded bg-surface animate-pulse" />
            </td>
            <td className={tdClass}>
              <div className="h-4 w-16 rounded bg-surface animate-pulse" />
            </td>
            <td className={tdClass}>
              <div className="h-3 w-24 rounded bg-surface animate-pulse" />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
 
export function RunsView({
  runs,
  loading,
  error,
  selectedRun,
  stages,
  onSelectRun,
  onRefreshStages,
  onRefreshRun,
}: RunsViewProps) {

  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [retryLog, setRetryLog] = useState<MvtLogEntry[]>([]);

  useEffect(() => {
    const unsubLog = pipelineApi.onOrchestratorLog((entry) => {
      setRetryLog((prev) => [...prev, entry]);
    });
    const unsubFinished = pipelineApi.onOrchestratorFinished((result: MvtFinishedResult) => {
      setRetrying(false);
      setRetryError(result.success ? null : result.error ?? 'Retry failed.');
      if (selectedRun) {
        onRefreshRun?.(selectedRun.run_id);
        onRefreshStages?.(selectedRun.run_id);
      }
    });
    return () => {
      unsubLog();
      unsubFinished();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRun?.run_id]);

  const handleRetry = async () => {
    if (!selectedRun || retrying) return;
    setRetrying(true);
    setRetryError(null);
    setRetryLog([]);
    try {
      await pipelineApi.retryRun(selectedRun.backup_source);
    } catch (err) {
      setRetrying(false);
      setRetryError(err instanceof Error ? err.message : 'Failed to start retry.');
    }
  };

  const canRetry = !!selectedRun && runPhase(selectedRun) === 'finished' && stages.some((s) => s.status === 'failed');
  useEffect(() => {
    const hasInProgressRun = runs.some(run => runPhase(run) === 'in_progress');
    if (!hasInProgressRun || !selectedRun) return;

    const interval = setInterval(async () => {
      try {
        await onRefreshRun?.(selectedRun.run_id);
        onRefreshStages?.(selectedRun.run_id);
      } catch (err) {
        console.error('Failed to poll run status:', err);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [runs, selectedRun, onRefreshRun, onRefreshStages]);

  return (
    <div className="flex flex-1 min-h-0 divide-x divide-border h-full overflow-hidden">
      <div className="flex-1 overflow-auto p-8 relative">
        {/* DESIGN_2.md: text-display is strictly one per view. This is the page title. */}
        <h1 className="font-display text-display text-accent mb-6 flex items-baseline gap-2">
          Investigations
          {!loading && !error && runs.length > 0 && (
            <span className="font-mono text-label text-muted-foreground">{runs.length}</span>
          )}
        </h1>
        {error ? (
          <div className="text-flag bg-flag/10 border border-flag/30 rounded-md px-4 py-3 text-data">{error}</div>
        ) : loading ? (
          <RunsTableSkeleton />
        ) : runs.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="No investigations yet"
            detail="Import an iPhone backup or connect a device from New Run to begin."
          />
        ) : (
          <table className="w-full border-collapse relative">
            <thead>
              <tr>
                <th className={thClass}>Evidence source</th>
                <th className={thClass}>Status</th>
                <th className={thClass}>Started</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => {
                const phase = runPhase(run);
                const selected = selectedRun?.run_id === run.run_id;
                const backupName = run.backup_source.split('/').pop() ?? run.backup_source;
                return (
                  <tr
                    key={run.run_id}
                    onClick={() => onSelectRun(run)}
                    className={`cursor-pointer transition-colors hover:bg-surface hover:shadow-[inset_0.15rem_0_0_hsl(var(--accent))] ${
                      selected ? 'bg-surface shadow-[inset_0.125rem_0_0_hsl(var(--accent))]' : ''
                    }`}
                  >
                    <td className={`${tdClass} font-mono`}>
                      <span className="block max-w-[55] truncate" title={run.backup_source}>
                        {backupName}
                      </span>
                    </td>
                    <td className={tdClass}>
                      {/* DESIGN_2.md: gap-1.5 exception applied for inline icon/indicator + text label */}
                      <div className="flex items-center gap-1.5">
                        {phase === 'in_progress' && (
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-accent"></span>
                          </span>
                        )}
                        <Badge variant={phase}>{phase === 'finished' ? 'finished' : 'in progress'}</Badge>
                      </div>
                    </td>
                    <td className={`${tdClass} font-mono tabular-nums tracking-tight`} title={new Date(run.started_at).toISOString()}>
                      {new Date(run.started_at).toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
 
      <div className="flex-1 overflow-auto p-8">
        {/* DESIGN_2.md: Demoted from text-display to text-label to preserve structural UI chrome hierarchy */}
        <h2 className="text-label uppercase tracking-wider text-muted-foreground mb-6">Analysis progress</h2>
                <div className="flex items-center justify-between mb-6">
          <h2 className="text-label uppercase tracking-wider text-muted-foreground">Analysis progress</h2>
          {canRetry && (
            <Button variant="outline" size="sm" onClick={handleRetry} loading={retrying} loadingText="Retrying...">
              <RefreshCw size="0.875rem" />
              Retry failed stages
            </Button>
          )}
        </div>
        {retryError && (
          <div className="text-flag bg-flag/10 border border-flag/30 shadow-elevation-1 rounded-md px-4 py-3 text-data mb-4">
            {retryError}
          </div>
        )}
        {(retrying || retryLog.length > 0) && (
          <div className="mb-4">
            <TerminalLog lines={retryLog} live={retrying} label="Retry log" />
          </div>
        )}
          stages.length === 0 ? (
            <EmptyState icon={Layers} title="No stages found for this run" />
          ) : (
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(16.25rem, 1fr))' }}>
              {stages.map((stage) => {
                const durationMs = stageDurationMs(stage);
                const statusColor = 
                  stage.status === 'succeeded'
                    ? 'var(--accent)'
                    : stage.status === 'failed' || stage.status === 'running'
                      ? 'var(--flag)'
                      : 'var(--muted-foreground)';

                return (
                  <div
                    key={`${stage.run_id}-${stage.stage_name}`}
                    className="group relative overflow-hidden bg-surface/50 backdrop-blur-sm rounded-lg p-5 border-l-2 shadow-elevation-1 transition-all hover:shadow-elevation-2 hover:bg-surface/80"
                    style={{
                      borderLeftColor: `hsl(${statusColor} / ${stage.status === 'pending' || stage.status === 'skipped' ? '0.5' : '1'})`,
                    }}
                  >
                    <div 
                      className="absolute -inset-1 opacity-0 group-hover:opacity-10 blur-xl transition-opacity pointer-events-none"
                      style={{ backgroundColor: `hsl(${statusColor})` }}
                    />
                    
                    <div className="relative z-10">
                      {/* DESIGN_2.md: Internal card sub-headings must use composite text-label token */}
                      <h3 className="font-display text-label mb-3">{stage.stage_name}</h3>
                      
                      {/* DESIGN_2.md: Badge-adjacent text labels use text-data instead of text-xs */}
                      <div className="text-data text-muted-foreground font-mono mb-2 flex items-center gap-1.5">
                        Status: <Badge variant={stage.status}>{stage.status}</Badge>
                      </div>
                      
                      {stage.error_message && (
                        <p className="text-data text-flag font-mono mb-2 wrap-break-words">Error: {stage.error_message}</p>
                      )}
                      
                      <p className="text-data text-muted-foreground font-mono">
                        Duration: <strong className="text-foreground">{durationMs !== null ? formatDuration(durationMs) : '—'}</strong>
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          <EmptyState icon={MousePointerClick} title="Select an investigation to view analysis progress" />
        )}
      </div>
    </div>
  );
}