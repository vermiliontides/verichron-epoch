import React, { useEffect, useState } from 'react';
import { Database, Search, FileJson, ChevronRight, ChevronDown } from 'lucide-react';
import type { ForensicRecordRow, PipelineRunRow } from '@verichron/db-reader';
import { Badge } from '../components/ui/Badge';

interface RecordsViewProps {
  runs: PipelineRunRow[];
}

const thClass = 'sticky top-0 bg-surface/90 backdrop-blur-md z-10 text-left font-medium text-muted-foreground px-3 py-2 border-b border-border text-2xs uppercase tracking-wide';
const tdClass = 'px-3 py-3 border-b border-border group-hover:bg-surface/50 transition-colors';

function EmptyState({ icon: Icon, title, detail }: { icon: typeof Database; title: string; detail?: string }) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-2 text-muted-foreground py-16">
      <Icon size="1.5rem" strokeWidth={1.5} />
      <p className="text-sm font-medium">{title}</p>
      {detail && <p className="text-xs font-mono">{detail}</p>}
    </div>
  );
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
    <div className="flex-1 overflow-auto p-5 relative">
      <h2 className="font-display text-base font-medium text-accent mb-4 flex items-center gap-2">
        <Database size="1.25rem" />
        Forensic Records
        {!loading && !error && records.length > 0 && (
          <span className="font-mono text-2xs text-muted-foreground bg-surface px-2 py-0.5 rounded-full">
            {records.length}
          </span>
        )}
      </h2>

      <div className="flex gap-3 mb-6 relative z-20">
        <div className="relative flex-1 max-w-sm">
          <select
            value={selectedRunId}
            onChange={(e) => setSelectedRunId(e.target.value)}
            className="w-full appearance-none bg-surface/50 backdrop-blur-sm border border-border rounded-md pl-3 pr-8 py-2 text-sm text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-all hover:bg-surface/80"
          >
            <option value="">Select a run to query…</option>
            {runs.map((run) => (
              <option key={run.run_id} value={run.run_id}>
                {run.backup_source.split('/').pop()} — {new Date(run.started_at).toLocaleString()}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" size="1rem" />
        </div>

        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size="1rem" />
          <input
            type="text"
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value)}
            placeholder="Filter by source_type..."
            disabled={!selectedRunId}
            className="w-full bg-surface/50 backdrop-blur-sm border border-border rounded-md pl-9 pr-3 py-2 text-sm text-foreground font-mono placeholder:text-muted-foreground disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-all hover:bg-surface/80 disabled:hover:bg-surface/50"
          />
        </div>
      </div>

      {!selectedRunId ? (
        <EmptyState icon={Database} title="Awaiting target selection" detail="Select a pipeline run above to browse its artifacts" />
      ) : error ? (
        <div className="text-flag bg-flag/10 border border-flag/30 rounded-md px-4 py-3 text-sm flex items-center gap-2 shadow-sm">
          <div className="w-2 h-2 rounded-full bg-flag animate-pulse" />
          {error}
        </div>
      ) : loading ? (
        <div className="space-y-3 mt-8">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-8 w-full rounded bg-surface/40 animate-pulse" style={{ opacity: 1 - i * 0.1 }} />
          ))}
        </div>
      ) : records.length === 0 ? (
        <EmptyState icon={Search} title="No artifacts found" detail={sourceType ? `No records matching "${sourceType}"` : "This run produced no forensic records"} />
      ) : (
        <div className="rounded-md border border-border bg-background overflow-hidden shadow-sm">
          <table className="w-full text-sm border-collapse relative">
            <thead>
              <tr>
                <th className={`${thClass} w-8`}></th>
                {['Event Time', 'Source Type', 'Bug Type', 'Process', 'Bundle ID'].map((h) => (
                  <th key={h} className={thClass}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map((record) => {
                const isExpanded = expandedId === record.id;
                return (
                  <React.Fragment key={record.id}>
                    <tr
                      onClick={() => setExpandedId(isExpanded ? null : record.id)}
                      className={`cursor-pointer transition-all group hover:shadow-[inset_0.15rem_0_0_hsl(var(--accent))] ${
                        isExpanded ? 'bg-surface/30 shadow-[inset_0.15rem_0_0_hsl(var(--accent))]' : ''
                      }`}
                    >
                      <td className={`${tdClass} text-muted-foreground`}>
                        {isExpanded ? <ChevronDown size="1rem" /> : <ChevronRight size="1rem" />}
                      </td>
                      <td className={`${tdClass} font-mono text-xs tabular-nums tracking-tight`}>
                        {record.event_time ? new Date(record.event_time).toLocaleString() : '—'}
                      </td>
                      <td className={tdClass}>
                        <Badge variant="neutral">{record.source_type}</Badge>
                      </td>
                      <td className={`${tdClass} font-mono text-xs text-muted-foreground group-hover:text-foreground transition-colors`}>{record.bug_type ?? '—'}</td>
                      <td className={`${tdClass} font-mono text-xs`}>{record.process_name ?? '—'}</td>
                      <td className={`${tdClass} font-mono text-xs text-muted-foreground`}>{record.bundle_id ?? '—'}</td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={6} className="p-0 border-b border-border">
                          <div className="bg-[#0f1115] shadow-inner p-4 m-2 rounded-md border border-border/50 flex gap-3 overflow-x-auto">
                            <FileJson className="text-muted-foreground shrink-0 mt-0.5" size="1.25rem" />
                            <pre className="text-xs font-mono text-[hsl(var(--foreground))] whitespace-pre-wrap break-all leading-relaxed">
                              {JSON.stringify(record.fields, null, 2)}
                            </pre>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}