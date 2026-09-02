import { Clock, Layers, Bug, Globe, MessageSquare, Wifi, Cloud } from 'lucide-react';
import type { CorrelatedContextRow } from '@verichron/db-reader';
import { Badge } from './ui/Badge';

interface CorrelationTimelineProps {
  pivotEventTime: string;
  contextRows: CorrelatedContextRow[];
  windowMinutes: number;
}

function getEventIcon(sourceType: string) {
  if (sourceType.includes('crash')) return Bug;
  if (sourceType.includes('safari')) return Globe;
  if (sourceType.includes('sms')) return MessageSquare;
  if (sourceType.includes('network')) return Wifi;
  if (sourceType.includes('gcloud')) return Cloud;
  return Layers;
}

function formatOffset(pivotTimeStr: string, eventTimeStr: string | null): string {
  if (!eventTimeStr) return '—';
  const diffSec = Math.round((new Date(eventTimeStr).getTime() - new Date(pivotTimeStr).getTime()) / 1000);
  if (Math.abs(diffSec) < 60) {
    return `${diffSec >= 0 ? '+' : ''}${diffSec}s`;
  }
  const min = Math.floor(Math.abs(diffSec) / 60);
  const sec = Math.abs(diffSec) % 60;
  return `${diffSec < 0 ? '-' : '+'}${min}m ${sec}s`;
}

export function CorrelationTimeline({ pivotEventTime, contextRows, windowMinutes }: CorrelationTimelineProps) {
  return (
    <div className="space-y-3 pt-2">
      <div className="flex items-center justify-between pb-2 border-b border-border/80 text-3xs font-mono text-muted-foreground">
        <span className="uppercase tracking-wider font-semibold flex items-center gap-1">
          <Clock size="0.75rem" className="text-accent" />
          Chronological Event Ribbon (±{windowMinutes}m Window)
        </span>
        <span>{contextRows.length} Correlated Artifact(s)</span>
      </div>

      <div className="relative border-l-2 border-border/80 ml-3.5 pl-4 space-y-3">
        {contextRows.map((ctx) => {
          const Icon = getEventIcon(ctx.source_type);
          const offsetStr = formatOffset(pivotEventTime, ctx.event_time);
          const isBefore = offsetStr.startsWith('-');

          return (
            <div key={ctx.id} className="relative group">
              {/* Timeline Node Dot */}
              <div
                className={`absolute -left-[1.35rem] top-1.5 w-2 h-2 rounded-full border border-background ${
                  isBefore ? 'bg-accent/80' : 'bg-flag/80'
                }`}
              />

              <div className="p-2.5 rounded-lg border border-border bg-surface hover:bg-surface-raised transition-colors space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="subtle" className="flex items-center gap-1">
                      <Icon size="0.7rem" />
                      <span>{ctx.source_type}</span>
                    </Badge>

                    {ctx.process_name && (
                      <span className="font-mono text-xs font-semibold text-foreground">
                        {ctx.process_name}
                      </span>
                    )}

                    {ctx.bundle_id && (
                      <span className="font-mono text-2xs text-muted-foreground truncate max-w-[160px]">
                        {ctx.bundle_id}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 text-3xs font-mono">
                    <span
                      className={`px-1.5 py-0.2 rounded font-bold ${
                        isBefore
                          ? 'bg-accent/15 text-accent border border-accent/25'
                          : 'bg-flag/15 text-flag border border-flag/25'
                      }`}
                    >
                      {offsetStr}
                    </span>
                    <span className="text-muted-foreground">
                      {ctx.event_time ? new Date(ctx.event_time).toLocaleTimeString() : '—'}
                    </span>
                  </div>
                </div>

                {ctx.fields && Object.keys(ctx.fields).length > 0 && (
                  <p className="text-3xs font-mono text-muted-foreground truncate" title={JSON.stringify(ctx.fields)}>
                    {String(ctx.fields.message ?? ctx.fields.description ?? ctx.fields.event ?? ctx.fields.url ?? JSON.stringify(ctx.fields))}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
