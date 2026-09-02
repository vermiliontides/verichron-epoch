import React, { useState } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import type { PipelineRunRow, ForensicRecordRow, CorrelatedContextRow } from '@verichron/db-reader';
import { CORRELATION_WINDOW_MINUTES } from '@verichron/db-reader';
import { Badge } from '../../components/ui/Badge';

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

interface IocsViewProps {
  selectedRun: PipelineRunRow | null;
  records: ForensicRecordRow[];
}

export const IocsView: React.FC<IocsViewProps> = ({ selectedRun, records }) => {
  const [expandedPivotId, setExpandedPivotId] = useState<number | null>(null);
  const [correlatedContext, setCorrelatedContext] = useState<Record<number, CorrelatedContextRow[]>>({});
  const [correlatedLoading, setCorrelatedLoading] = useState<number | null>(null);
  const [correlatedError, setCorrelatedError] = useState<Record<number, string>>({});

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

  return (
    <div>
      <h2 className="font-display text-base font-medium text-accent mb-6">Indicator Matches</h2>
      {!selectedRun ? (
        <p className="text-muted-foreground text-sm">Select a pipeline run first.</p>
      ) : iocRecords.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No mvt_ioc_detection or timestamp_anomaly records for this run.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
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
                className={`rounded-lg border ${
                  matched ? 'bg-flag/10 border-flag/30' : 'bg-surface border-border'
                }`}
              >
                <div
                  className={`p-4 ${expandable ? 'cursor-pointer' : ''}`}
                  onClick={() => expandable && toggleCorrelatedContext(rec)}
                >
                  <div className="flex items-center gap-2 mb-3">
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
                        <p className="text-xs font-mono text-flag mt-2">
                          matched: {String(rec.fields.matched_indicator)}
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      <p className="text-sm">
                        {String(rec.fields.plugin ?? '—')} — {String(rec.fields.description ?? rec.fields.event ?? '—')}
                      </p>
                      <p className="text-xs font-mono text-muted-foreground mt-2">
                        {formatDelta(rec.fields.delta_from_backup_seconds)} from backup date
                      </p>
                    </>
                  )}
                </div>
                {expanded && (
                  <div className="border-t border-border p-4">
                    <p className="text-2xs uppercase tracking-wide text-muted-foreground mb-3">
                      Nearby events (±{CORRELATION_WINDOW_MINUTES}m)
                    </p>
                    {contextError ? (
                      <p className="text-xs text-flag font-mono">Error: {contextError}</p>
                    ) : correlatedLoading === rec.id ? (
                      <p className="text-xs text-muted-foreground">Loading...</p>
                    ) : !contextRows || contextRows.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No other events in this window.</p>
                    ) : (
                      <div className="flex flex-col gap-2.5">
                        {contextRows.map((ctx) => (
                          <div key={ctx.id} className="flex items-center gap-3 text-xs">
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
  );
};