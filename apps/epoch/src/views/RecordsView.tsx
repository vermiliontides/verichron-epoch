import React, { useEffect, useState } from 'react';
import type { ForensicRecordRow, PipelineRunRow } from '@verichron/db-reader';
import { Badge } from '../components/ui/badge';

interface RecordsViewProps {
  runs: PipelineRunRow[];
}

export function RecordsView({ runs }: RecordsViewProps) {
  const [selectedRunId, setSelectedRunId] = useState<string>('');
  const [sourceType, setSourceType] = useState('');
  const [records, setRecords] = useState<ForensicRecordRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    if (!selectedRunId) {
      setRecords([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    window.epoch
      .getForensicRecords(selectedRunId, sourceType.trim() || undefined)
      .then((data) => {
        if (!cancelled) setRecords(data);
      })
      .catch((err) => {
        console.error('Failed to load forensic records:', err);
        if (!cancelled) setError(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedRunId, sourceType]);

  return (
    <div className="flex-1 overflow-auto p-5">
      <h2 className="font-display text-[15px] font-medium text-accent mb-4">Forensic Records</h2>

      <div className="flex gap-3 mb-4">
        <select
          value={selectedRunId}
          onChange={(e) => setSelectedRunId(e.target.value)}
          className="bg-surface border border-border rounded-md px-3 py-1.5 text-[13px] text-foreground font-mono"
        >
          <option value="">Select a run…</option>
          {runs.map((run) => (
            <option key={run.run_id} value={run.run_id}>
              {run.backup_source.split('/').pop()} — {new Date(run.started_at).toLocaleString()}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={sourceType}
          onChange={(e) => setSourceType(e.target.value)}
          placeholder="Filter by source_type (optional)"
          disabled={!selectedRunId}
          className="bg-surface border border-border rounded-md px-3 py-1.5 text-[13px] text-foreground font-mono flex-1 max-w-xs placeholder:text-muted-foreground disabled:opacity-50"
        />
      </div>

      {!selectedRunId ? (
        <p className="text-muted-foreground text-[13px]">Select a run to view its forensic records.</p>
      ) : error ? (
        <div className="text-flag bg-flag/10 border border-flag/30 rounded-md px-3 py-2 text-[13px]">{error}</div>
      ) : loading ? (
        <p className="text-muted-foreground text-[13px]">Loading...</p>
      ) : records.length === 0 ? (
        <p className="text-muted-foreground text-[13px]">No forensic records found for this run.</p>
      ) : (
        <table className="w-full text-[13px] border-collapse">
          <thead>
            <tr>
              {['Event Time', 'Source Type', 'Bug Type', 'Process', 'PID', 'Bundle ID', 'Incident'].map((h) => (
                <th
                  key={h}
                  className="text-left font-medium text-muted-foreground bg-surface px-3 py-2.5 border-b border-border"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <React.Fragment key={record.id}>
                <tr
                  onClick={() => setExpandedId(expandedId === record.id ? null : record.id)}
                  className="cursor-pointer transition-colors hover:bg-surface"
                >
                  <td className="px-3 py-2.5 border-b border-border font-mono text-xs">
                    {record.event_time ? new Date(record.event_time).toLocaleString() : '—'}
                  </td>
                  <td className="px-3 py-2.5 border-b border-border">
                    <Badge variant="neutral">{record.source_type}</Badge>
                  </td>
                  <td className="px-3 py-2.5 border-b border-border font-mono text-xs">{record.bug_type ?? '—'}</td>
                  <td className="px-3 py-2.5 border-b border-border font-mono text-xs">
                    {record.process_name ?? '—'}
                  </td>
                  <td className="px-3 py-2.5 border-b border-border font-mono text-xs">{record.pid ?? '—'}</td>
                  <td className="px-3 py-2.5 border-b border-border font-mono text-xs">{record.bundle_id ?? '—'}</td>
                  <td className="px-3 py-2.5 border-b border-border font-mono text-xs">
                    {record.incident_id ?? '—'}
                  </td>
                </tr>
                {expandedId === record.id && (
                  <tr>
                    <td colSpan={7} className="px-3 py-3 border-b border-border bg-surface">
                      <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap break-all">
                        {JSON.stringify(record.fields, null, 2)}
                      </pre>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
