import React, { useEffect } from 'react';
import { Inbox, MousePointerClick, Layers } from 'lucide-react';
import type { PipelineRunRow, StageStatusRow } from '@verichron/db-reader';
import { Badge } from '../components/ui/Badge';
 
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
  'sticky top-0 bg-surface/90 backdrop-blur-md z-10 text-left font-medium text-muted-foreground px-4 py-3 border-b border-border text-2xs uppercase tracking-wide';
const tdClass = 'px-4 py-3 border-b border-border';
 
function EmptyState({ icon: Icon, title, detail }: { icon: typeof Inbox; title: string; detail?: string }) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-2 text-muted-foreground py-16">
      <Icon size="1.5rem" strokeWidth={1.5} />
      <p className="text-sm">{title}</p>
      {detail && <p className="text-xs font-mono">{detail}</p>}
    </div>
  );
}
 
function RunsTableSkeleton() {
  return (
    <table className="w-full text-sm border-collapse relative">
      <thead>
        <tr>
          <th className={thClass}>Backup</th>
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
        <h2 className="font-display text-base font-medium text-accent mb-6 flex items-baseline gap-2">
          Pipeline Runs
          {!loading && !error && runs.length > 0 && (
            <span className="font-mono text-2xs text-muted-foreground">{runs.length}</span>
          )}
        </h2>
        {error ? (
          <div className="text-flag bg-flag/10 border border-flag/30 rounded-md px-4 py-3 text-sm">{error}</div>
        ) : loading ? (
          <RunsTableSkeleton />
        ) : runs.length === 0 ? (
          <EmptyState icon={Inbox} title="No pipeline runs found" detail="Run full_pipeline.py to create one" />
        ) : (
          <table className="w-full text-sm border-collapse relative">
            <thead>
              <tr>
                <th className={thClass}>Backup</th>
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
                    <td className={`${tdClass} font-mono text-xs`}>
                      <span className="block max-w-[55] truncate" title={run.backup_source}>
                        {backupName}
                      </span>
                    </td>
                    <td className={tdClass}>
                      <div className="flex items-center gap-2">
                        {phase === 'in_progress' && (
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-accent"></span>
                          </span>
                        )}
                        <Badge variant={phase}>{phase === 'finished' ? 'finished' : 'in progress'}</Badge>
                      </div>
                    </td>
                    <td className={`${tdClass} font-mono text-xs tabular-nums tracking-tight`} title={new Date(run.started_at).toISOString()}>
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
        <h2 className="font-display text-base font-medium text-accent mb-6">Stage Breakdown</h2>
        {selectedRun ? (
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
                    className="group relative overflow-hidden bg-surface/50 backdrop-blur-sm rounded-lg p-5 border border-border border-l-2 shadow-md transition-all hover:shadow-lg hover:bg-surface/80"
                    style={{
                      borderLeftColor: `hsl(${statusColor} / ${stage.status === 'pending' || stage.status === 'skipped' ? '0.5' : '1'})`,
                    }}
                  >
                    {/* Hover Glow Effect based on status */}
                    <div 
                      className="absolute -inset-1 opacity-0 group-hover:opacity-10 blur-xl transition-opacity pointer-events-none"
                      style={{ backgroundColor: `hsl(${statusColor})` }}
                    />
                    
                    <div className="relative z-10">
                      <h3 className="font-display text-sm font-medium mb-3">{stage.stage_name}</h3>
                      <div className="text-xs text-muted-foreground font-mono mb-2 flex items-center gap-2">
                        Status: <Badge variant={stage.status}>{stage.status}</Badge>
                      </div>
                      {stage.error_message && (
                        <p className="text-xs text-flag font-mono mb-2 wrap-break-words">Error: {stage.error_message}</p>
                      )}
                      <p className="text-xs text-muted-foreground font-mono">
                        Duration: <strong className="text-foreground">{durationMs !== null ? formatDuration(durationMs) : '—'}</strong>
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          <EmptyState icon={MousePointerClick} title="Select a pipeline run to view stages" />
        )}
      </div>
    </div>
  );
}