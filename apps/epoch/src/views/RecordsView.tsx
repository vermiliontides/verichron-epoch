import React, { useState, useMemo } from 'react';
import type { ForensicRecordRow } from '@verichron/db-reader';
import { Badge } from '../components/ui/Badge';
import { RecordInspector } from '../components/RecordInspector';
import {
  Search,
  Database,
  ArrowUpDown,
  Bug,
  Globe,
  MessageSquare,
  Wifi,
  Cloud,
  FileCode,
  ChevronRight,
  Inbox,
} from 'lucide-react';
import { useToast } from '../components/ui/Toast';

interface RecordsViewProps {
  selectedRun: boolean;
  records: ForensicRecordRow[];
  availableSourceTypes: string[];
  sourceTypeFilter: string | null;
  onFilterChange: (sourceType: string | null) => void;
  onPivotCorrelated?: (record: ForensicRecordRow) => void;
}

export function RecordsView({
  selectedRun,
  records,
  availableSourceTypes,
  sourceTypeFilter,
  onFilterChange,
  onPivotCorrelated,
}: RecordsViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRecord, setSelectedRecord] = useState<ForensicRecordRow | null>(null);
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const { success } = useToast();

  const filteredRecords = useMemo(() => {
    let result = records;

    if (sourceTypeFilter) {
      result = result.filter((r) => r.source_type === sourceTypeFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((r) => {
        const process = r.process_name?.toLowerCase() ?? '';
        const bundle = r.bundle_id?.toLowerCase() ?? '';
        const bug = r.bug_type?.toLowerCase() ?? '';
        const incident = r.incident_id?.toLowerCase() ?? '';
        const fields = JSON.stringify(r.fields).toLowerCase();
        return (
          process.includes(q) ||
          bundle.includes(q) ||
          bug.includes(q) ||
          incident.includes(q) ||
          fields.includes(q)
        );
      });
    }

    return [...result].sort((a, b) => {
      const timeA = a.event_time ? new Date(a.event_time).getTime() : 0;
      const timeB = b.event_time ? new Date(b.event_time).getTime() : 0;
      return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
    });
  }, [records, sourceTypeFilter, searchQuery, sortOrder]);

  const exportRecords = (format: 'json' | 'csv') => {
    if (filteredRecords.length === 0) return;

    if (format === 'json') {
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(filteredRecords, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', `forensic_records_${Date.now()}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      success('Export Completed', `Exported ${filteredRecords.length} records to JSON`);
    } else {
      const headers = ['id', 'source_type', 'event_time', 'process_name', 'bundle_id', 'bug_type', 'incident_id'];
      const rows = filteredRecords.map((r) =>
        [r.id, r.source_type, r.event_time, r.process_name, r.bundle_id, r.bug_type, r.incident_id]
          .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`)
          .join(',')
      );
      const csvStr = 'data:text/csv;charset=utf-8,' + encodeURIComponent([headers.join(','), ...rows].join('\n'));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', csvStr);
      downloadAnchor.setAttribute('download', `forensic_records_${Date.now()}.csv`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      success('Export Completed', `Exported ${filteredRecords.length} records to CSV`);
    }
  };

  const getSourceIcon = (sourceType: string) => {
    if (sourceType.includes('crash')) return Bug;
    if (sourceType.includes('safari')) return Globe;
    if (sourceType.includes('sms')) return MessageSquare;
    if (sourceType.includes('network')) return Wifi;
    if (sourceType.includes('gcloud')) return Cloud;
    return FileCode;
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">
      {/* Top Command & Filter Bar */}
      <div className="px-6 py-5 border-b border-border space-y-4 bg-surface/50 shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-bold text-foreground tracking-tight flex items-center gap-3">
              Forensic Records Workbench
              {selectedRun && (
                <Badge variant="neutral">
                  {filteredRecords.length} of {records.length} Records
                </Badge>
              )}
            </h2>
            <p className="text-3xs text-muted-foreground mt-1">
              Multi-domain normalized evidentiary ledger extracted from physical and staged backups
            </p>
          </div>

          {selectedRun && records.length > 0 && (
            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={() => setSortOrder((o) => (o === 'desc' ? 'asc' : 'desc'))}
                className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-surface-raised hover:border-accent/50 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors cursor-pointer shadow-sm"
                title="Toggle Chronological Sort Order"
              >
                <ArrowUpDown size="0.8rem" />
                <span>{sortOrder === 'desc' ? 'Newest First' : 'Oldest First'}</span>
              </button>

              <div className="flex items-center rounded-xl border border-border bg-surface-raised overflow-hidden text-xs font-mono shadow-sm">
                <button
                  onClick={() => exportRecords('json')}
                  className="px-3.5 py-2 hover:bg-surface text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  Export JSON
                </button>
                <span className="text-border">|</span>
                <button
                  onClick={() => exportRecords('csv')}
                  className="px-3.5 py-2 hover:bg-surface text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  CSV
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Search & Domain Filter Pills */}
        {selectedRun && records.length > 0 && (
          <div className="flex flex-col lg:flex-row lg:items-center gap-3 pt-1">
            <div className="relative flex-1">
              <Search size="0.9rem" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search processes, bundle IDs, bugs, or payload attributes..."
                className="w-full bg-background border border-border focus:border-accent rounded-xl pl-10 pr-4 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground/50 transition-colors"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
              <button
                onClick={() => onFilterChange(null)}
                className={`px-3 py-1.5 rounded-lg text-2xs font-mono transition-all cursor-pointer ${
                  sourceTypeFilter === null
                    ? 'bg-accent text-background font-bold shadow-sm'
                    : 'bg-surface-raised border border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                All Domains
              </button>

              {availableSourceTypes.map((st) => (
                <button
                  key={st}
                  onClick={() => onFilterChange(st)}
                  className={`px-3 py-1.5 rounded-lg text-2xs font-mono whitespace-nowrap transition-all cursor-pointer ${
                    sourceTypeFilter === st
                      ? 'bg-accent text-background font-bold shadow-sm'
                      : 'bg-surface-raised border border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Main Forensic Grid */}
      <div className="flex-1 overflow-auto">
        {!selectedRun ? (
          <div className="flex flex-col items-center justify-center h-80 text-muted-foreground p-8 text-center">
            <Inbox size="2.5rem" strokeWidth={1.5} className="mb-3 opacity-50" />
            <p className="text-sm font-bold text-foreground">Select a Pipeline Run</p>
            <p className="text-3xs font-mono mt-1.5 max-w-sm leading-relaxed">
              Choose a pipeline execution from the Pipeline Runs module to load and query normalized forensic artifacts.
            </p>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-80 text-muted-foreground p-8 text-center">
            <Database size="2.5rem" strokeWidth={1.5} className="mb-3 opacity-50" />
            <p className="text-sm font-bold text-foreground">No Forensic Records Found</p>
            <p className="text-3xs font-mono mt-1.5 max-w-sm leading-relaxed">
              {searchQuery || sourceTypeFilter
                ? 'Try adjusting your search query or domain filter.'
                : 'No forensic records have been ingested for this run.'}
            </p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse select-text">
            <thead>
              <tr className="sticky top-0 bg-surface border-b border-border z-10 text-3xs font-mono uppercase tracking-widest text-muted-foreground/80">
                <th className="py-3 px-4 font-bold">Event Timestamp</th>
                <th className="py-3 px-4 font-bold">Domain</th>
                <th className="py-3 px-4 font-bold">Process / Target</th>
                <th className="py-3 px-4 font-bold">Bundle ID</th>
                <th className="py-3 px-4 font-bold">Bug / Artifact Type</th>
                <th className="py-3 px-4 font-bold">Incident ID</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60 text-xs font-mono">
              {filteredRecords.map((rec) => {
                const Icon = getSourceIcon(rec.source_type);
                const isSelected = selectedRecord?.id === rec.id;

                return (
                  <tr
                    key={rec.id}
                    onClick={() => setSelectedRecord(rec)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-surface-raised border-l-2 border-l-accent'
                        : 'hover:bg-surface-raised/50 border-l-2 border-l-transparent'
                    }`}
                  >
                    <td className="py-3 px-4 text-2xs text-muted-foreground whitespace-nowrap">
                      {rec.event_time ? new Date(rec.event_time).toLocaleString() : '—'}
                    </td>

                    <td className="py-3 px-4">
                      <Badge variant="subtle" className="flex items-center gap-1.5 w-fit">
                        <Icon size="0.75rem" className="text-accent" />
                        <span>{rec.source_type}</span>
                      </Badge>
                    </td>

                    <td className="py-3 px-4 text-foreground font-semibold truncate max-w-[200px]" title={rec.process_name ?? ''}>
                      {rec.process_name || '—'}
                    </td>

                    <td className="py-3 px-4 text-2xs text-muted-foreground truncate max-w-[220px]" title={rec.bundle_id ?? ''}>
                      {rec.bundle_id || '—'}
                    </td>

                    <td className="py-3 px-4 text-2xs text-foreground/85 font-medium">
                      {rec.bug_type || '—'}
                    </td>

                    <td className="py-3 px-4 text-2xs text-muted-foreground truncate max-w-[140px]" title={rec.incident_id ?? ''}>
                      {rec.incident_id || '—'}
                    </td>

                    <td className="py-3 px-4 text-right">
                      <ChevronRight size="0.95rem" className="inline text-muted-foreground/60" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Slide-over Inspector */}
      {selectedRecord && (
        <RecordInspector
          record={selectedRecord}
          onClose={() => setSelectedRecord(null)}
          onPivotCorrelated={onPivotCorrelated}
        />
      )}
    </div>
  );
}
