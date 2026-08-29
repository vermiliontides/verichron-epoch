import React, { useState, useEffect } from 'react';
import type { PipelineRunRow, StageStatusRow } from '@verichron/db-reader';

/**
 * Field names here are pulled directly from PipelineRunRow/StageStatusRow
 * (packages/db-reader), which are themselves checked against
 * packages/db/migrations/0001_init.sql -- not re-declared locally. The
 * previous version of this file had its own PipelineRun/StageStatus
 * interfaces with fields that don't exist on either table
 * (backup_path/status/created_at/updated_at on runs; id/record_count/
 * duration_ms on stages) and would have thrown or rendered `undefined`
 * for every field the moment real data loaded.
 *
 * pipeline_runs has no `status` column at all -- run-level "did it happen"
 * and stage-level "what succeeded" are deliberately separate per the
 * schema's own header comment. There is no single source of truth for
 * "is this run overall a success" without rolling up its stages, and this
 * component doesn't fetch every run's stages just to render the table (that
 * would be a query per row). What's shown instead is what pipeline_runs
 * actually has: whether it's finished, and when. A real success/failure
 * rollup at the runs-list level needs either a Postgres view aggregating
 * worst-stage-status per run, or a second query -- worth doing, but that's
 * a feature to design, not a naming fix.
 */

function runPhase(run: PipelineRunRow): 'in_progress' | 'finished' {
  return run.finished_at ? 'finished' : 'in_progress';
}

function stageDurationMs(stage: StageStatusRow): number | null {
  if (!stage.started_at || !stage.finished_at) return null;
  return new Date(stage.finished_at).getTime() - new Date(stage.started_at).getTime();
}

export const App: React.FC = () => {
  const [runs, setRuns] = useState<PipelineRunRow[]>([]);
  const [selectedRun, setSelectedRun] = useState<PipelineRunRow | null>(null);
  const [stages, setStages] = useState<StageStatusRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadRuns();
  }, []);

  const loadRuns = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await window.epoch.getPipelineRuns();
      setRuns(data);
    } catch (err) {
      console.error('Failed to load runs:', err);
      setError(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
    setLoading(false);
  };

  const selectRun = async (run: PipelineRunRow) => {
    setSelectedRun(run);
    try {
      const data = await window.epoch.getStageStatus(run.run_id);
      setStages(data);
    } catch (err) {
      console.error('Failed to load stages:', err);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Epoch — Forensic Pipeline Visualizer</h1>
      </header>

      <div className="app-content">
        <div className="runs-panel">
          <h2>Pipeline Runs</h2>
          {error ? (
            <div style={{ color: 'red', padding: '10px', background: '#ffe6e6', borderRadius: '4px' }}>
              {error}
            </div>
          ) : loading ? (
            <p>Loading...</p>
          ) : runs.length === 0 ? (
            <p>No pipeline runs found. Run full_pipeline.py to create one.</p>
          ) : (
            <table className="runs-table">
              <thead>
                <tr>
                  <th>Backup</th>
                  <th>Status</th>
                  <th>Started</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr
                    key={run.run_id}
                    className={selectedRun?.run_id === run.run_id ? 'selected' : ''}
                    onClick={() => selectRun(run)}
                  >
                    <td>{run.backup_source.split('/').pop()}</td>
                    <td>
                      <span className={`status ${runPhase(run)}`}>
                        {runPhase(run) === 'finished' ? 'finished' : 'in progress'}
                      </span>
                    </td>
                    <td>{new Date(run.started_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="stages-panel">
          <h2>Stage Breakdown</h2>
          {selectedRun ? (
            <div className="stages-list">
              {stages.length === 0 ? (
                <p>No stages found for this run.</p>
              ) : (
                stages.map((stage) => {
                  const durationMs = stageDurationMs(stage);
                  return (
                    <div key={`${stage.run_id}-${stage.stage_name}`} className={`stage-card ${stage.status}`}>
                      <h3>{stage.stage_name}</h3>
                      <p>Status: <strong>{stage.status}</strong></p>
                      {stage.error_message && <p>Error: <strong>{stage.error_message}</strong></p>}
                      <p>
                        Duration: <strong>{durationMs !== null ? `${durationMs}ms` : '—'}</strong>
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            <p>Select a pipeline run to view stages</p>
          )}
        </div>
      </div>
    </div>
  );
};
