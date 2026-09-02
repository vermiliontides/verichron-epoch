import React, { useState, useEffect } from 'react';
import type { PipelineRunRow, StageStatusRow, ForensicRecordRow } from '@verichron/db-reader';
import { Sidebar, type Section } from './components/layout/Sidebar';
import { WorkspaceView } from './views/WorkspaceView';
import { RunsView } from './views/RunsView';
import { RecordsView } from './views/RecordsView';
import { IocsView } from './features/forensics/IocsView';
import { ReportsView } from './features/reports/ReportsView';
import { EvidenceTag } from './components/ui/EvidenceTag';
import { TooltipProvider } from './components/ui/Tooltip';

function runPhase(run: PipelineRunRow): 'in_progress' | 'finished' {
  return run.finished_at ? 'finished' : 'in_progress';
}

const IOC_SOURCE_TYPES = ['mvt_ioc_detection', 'timestamp_anomaly'] as const;

export const App: React.FC = () => {
  const [section, setSection] = useState<Section>('runs');
  const [runs, setRuns] = useState<PipelineRunRow[]>([]);
  const [selectedRun, setSelectedRun] = useState<PipelineRunRow | null>(null);
  const [stages, setStages] = useState<StageStatusRow[]>([]);
  const [records, setRecords] = useState<ForensicRecordRow[]>([]);
  const [recordsLoaded, setRecordsLoaded] = useState(false);
  const [sourceTypeFilter, setSourceTypeFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dbStatus, setDbStatus] = useState<'connected' | 'error' | 'unknown'>('unknown');

  useEffect(() => {
    loadRuns();
  }, []);

  const loadRuns = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await window.epoch.getPipelineRuns();
      setRuns(data);
      setDbStatus('connected');
    } catch (err) {
      console.error('Failed to load runs:', err);
      setError(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setDbStatus('error');
    } finally {
      setLoading(false);
    }
  };

  const selectRun = async (run: PipelineRunRow) => {
    setSelectedRun(run);
    setRecords([]);
    setRecordsLoaded(false);
    setSourceTypeFilter(null);
    try {
      const data = await window.epoch.getStageStatus(run.run_id);
      setStages(data);
      setDbStatus('connected');
    } catch (err) {
      console.error('Failed to load stages:', err);
      setDbStatus('error');
    }
  };

  const refreshStages = async (runId: string) => {
    try {
      const data = await window.epoch.getStageStatus(runId);
      setStages(data);
      setDbStatus('connected');
    } catch (err) {
      console.error('Failed to refresh stages:', err);
      setDbStatus('error');
    }
  };

  const loadRecords = async (run: PipelineRunRow) => {
    try {
      const data = await window.epoch.getForensicRecords(run.run_id);
      setRecords(data);
      setRecordsLoaded(true);
      setDbStatus('connected');
    } catch (err) {
      console.error('Failed to load records:', err);
      setDbStatus('error');
    }
  };

  const handleSectionSelect = (next: Section) => {
    setSection(next);
    if ((next === 'records' || next === 'iocs') && selectedRun && !recordsLoaded) {
      loadRecords(selectedRun);
    }
  };

  const nonIocRecords = records.filter((r) => !IOC_SOURCE_TYPES.includes(r.source_type as any));
  const availableSourceTypes = Array.from(new Set(nonIocRecords.map((r) => r.source_type))).sort();
  const visibleRecords = sourceTypeFilter
    ? nonIocRecords.filter((r) => r.source_type === sourceTypeFilter)
    : nonIocRecords;

  return (
    <TooltipProvider>
      <div className="flex h-screen bg-background text-foreground">
        <Sidebar active={section} onSelect={handleSectionSelect} dbStatus={dbStatus} />

        <div className="flex-1 flex flex-col min-w-0">
          {selectedRun && <EvidenceTag run={selectedRun} phase={runPhase(selectedRun)} />}

          <div className="flex-1 overflow-auto p-8">
            {section === 'workspace' && (
              <WorkspaceView
                onAnalysisComplete={() => {
                  setSection('runs');
                  loadRuns();
                }}
              />
            )}

            {section === 'runs' && (
              <RunsView
                runs={runs}
                loading={loading}
                error={error}
                selectedRun={selectedRun}
                stages={stages}
                onSelectRun={selectRun}
                onRefreshStages={refreshStages}
              />
            )}

            {section === 'records' && (
              <RecordsView
                selectedRun={!!selectedRun}
                records={visibleRecords}
                availableSourceTypes={availableSourceTypes}
                sourceTypeFilter={sourceTypeFilter}
                onFilterChange={setSourceTypeFilter}
              />
            )}

            {section === 'iocs' && (
              <IocsView 
                selectedRun={selectedRun} 
                records={records} 
              />
            )}

            {section === 'reports' && (
              <ReportsView 
                selectedRun={selectedRun} 
              />
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
};