import React from 'react';
import type { PipelineRunRow, StageStatusRow } from '@verichron/db-reader';
import { Badge } from '../ui/badge';

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

interface RunsViewProps {
  runs: PipelineRunRow[];
  loading: boolean;
  error: string | null;
  selectedRun: PipelineRunRow | null;
  stages: StageStatusRow[];
  onSelectRun: (run: PipelineRunRow) => void;
}

export function RunsView({ runs, loading, error, selectedRun, stages, onSelectRun }: RunsViewProps) {
  return (
    <div className="flex flex-1 min-h-0 divide-x divide-border">
      <div className="flex-1 overflow-auto p-5">
        <h2 className="font-display text-[15px] font-medium text-accent mb-4">Pipeline Runs</h2>
        {error ? (
          <div className="text-flag bg-flag/10 border border-flag/30 rounded-md px-3 py-2 text-[13px]">
            {error}
          </div>
        ) : loading ? (
          <p className="text-muted-foreground text-[13px]">Loading...</p>
        ) : runs.length === 0 ? (
          <p className="text-muted-foreground text-[13px]">
            No pipeline runs found. Run full_pipeline.py to create one.
          </p>
        ) : (
          <table className="w-full text-[13px] border-collapse">
            <thead>
              <tr>
                <th className="text-left font-medium text-muted-foreground bg-surface px-3 py-2.5 border-b border-border">
                  Backup
                </th>
                <th className="text-left font-medium text-muted-foreground bg-surface px-3 py-2.5 border-b border-border">
                  Status
                </th>
                <th className="text-left font-medium text-muted-foreground bg-surface px-3 py-2.5 border-b border-border">
                  Started
                </th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => {
                const phase = runPhase(run);
                const selected = selectedRun?.run_id === run.run_id;
                return (
                  <tr
                    key={run.run_id}
                    onClick={() => onSelectRun(run)}
                    className={`cursor-pointer transition-colors hover:bg-surface ${
                      selected ? 'bg-surface shadow-[inset_2px_0_0_hsl(var(--accent))]' : ''
                    }`}
                  >
                    <td className="px-3 py-2.5 border-b border-border font-mono text-xs">
                      {run.backup_source.split('/').pop()}
                    </td>
                    <td className="px-3 py-2.5 border-b border-border">
                      <Badge variant={phase}>{phase === 'finished' ? 'finished' : 'in progress'}</Badge>
                    </td>
                    <td className="px-3 py-2.5 border-b border-border font-mono text-xs">
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
        <h2 className="font-display text-[15px] font-medium text-accent mb-4">Stage Breakdown</h2>
        {selectedRun ? (
          stages.length === 0 ? (
            <p className="text-muted-foreground text-[13px]">No stages found for this run.</p>
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
              {stages.map((stage) => {
                const durationMs = stageDurationMs(stage);
                return (
                  <div
                    key={`${stage.run_id}-${stage.stage_name}`}
                    className="bg-surface rounded-md px-4 py-3.5 border-l-2"
                    style={{
                      borderLeftColor:
                        stage.status === 'succeeded'
                          ? 'hsl(var(--accent))'
                          : stage.status === 'failed' || stage.status === 'running'
                            ? 'hsl(var(--flag))'
                            : 'hsl(var(--muted-foreground) / 0.5)',
                    }}
                  >
                    <h3 className="font-display text-sm font-medium mb-2.5">{stage.stage_name}</h3>
                    <p className="text-xs text-muted-foreground font-mono mb-1.5 flex items-center gap-2">
                      Status: <Badge variant={stage.status}>{stage.status}</Badge>
                    </p>
                    {stage.error_message && (
                      <p className="text-xs text-flag font-mono mb-1.5">Error: {stage.error_message}</p>
                    )}
                    <p className="text-xs text-muted-foreground font-mono">
                      Duration: <strong>{durationMs !== null ? `${durationMs}ms` : '—'}</strong>
                    </p>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          <p className="text-muted-foreground text-[13px]">Select a pipeline run to view stages</p>
        )}
      </div>
    </div>
  );
}
