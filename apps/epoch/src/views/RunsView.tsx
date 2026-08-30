import React from 'react';
import { Inbox, MousePointerClick, Layers } from 'lucide-react';
import type { PipelineRunRow, StageStatusRow } from '@verichron/db-reader';
import { Badge } from '../components/ui/badge';
 
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
}
 
const thClass =
  'text-left font-medium text-muted-foreground bg-surface px-3 py-2 border-b border-border text-2xs uppercase tracking-wide';
const tdClass = 'px-3 py-2 border-b border-border';
 
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
    <table className="w-full text-sm border-collapse">
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
 
export function RunsView({ runs, loading, error, selectedRun, stages, onSelectRun }: RunsViewProps) {
  return (
    <div className="flex flex-1 min-h-0 divide-x divide-border">
      <div className="flex-1 overflow-auto p-5">
        <h2 className="font-display text-base font-medium text-accent mb-4 flex items-baseline gap-2">
          Pipeline Runs
          {!loading && !error && runs.length > 0 && (
            <span className="font-mono text-2xs text-muted-foreground">{runs.length}</span>
          )}
        </h2>
        {error ? (
          <div className="text-flag bg-flag/10 border border-flag/30 rounded-md px-3 py-2 text-sm">{error}</div>
        ) : loading ? (
          <RunsTableSkeleton />
        ) : runs.length === 0 ? (
          <EmptyState icon={Inbox} title="No pipeline runs found" detail="Run full_pipeline.py to create one" />
        ) : (
          <table className="w-full text-sm border-collapse">
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
                    className={`cursor-pointer transition-colors hover:bg-surface ${
                      selected ? 'bg-surface shadow-[inset_0.125rem_0_0_hsl(var(--accent))]' : ''
                    }`}
                  >
                    <td className={`${tdClass} font-mono text-xs`}>
                      <span className="block max-w-[13.75rem] truncate" title={run.backup_source}>
                        {backupName}
                      </span>
                    </td>
                    <td className={tdClass}>
                      <Badge variant={phase}>{phase === 'finished' ? 'finished' : 'in progress'}</Badge>
                    </td>
                    <td className={`${tdClass} font-mono text-xs`} title={new Date(run.started_at).toISOString()}>
                      {new Date(run.started_at).toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
 
      <div className="flex-1 overflow-auto p-5">
        <h2 className="font-display text-base font-medium text-accent mb-4">Stage Breakdown</h2>
        {selectedRun ? (
          stages.length === 0 ? (
            <EmptyState icon={Layers} title="No stages found for this run" />
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(16.25rem, 1fr))' }}>
              {stages.map((stage) => {
                const durationMs = stageDurationMs(stage);
                return (
                  <div
                    key={`${stage.run_id}-${stage.stage_name}`}
                    className="bg-surface rounded-md p-4 border-l-2"
                    style={{
                      borderLeftColor:
                        stage.status === 'succeeded'
                          ? 'hsl(var(--accent))'
                          : stage.status === 'failed' || stage.status === 'running'
                            ? 'hsl(var(--flag))'
                            : 'hsl(var(--muted-foreground) / 0.5)',
                    }}
                  >
                    <h3 className="font-display text-sm font-medium mb-2">{stage.stage_name}</h3>
                    <p className="text-xs text-muted-foreground font-mono mb-1 flex items-center gap-2">
                      Status: <Badge variant={stage.status}>{stage.status}</Badge>
                    </p>
                    {stage.error_message && (
                      <p className="text-xs text-flag font-mono mb-1 break-words">Error: {stage.error_message}</p>
                    )}
                    <p className="text-xs text-muted-foreground font-mono">
                      Duration: <strong className="text-foreground">{durationMs !== null ? formatDuration(durationMs) : '—'}</strong>
                    </p>
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
 