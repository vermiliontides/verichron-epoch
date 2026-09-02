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

  useEffect(() => {
    if (selectedRun) {
      loadReport(selectedRun);
    } else {
      setReport(null);
    }
  }, [selectedRun]);

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

  const openReportFile = async () => {
    if (!selectedRun) return;
    const opened = await window.epoch.openReport(selectedRun.backup_source);
    if (!opened) console.error('Failed to open report in default app');
  };

  return (
    <div>
      <h2 className="font-display text-base font-medium text-accent mb-6">Reports</h2>
      {!selectedRun ? (
        <p className="text-muted-foreground text-sm">Select a pipeline run first.</p>
      ) : reportLoadError ? (
        <div className="text-flag bg-flag/10 border border-flag/30 rounded-lg p-4 text-sm">
          Error: {reportLoadError}
        </div>
      ) : reportLoading || !report ? (
        <p className="text-muted-foreground text-sm">Loading...</p>
      ) : report.status === 'no-results-path' ? (
        <div className="bg-surface border border-border rounded-lg p-5 text-sm text-muted-foreground">
          Can't derive a results path for this run's backup source (
          <span className="font-mono text-xs">{selectedRun.backup_source}</span>) -- it has no{' '}
          <span className="font-mono text-xs">decrypted</span> path segment to swap for{' '}
          <span className="font-mono text-xs">results</span>.
        </div>
      ) : report.status === 'not-found' ? (
        <div className="bg-surface border border-border rounded-lg p-5 text-sm text-muted-foreground">
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
              className="px-4 py-2 rounded-md text-xs font-mono border border-border text-muted-foreground hover:text-foreground hover:border-accent transition-colors"
            >
              Open in default app
            </button>
          </div>
          <pre className="bg-surface border border-border rounded-lg p-5 text-xs font-mono whitespace-pre-wrap overflow-auto max-h-[calc(100vh-16rem)]">
            {report.content}
          </pre>
        </div>
      )}
    </div>
  );
};