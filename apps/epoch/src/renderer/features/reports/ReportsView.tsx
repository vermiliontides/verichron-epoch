import React, { useState, useEffect } from 'react';
import type { PipelineRunRow } from '@verichron/db-reader';
import type { ReportResult } from '../../../shared/types/window';
import { Button } from '../../components/ui/Button';
 
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
      <h2 className="font-display text-display text-accent mb-6">Reports</h2>
      {!selectedRun ? (
        <p className="text-muted-foreground text-sm">Select an investigation first.</p>
      ) : reportLoadError ? (
        // §1 state-color banner rule: shadow-elevation-1 + state-color border together, never border alone.
        <div className="text-flag bg-flag/10 shadow-elevation-1 border border-flag/30 rounded-lg p-4 text-data">
          Error: {reportLoadError}
        </div>
      ) : reportLoading || !report ? (
        <p className="text-muted-foreground text-sm">Loading...</p>
      ) : report.status === 'no-results-path' ? (
        <div className="bg-surface shadow-elevation-1 rounded-lg p-5 text-data text-muted-foreground">
          Can't derive a results path for this run's backup source (
          <span className="font-mono text-data">{selectedRun.backup_source}</span>) -- it has no{' '}
          <span className="font-mono text-data">decrypted</span> path segment to swap for{' '}
          <span className="font-mono text-data">results</span>.
        </div>
      ) : report.status === 'not-found' ? (
        <div className="bg-surface shadow-elevation-1 rounded-lg p-5 text-data text-muted-foreground">
          No report generated yet. Expected at:
          <br />
          <span className="font-mono text-data">{report.path}</span>
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between mb-4">
            <span className="font-mono text-data text-muted-foreground">{report.path}</span>
            {/* §1: a bordered <button> here was the wrong tool for a panel-adjacent
                control -- routed through the shared elevation-based Button primitive
                instead, which also brings text-label for free (§2). */}
            <Button variant="outline" size="sm" onClick={openReportFile}>
              Open in default app
            </Button>
          </div>
          {/* §1: was bg-surface + flat border -- panel containers use elevation, not
              border, for background separation. */}
          <pre className="bg-surface shadow-elevation-1 rounded-lg p-5 text-data font-mono whitespace-pre-wrap overflow-auto max-h-[calc(100vh-16rem)]">
            {report.content}
          </pre>
        </div>
      )}
    </div>
  );
};