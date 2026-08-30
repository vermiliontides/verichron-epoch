import React, { useState, useEffect } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import type { PipelineRunRow, StageStatusRow, ForensicRecordRow, CorrelatedContextRow } from '@verichron/db-reader';
import { CORRELATION_WINDOW_MINUTES } from '@verichron/db-reader';
import type { ReportResult } from './types/window';
import { Sidebar, type Section } from './components/Sidebar';
import { RunsView } from './views/RunsView';
import { RecordsView } from './views/RecordsView';
import { EvidenceTag } from './components/ui/EvidenceTag';
import { Badge } from './components/ui/Badge';
import { TooltipProvider } from './components/ui/Tooltip';

/**
 * Field names here are pulled directly from PipelineRunRow/StageStatusRow/
 * ForensicRecordRow (packages/db-reader), checked against
 * packages/db/migrations/0001_init.sql -- not re-declared locally.
 *
 * pipeline_runs has no `status` column at all -- run-level "did it happen"
 * and stage-level "what succeeded" are deliberately separate per the
 * schema's own header comment. runPhase() below is the only run-level
 * signal this file fabricates, and it's derived (finished_at set or not),
 * never invented.
 */

function runPhase(run: PipelineRunRow): 'in_progress' | 'finished' {
  return run.finished_at ? 'finished' : 'in_progress';
}

/**
 * Matches apps/extractors/mvt_iocs's SourceType enum (normalized_record.py)
 * exactly -- these are ordinary forensic_records rows, not a separate
 * table or IPC channel. IOCs panel below reuses the same `records` fetch
 * the Records panel already makes, just filtered to these two source_types.
 */
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

  // Correlation context is per-pivot and fetched only on expand (see
  // db-reader's getCorrelatedContext docstring) -- keyed by the pivot
  // record's id, not a single flat list, since more than one pivot can
  // be expanded at once.
  const [expandedPivotId, setExpandedPivotId] = useState<number | null>(null);
  const [correlatedContext, setCorrelatedContext] = useState<Record<number, CorrelatedContextRow[]>>({});
  const [correlatedLoading, setCorrelatedLoading] = useState<number | null>(null);
  const [correlatedError, setCorrelatedError] = useState<Record<number, string>>({});

  const [report, setReport] = useState<ReportResult | null>(null);
  const [reportLoaded, setReportLoaded] = useState(false);
  const [reportLoadError, setReportLoadError] = useState<string | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

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
    }
    setLoading(false);
  };

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
    if (!opened) console.error('Failed to open report in default app');
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

  return (
    <TooltipProvider>
      <div className="flex h-screen bg-background text-foreground">
        <Sidebar active={section} onSelect={handleSectionSelect} dbStatus={dbStatus} />

        <div className="flex-1 flex flex-col min-w-0">
          {selectedRun && <EvidenceTag run={selectedRun} phase={runPhase(selectedRun)} />}

          <div className="flex-1 overflow-auto p-5">
            {section === 'runs' && (
              <RunsView
                runs={runs}
                loading={loading}
                error={error}
                selectedRun={selectedRun}
                stages={stages}
                onSelectRun={selectRun}
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
              <div>
                <h2 className="font-display text-base font-medium text-accent mb-4">Indicator Matches</h2>
                {!selectedRun ? (
                  <p className="text-muted-foreground text-sm">Select a pipeline run first.</p>
                ) : iocRecords.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    No mvt_ioc_detection or timestamp_anomaly records for this run.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
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
                          className={`rounded-md border ${
                            matched ? 'bg-flag/10 border-flag/30' : 'bg-surface border-border'
                          }`}
                        >
                          <div
                            className={`p-3 ${expandable ? 'cursor-pointer' : ''}`}
                            onClick={() => expandable && toggleCorrelatedContext(rec)}
                          >
                            <div className="flex items-center gap-2 mb-2">
                              {expandable &&
                                (expanded ? (
                                  <ChevronDown size="0.875rem" className="text-muted-foreground shrink-0" />
                                ) : (
                                  <ChevronRight size="0.875rem" className="text-muted-foreground shrink-0" />
                                ))}
                              <Badge variant={matched ? 'flag' : 'neutral'}>{rec.source_type}</Badge>
                              {rec.event_time && (
                                <span className="font-mono text-xs text-muted-foreground">
                                  {new Date(rec.event_time).toLocaleString()}
                                </span>
                              )}
                            </div>
                            {isDetection ? (
                              <>
                                <p className="text-sm">{String(rec.fields.message ?? '—')}</p>
                                {matched && (
                                  <p className="text-xs font-mono text-flag mt-1">
                                    matched: {String(rec.fields.matched_indicator)}
                                  </p>
                                )}
                              </>
                            ) : (
                              <>
                                <p className="text-sm">
                                  {String(rec.fields.plugin ?? '—')} — {String(rec.fields.description ?? rec.fields.event ?? '—')}
                                </p>
                                <p className="text-xs font-mono text-muted-foreground mt-1">
                                  {formatDelta(rec.fields.delta_from_backup_seconds)} from backup date
                                </p>
                              </>
                            )}
                          </div>
                          {expanded && (
                            <div className="border-t border-border p-3">
                              <p className="text-2xs uppercase tracking-wide text-muted-foreground mb-2">
                                Nearby events (±{CORRELATION_WINDOW_MINUTES}m)
                              </p>
                              {contextError ? (
                                <p className="text-xs text-flag font-mono">Error: {contextError}</p>
                              ) : correlatedLoading === rec.id ? (
                                <p className="text-xs text-muted-foreground">Loading...</p>
                              ) : !contextRows || contextRows.length === 0 ? (
                                <p className="text-xs text-muted-foreground">No other events in this window.</p>
                              ) : (
                                <div className="flex flex-col gap-2">
                                  {contextRows.map((ctx) => (
                                    <div key={ctx.id} className="flex items-center gap-2 text-xs">
                                      <Badge variant="neutral">{ctx.source_type}</Badge>
                                      <span className="font-mono text-muted-foreground">
                                        {ctx.event_time ? new Date(ctx.event_time).toLocaleString() : '—'}
                                      </span>
                                      {ctx.process_name && (
                                        <span className="font-mono text-foreground">{ctx.process_name}</span>
                                      )}
                                      {ctx.bundle_id && (
                                        <span className="font-mono text-muted-foreground">{ctx.bundle_id}</span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {section === 'reports' && (
              <div>
                <h2 className="font-display text-base font-medium text-accent mb-4">Reports</h2>
                {!selectedRun ? (
                  <p className="text-muted-foreground text-sm">Select a pipeline run first.</p>
                ) : reportLoadError ? (
                  <div className="text-flag bg-flag/10 border border-flag/30 rounded-md p-3 text-sm">
                    Error: {reportLoadError}
                  </div>
                ) : reportLoading || !report ? (
                  <p className="text-muted-foreground text-sm">Loading...</p>
                ) : report.status === 'no-results-path' ? (
                  <div className="bg-surface border border-border rounded-md p-4 text-sm text-muted-foreground">
                    Can't derive a results path for this run's backup source (
                    <span className="font-mono text-xs">{selectedRun.backup_source}</span>) -- it has no{' '}
                    <span className="font-mono text-xs">decrypted</span> path segment to swap for{' '}
                    <span className="font-mono text-xs">results</span>.
                  </div>
                ) : report.status === 'not-found' ? (
                  <div className="bg-surface border border-border rounded-md p-4 text-sm text-muted-foreground">
                    No report generated yet. Expected at:
                    <br />
                    <span className="font-mono text-xs">{report.path}</span>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-mono text-xs text-muted-foreground">{report.path}</span>
                      <button
                        onClick={openReportFile}
                        className="px-3 py-1 rounded-md text-xs font-mono border border-border text-muted-foreground hover:text-foreground hover:border-accent transition-colors"
                      >
                        Open in default app
                      </button>
                    </div>
                    <pre className="bg-surface border border-border rounded-md p-4 text-xs font-mono whitespace-pre-wrap overflow-auto max-h-[calc(100vh-14rem)]">
                      {report.content}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
};