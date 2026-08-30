import React from 'react';
import type { ForensicRecordRow } from '@verichron/db-reader';
import { Badge } from '../components/ui/Badge';

const thClass = 'text-left font-medium text-muted-foreground bg-surface px-3 py-2 border-b border-border text-2xs uppercase tracking-wide';
const tdClass = 'px-3 py-2 border-b border-border';

interface RecordsViewProps {
  selectedRun: boolean;
  records: ForensicRecordRow[];
  availableSourceTypes: string[];
  sourceTypeFilter: string | null;
  onFilterChange: (sourceType: string | null) => void;
}

export function RecordsView({
  selectedRun,
  records,
  availableSourceTypes,
  sourceTypeFilter,
  onFilterChange,
}: RecordsViewProps) {
  const [expandedId, setExpandedId] = React.useState<number | null>(null);

  return (
    <div className="flex-1 overflow-auto p-5">
      <h2 className="font-display text-base font-medium text-accent mb-4">Forensic Records</h2>

      {!selectedRun ? (
        <p className="text-muted-foreground text-sm">Select a pipeline run first.</p>
      ) : records.length === 0 && !sourceTypeFilter ? (
        <p className="text-muted-foreground text-sm">No records for this run.</p>
      ) : (
        <>
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => onFilterChange(null)}
              className={`px-3 py-1 rounded-md text-xs font-mono border ${
                sourceTypeFilter === null ? 'border-accent text-accent' : 'border-border text-muted-foreground'
              }`}
            >
              all
            </button>
            {availableSourceTypes.map((st) => (
              <button
                key={st}
                onClick={() => onFilterChange(st)}
                className={`px-3 py-1 rounded-md text-xs font-mono border ${
                  sourceTypeFilter === st ? 'border-accent text-accent' : 'border-border text-muted-foreground'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                {['Event Time', 'Source Type', 'Bug Type', 'Process', 'PID', 'Bundle ID', 'Incident'].map((h) => (
                  <th key={h} className={thClass}>
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
                    <td className={`${tdClass} font-mono text-xs`}>
                      {record.event_time ? new Date(record.event_time).toLocaleString() : '—'}
                    </td>
                    <td className={tdClass}>
                      <Badge variant="neutral">{record.source_type}</Badge>
                    </td>
                    <td className={`${tdClass} font-mono text-xs`}>{record.bug_type ?? '—'}</td>
                    <td className={`${tdClass} font-mono text-xs`}>{record.process_name ?? '—'}</td>
                    <td className={`${tdClass} font-mono text-xs`}>{record.pid ?? '—'}</td>
                    <td className={`${tdClass} font-mono text-xs`}>{record.bundle_id ?? '—'}</td>
                    <td className={`${tdClass} font-mono text-xs`}>{record.incident_id ?? '—'}</td>
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
        </>
      )}
    </div>
  );
}
