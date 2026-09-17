import React, { useState, useEffect } from 'react';
import type { PipelineRunRow } from '@verichron/db-reader';
import type { ReportResult } from '../../../shared/types/window';

interface ReportsViewProps {
  selectedRun: PipelineRunRow | null;
}

export const ReportsView: React.FC<ReportsViewProps> = ({ selectedRun }) => {
  const [report, setReport] = useState<ReportResult | null>(null);
  const [reportLoadError, setReportLoadError] = useState<string | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  const loadReport = async (run: PipelineRunRow) => {
    setReportLoading(true);
    setReportLoadError(null);
    try {
      const result = await window.epoch.getReport(run.backup_source);
      setReport(result);
    } catch (err) {
      console.error('Failed to load report:', err);
      setReportLoadError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setReportLoading(false);
    }
  };

  useEffect(() => {
    if (selectedRun) {
      loadReport(selectedRun);
    } else {
      setReport(null);
    }
  }, [selectedRun]);

  const openReportFile = async () => {
    if (!selectedRun) return;
    const opened = await window.epoch.openReport(selectedRun.backup_source);
    if (!opened) console.error('Failed to open report in default app');
  };

  return (
    <div>
      <h2 className="font-display text-base font-medium text-accent mb-6">Reports</h2>
      {!selectedRun ? (
        <p className="text-muted-foreground text-sm">Select an investigation first.</p>
      ) : reportLoadError ? (
        // EPOCH-201: an error state is a semantic signal -- the colored
        // border stays, it's what makes the state legible at a glance.
        <div className="text-flag bg-flag/10 border border-flag/30 rounded-lg p-4 text-sm">
          Error: {reportLoadError}
        </div>
      ) : reportLoading || !report ? (
        <p className="text-muted-foreground text-sm">Loading...</p>
      ) : report.status === 'no-results-path' ? (
        <div className="bg-surface shadow-elevation-1 rounded-lg p-5 text-sm text-muted-foreground">
          Can't derive a results path for this run's backup source (
          <span className="font-mono text-xs">{selectedRun.backup_source}</span>) -- it has no{' '}
          <span className="font-mono text-xs">decrypted</span> path segment to swap for{' '}
          <span className="font-mono text-xs">results</span>.
        </div>
      ) : report.status === 'not-found' ? (
        <div className="bg-surface shadow-elevation-1 rounded-lg p-5 text-sm text-muted-foreground">
          No report generated yet. Expected at:
          <br />
          <span className="font-mono text-xs">{report.path}</span>
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between mb-4">
            <span className="font-mono text-xs text-muted-foreground">{report.path}</span>
            <button
              onClick={openReportFile}
              // EPOCH-201: matches the raised-surface secondary-button
              // pattern used elsewhere (WorkspaceView's "Change" button,
              // DevicePullPanel's "Check again") instead of a flat outline.
              className="px-4 py-2 rounded-md text-xs font-mono bg-surface-raised shadow-elevation-1 hover:shadow-elevation-2 text-muted-foreground hover:text-foreground transition-all cursor-pointer"
            >
              Open in default app
            </button>
          </div>
          <pre className="bg-surface shadow-elevation-1 rounded-lg p-5 text-xs font-mono whitespace-pre-wrap overflow-auto max-h-[calc(100vh-16rem)]">
            {report.content}
          </pre>
        </div>
      )}
    </div>
  );
};