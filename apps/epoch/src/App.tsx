import React, { useEffect, useState } from 'react';
import { Flag, FileText } from 'lucide-react';
import type { PipelineRunRow, StageStatusRow } from '@verichron/db-reader';
import { Sidebar, type Section } from './components/Sidebar';
import { RunsView } from './components/views/RunsView';
import { RecordsView } from './components/views/RecordsView';
import { PlaceholderView } from './components/views/PlaceholderView';

export const App: React.FC = () => {
  const [section, setSection] = useState<Section>('runs');

  const [runs, setRuns] = useState<PipelineRunRow[]>([]);
  const [runsLoading, setRunsLoading] = useState(true);
  const [runsError, setRunsError] = useState<string | null>(null);
  const [dbStatus, setDbStatus] = useState<'connected' | 'error' | 'unknown'>('unknown');

  const [selectedRun, setSelectedRun] = useState<PipelineRunRow | null>(null);
  const [stages, setStages] = useState<StageStatusRow[]>([]);

  useEffect(() => {
    loadRuns();
  }, []);

  const loadRuns = async () => {
    setRunsLoading(true);
    setRunsError(null);
    try {
      const data = await window.epoch.getPipelineRuns();
      setRuns(data);
      setDbStatus('connected');
    } catch (err) {
      console.error('Failed to load runs:', err);
      setRunsError(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setDbStatus('error');
    }
    setRunsLoading(false);
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
    <div className="flex h-screen bg-background text-foreground font-sans">
      <Sidebar active={section} onSelect={setSection} dbStatus={dbStatus} />

      <div className="flex flex-1 min-w-0 flex-col">
        <header className="bg-surface border-b border-border px-5 py-4">
          <h1 className="font-display text-[20px] font-medium">Epoch — Forensic Pipeline Visualizer</h1>
        </header>

        {section === 'runs' && (
          <RunsView
            runs={runs}
            loading={runsLoading}
            error={runsError}
            selectedRun={selectedRun}
            stages={stages}
            onSelectRun={selectRun}
          />
        )}
        {section === 'records' && <RecordsView runs={runs} />}
        {section === 'iocs' && <PlaceholderView title="Indicators of Compromise" icon={Flag} />}
        {section === 'reports' && <PlaceholderView title="Reports" icon={FileText} />}
      </div>
    </div>
  );
};
