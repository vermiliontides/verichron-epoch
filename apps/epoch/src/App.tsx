import React, { useState, useEffect, useCallback } from 'react';
import { ChevronRight, ChevronDown, ShieldAlert, Inbox } from 'lucide-react';
import type { PipelineRunRow, StageStatusRow, ForensicRecordRow, CorrelatedContextRow } from '@verichron/db-reader';
import { CORRELATION_WINDOW_MINUTES } from '@verichron/db-reader';
import type { ReportResult } from './types/window';
import { Sidebar, type Section } from './components/Sidebar';
import { Header } from './components/Header';
import { StatusBar } from './components/StatusBar';
import { WorkspaceView } from './views/WorkspaceView';
import { RunsView } from './views/RunsView';
import { RecordsView } from './views/RecordsView';
import { EvidenceTag } from './components/ui/EvidenceTag';
import { Badge } from './components/ui/Badge';
import { TooltipProvider } from './components/ui/Tooltip';
import { ToastProvider, useToast } from './components/ui/Toast';
import { CorrelationTimeline } from './components/CorrelationTimeline';
import { ReportViewer } from './components/ReportViewer';

function runPhase(run: PipelineRunRow): 'in_progress' | 'finished' {
  return run.finished_at ? 'finished' : 'in_progress';
}

const IOC_SOURCE_TYPES = ['mvt_ioc_detection', 'timestamp_anomaly'] as const;
type IocSourceType = (typeof IOC_SOURCE_TYPES)[number];

function isIocSourceType(sourceType: string): sourceType is IocSourceType {
  return (IOC_SOURCE_TYPES as readonly string[]).includes(sourceType);
}

function formatDelta(seconds: unknown): string {
  if (typeof seconds !== 'number') return '—';
  const days = Math.floor(Math.abs(seconds) / 86400);
  const hours = Math.floor((Math.abs(seconds) % 86400) / 3600);
  return `${seconds < 0 ? '-' : '+'}${days}d ${hours}h`;
}

export const AppContent: React.FC = () => {
  const [section, setSection] = useState<Section>('workspace');
  const [runs, setRuns] = useState<PipelineRunRow[]>([]);
  const [selectedRun, setSelectedRun] = useState<PipelineRunRow | null>(null);
  const [stages, setStages] = useState<StageStatusRow[]>([]);
  const [records, setRecords] = useState<ForensicRecordRow[]>([]);
  const [recordsLoaded, setRecordsLoaded] = useState(false);
  const [sourceTypeFilter, setSourceTypeFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dbStatus, setDbStatus] = useState<'connected' | 'error' | 'unknown'>('unknown');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [expandedPivotId, setExpandedPivotId] = useState<number | null>(null);
  const [correlatedContext, setCorrelatedContext] = useState<Record<number, CorrelatedContextRow[]>>({});
  const [correlatedLoading, setCorrelatedLoading] = useState<number | null>(null);
  const [correlatedError, setCorrelatedError] = useState<Record<number, string>>({});

  const [report, setReport] = useState<ReportResult | null>(null);
  const [reportLoaded, setReportLoaded] = useState(false);
  const [reportLoadError, setReportLoadError] = useState<string | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  const { success, error: toastError } = useToast();

  const loadRuns = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setIsRefreshing(true);
    setError(null);
    try {
      const data = await window.epoch.getPipelineRuns();
      setRuns(data);
      setDbStatus('connected');
      // Auto-select latest run if none selected
      if (data.length > 0 && !selectedRun) {
        selectRun(data[0]);
      }
    } catch (err) {
      console.error('Failed to load runs:', err);
      const msg = err instanceof Error ? err.message : 'Unknown database error';
      setError(`Database error: ${msg}`);
      setDbStatus('error');
      toastError('Database Error', msg);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [selectedRun, toastError]);

  useEffect(() => {
    loadRuns();
  }, []);

  // Global Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey;
      if (!isMeta) return;

      if (e.key === '1') {
        e.preventDefault();
        handleSectionSelect('workspace');
      } else if (e.key === '2') {
        e.preventDefault();
        handleSectionSelect('runs');
      } else if (e.key === '3') {
        e.preventDefault();
        handleSectionSelect('records');
      } else if (e.key === '4') {
        e.preventDefault();
        handleSectionSelect('iocs');
      } else if (e.key === '5') {
        e.preventDefault();
        handleSectionSelect('reports');
      } else if (e.key === 'r') {
        e.preventDefault();
        loadRuns(true);
        success('Data Refreshed', 'Pipeline runs updated');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [loadRuns, success]);

  const selectRun = async (run: PipelineRunRow) => {
    setSelectedRun(run);
    setRecords([]);
    setRecordsLoaded(false);
    setSourceTypeFilter(null);
    setReport(null);
    setReportLoaded(false);
    setReportLoadError(null);
    try {
      const data = await window.epoch.getStageStatus(run.run_id);
      setStages(data);
      setDbStatus('connected');
    } catch (err) {
      console.error('Failed to load stages:', err);
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

  const loadReport = async (run: PipelineRunRow) => {
    setReportLoading(true);
    setReportLoadError(null);
    try {
      const result = await window.epoch.getReport(run.backup_source);
      setReport(result);
      setReportLoaded(true);
      setDbStatus('connected');
    } catch (err) {
      console.error('Failed to load report:', err);
      setReportLoadError(err instanceof Error ? err.message : 'Unknown error');
    }
    setReportLoading(false);
  };

  const openReportFile = async () => {
    if (!selectedRun) return;
    const opened = await window.epoch.openReport(selectedRun.backup_source);
    if (!opened) {
      toastError('Failed to Open Report', 'Could not launch default markdown viewer');
    } else {
      success('Opening Report', 'Launched in system viewer');
    }
  };

  const handleSectionSelect = (next: Section) => {
    setSection(next);
    if ((next === 'records' || next === 'iocs') && selectedRun && !recordsLoaded) {
      loadRecords(selectedRun);
    }
    if (next === 'reports' && selectedRun && !reportLoaded) {
      loadReport(selectedRun);
    }
  };

  const handleNavigateToRecords = (sourceType?: string) => {
    setSection('records');
    if (sourceType) {
      setSourceTypeFilter(sourceType);
    }
    if (selectedRun && !recordsLoaded) {
      loadRecords(selectedRun);
    }
  };

  const toggleCorrelatedContext = async (pivot: ForensicRecordRow) => {
    if (expandedPivotId === pivot.id) {
      setExpandedPivotId(null);
      return;
    }
    setExpandedPivotId(pivot.id);
    if (correlatedContext[pivot.id] || !selectedRun || !pivot.event_time) return;
    setCorrelatedLoading(pivot.id);
    try {
      const data = await window.epoch.getCorrelatedContext(selectedRun.run_id, pivot.event_time, pivot.id);
      setCorrelatedContext((prev) => ({ ...prev, [pivot.id]: data }));
    } catch (err) {
      console.error('Failed to load correlated context:', err);
      setCorrelatedError((prev) => ({
        ...prev,
        [pivot.id]: err instanceof Error ? err.message : 'Unknown error',
      }));
    } finally {
      setCorrelatedLoading(null);
    }
  };

  const iocRecords = records.filter((r) => isIocSourceType(r.source_type));
  const nonIocRecords = records.filter((r) => !isIocSourceType(r.source_type));

  const availableSourceTypes = Array.from(new Set(nonIocRecords.map((r) => r.source_type))).sort();
  const visibleRecords = sourceTypeFilter
    ? nonIocRecords.filter((r) => r.source_type === sourceTypeFilter)
    : nonIocRecords;

  const matchedIocCount = iocRecords.filter(
    (r) => r.source_type === 'mvt_ioc_detection' && r.fields.matched_indicator != null
  ).length;

  return (
    <div className="flex flex-col h-screen w-screen bg-background text-foreground overflow-hidden">
      {/* Top Global Command Bar */}
      <Header
        dbStatus={dbStatus}
        selectedRun={selectedRun}
        onRefresh={() => loadRuns(true)}
        isRefreshing={isRefreshing}
      />

      {/* Main Workspace Area: Sidebar + Content */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <Sidebar
          active={section}
          onSelect={handleSectionSelect}
          dbStatus={dbStatus}
          runsCount={runs.length}
          recordsCount={records.length}
          iocCount={iocRecords.length}
        />

        <main className="flex-1 flex flex-col min-w-0 bg-background overflow-hidden relative">
          {selectedRun && (
            <EvidenceTag
              run={selectedRun}
              phase={runPhase(selectedRun)}
              onClearRun={() => setSelectedRun(null)}
            />
          )}

          <div className="flex-1 overflow-hidden relative flex flex-col">
            {section === 'workspace' && <WorkspaceView />}

            {section === 'runs' && (
              <RunsView
                runs={runs}
                loading={loading}
                error={error}
                selectedRun={selectedRun}
                stages={stages}
                onSelectRun={selectRun}
                onRefreshStages={(runId) => {
                  window.epoch.getStageStatus(runId).then(setStages);
                }}
                onNavigateToRecords={handleNavigateToRecords}
              />
            )}

            {section === 'records' && (
              <RecordsView
                selectedRun={!!selectedRun}
                records={visibleRecords}
                availableSourceTypes={availableSourceTypes}
                sourceTypeFilter={sourceTypeFilter}
                onFilterChange={setSourceTypeFilter}
                onPivotCorrelated={(pivot) => {
                  setSection('iocs');
                  toggleCorrelatedContext(pivot);
                }}
              />
            )}

            {section === 'iocs' && (
              <div className="flex-1 overflow-auto p-6 space-y-6 max-w-5xl mx-auto w-full">
                {/* Header */}
                <div className="flex items-center justify-between pb-4 border-b border-border">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-display text-base font-bold text-foreground tracking-tight">
                        Indicator Matches & Threat Intel
                      </h2>
                      {matchedIocCount > 0 ? (
                        <Badge variant="threat" pulse dot>
                          {matchedIocCount} CRITICAL THREAT(S)
                        </Badge>
                      ) : (
                        <Badge variant="neutral">0 Active Threats</Badge>
                      )}
                    </div>
                    <p className="text-3xs text-muted-foreground mt-0.5">
                      Detection matches against known Pegasus, Predator, and mercenary spyware indicators
                    </p>
                  </div>
                </div>

                {!selectedRun ? (
                  <div className="flex flex-col items-center justify-center py-20 text-muted-foreground text-center">
                    <Inbox size="2.5rem" strokeWidth={1.5} className="mb-2 opacity-50" />
                    <p className="text-sm font-semibold text-foreground">Select a Pipeline Run</p>
                    <p className="text-3xs font-mono mt-1">
                      Indicator matches require an active pipeline run from the Pipeline Runs module.
                    </p>
                  </div>
                ) : iocRecords.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 rounded-2xl bg-surface/40 border border-border text-center space-y-2">
                    <ShieldAlert size="2.5rem" className="text-success/80 mx-auto" />
                    <h3 className="font-display text-sm font-bold text-foreground">Clean Indicator Scan</h3>
                    <p className="text-xs text-muted-foreground max-w-md font-mono">
                      No mvt_ioc_detection or timestamp_anomaly records triggered for this backup run.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Top Threat Metric Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="p-3.5 rounded-xl bg-surface border border-border">
                        <span className="text-3xs font-mono uppercase text-muted-foreground">Total Detections</span>
                        <p className="text-xl font-bold font-mono text-foreground mt-1 tabular-nums">
                          {iocRecords.length}
                        </p>
                      </div>
                      <div className="p-3.5 rounded-xl bg-surface border border-danger/30">
                        <span className="text-3xs font-mono uppercase text-danger font-semibold">
                          Spyware Indicator Matches
                        </span>
                        <p className="text-xl font-bold font-mono text-danger mt-1 tabular-nums">
                          {matchedIocCount}
                        </p>
                      </div>
                      <div className="p-3.5 rounded-xl bg-surface border border-border">
                        <span className="text-3xs font-mono uppercase text-muted-foreground">
                          Timestamp Drift Anomalies
                        </span>
                        <p className="text-xl font-bold font-mono text-flag mt-1 tabular-nums">
                          {iocRecords.filter((r) => r.source_type === 'timestamp_anomaly').length}
                        </p>
                      </div>
                    </div>

                    {/* Indicator Cards List */}
                    <div className="space-y-3">
                      {iocRecords.map((rec) => {
                        const isDetection = rec.source_type === 'mvt_ioc_detection';
                        const matched = isDetection && rec.fields.matched_indicator != null;
                        const expandable = rec.event_time != null;
                        const expanded = expandedPivotId === rec.id;
                        const contextRows = correlatedContext[rec.id];
                        const contextError = correlatedError[rec.id];

                        return (
                          <div
                            key={rec.id}
                            className={`rounded-xl border transition-all ${
                              matched
                                ? 'bg-danger/10 border-danger/40 shadow-sm forensic-glow-threat'
                                : 'bg-surface border-border hover:border-border/80'
                            }`}
                          >
                            <div
                              className={`p-4 ${expandable ? 'cursor-pointer' : ''}`}
                              onClick={() => expandable && toggleCorrelatedContext(rec)}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  {expandable &&
                                    (expanded ? (
                                      <ChevronDown size="0.9rem" className="text-muted-foreground shrink-0" />
                                    ) : (
                                      <ChevronRight size="0.9rem" className="text-muted-foreground shrink-0" />
                                    ))}
                                  <Badge variant={matched ? 'threat' : 'flag'}>
                                    {matched ? 'CRITICAL SPYWARE IOC' : rec.source_type}
                                  </Badge>

                                  {rec.event_time && (
                                    <span className="font-mono text-2xs text-muted-foreground">
                                      {new Date(rec.event_time).toLocaleString()}
                                    </span>
                                  )}
                                </div>

                                {expandable && (
                                  <span className="text-3xs font-mono text-accent hover:underline">
                                    {expanded ? 'Hide Surrounding Activity' : `Inspect Surrounding ±${CORRELATION_WINDOW_MINUTES}m`}
                                  </span>
                                )}
                              </div>

                              {isDetection ? (
                                <div className="space-y-1.5 pl-6">
                                  <p className="text-sm font-medium text-foreground">
                                    {String(rec.fields.message ?? '—')}
                                  </p>
                                  {matched && (
                                    <div className="p-2.5 rounded-lg bg-danger/15 border border-danger/30 text-danger text-xs font-mono">
                                      <span className="font-bold">Matched Indicator: </span>
                                      <span className="select-all">{String(rec.fields.matched_indicator)}</span>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="space-y-1.5 pl-6">
                                  <p className="text-sm font-medium text-foreground">
                                    {String(rec.fields.plugin ?? '—')} —{' '}
                                    {String(rec.fields.description ?? rec.fields.event ?? '—')}
                                  </p>
                                  <p className="text-xs font-mono text-muted-foreground">
                                    Drift: {formatDelta(rec.fields.delta_from_backup_seconds)} from backup date
                                  </p>
                                </div>
                              )}
                            </div>

                            {expanded && (
                              <div className="border-t border-border p-4 bg-surface-raised/30">
                                {contextError ? (
                                  <p className="text-xs text-danger font-mono bg-danger/10 border border-danger/30 p-2.5 rounded-md">
                                    Error loading context: {contextError}
                                  </p>
                                ) : correlatedLoading === rec.id ? (
                                  <p className="text-xs font-mono text-muted-foreground">
                                    Correlating nearby multi-domain events within ±{CORRELATION_WINDOW_MINUTES}m...
                                  </p>
                                ) : !contextRows || contextRows.length === 0 ? (
                                  <p className="text-xs font-mono text-muted-foreground italic">
                                    No other events detected within this ±{CORRELATION_WINDOW_MINUTES}m window.
                                  </p>
                                ) : (
                                  <CorrelationTimeline
                                    pivotEventTime={rec.event_time!}
                                    contextRows={contextRows}
                                    windowMinutes={CORRELATION_WINDOW_MINUTES}
                                  />
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {section === 'reports' && (
              <div className="flex-1 flex flex-col h-full overflow-hidden">
                {!selectedRun ? (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-6 text-center">
                    <Inbox size="2.5rem" strokeWidth={1.5} className="mb-2 opacity-50" />
                    <p className="text-sm font-semibold text-foreground">Select a Pipeline Run</p>
                    <p className="text-3xs font-mono mt-1">
                      Choose an execution from Pipeline Runs to generate and view its formal audit dossier.
                    </p>
                  </div>
                ) : reportLoadError ? (
                  <div className="p-6 m-6 text-xs font-mono text-danger bg-danger/10 border border-danger/30 rounded-xl">
                    Failed to load investigation report: {reportLoadError}
                  </div>
                ) : reportLoading || !report ? (
                  <div className="flex items-center justify-center h-full text-xs font-mono text-muted-foreground">
                    Compiling investigation report from forensic records...
                  </div>
                ) : (
                  <ReportViewer
                    report={report}
                    selectedRun={selectedRun}
                    onOpenReport={openReportFile}
                  />
                )}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Bottom Telemetry Status Bar */}
      <StatusBar
        selectedRun={selectedRun}
        totalRecordsCount={records.length}
        iocCount={iocRecords.length}
      />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <ToastProvider>
      <TooltipProvider>
        <AppContent />
      </TooltipProvider>
    </ToastProvider>
  );
};