import React, { useState, useEffect } from 'react';

interface PipelineRun {
  id: string;
  backup_path: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface StageStatus {
  id: string;
  stage_name: string;
  status: string;
  record_count: number;
  duration_ms: number;
}

export const App: React.FC = () => {
  const [runs, setRuns] = useState<PipelineRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<PipelineRun | null>(null);
  const [stages, setStages] = useState<StageStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadRuns();
  }, []);

  const loadRuns = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await (window as any).epoch?.getPipelineRuns?.();
      if (!data) {
        setError('Database connection failed');
        return;
      }
      setRuns(data);
    } catch (err) {
      console.error('Failed to load runs:', err);
      setError(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
    setLoading(false);
  };

  const selectRun = async (run: PipelineRun) => {
    setSelectedRun(run);
    try {
      const data = await (window as any).epoch?.getStageStatus?.(run.id);
      setStages(data || []);
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
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr
                    key={run.id}
                    className={selectedRun?.id === run.id ? 'selected' : ''}
                    onClick={() => selectRun(run)}
                  >
                    <td>{run.backup_path.split('/').pop()}</td>
                    <td>
                      <span className={`status ${run.status}`}>{run.status}</span>
                    </td>
                    <td>{new Date(run.created_at).toLocaleString()}</td>
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
                stages.map((stage) => (
                  <div key={stage.id} className={`stage-card ${stage.status}`}>
                    <h3>{stage.stage_name}</h3>
                    <p>Status: <strong>{stage.status}</strong></p>
                    <p>Records: <strong>{stage.record_count}</strong></p>
                    <p>Duration: <strong>{stage.duration_ms}ms</strong></p>
                  </div>
                ))
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
