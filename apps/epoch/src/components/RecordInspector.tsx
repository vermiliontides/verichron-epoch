import React, { useState } from 'react';
import { X, Copy, Cpu, Layers, Check } from 'lucide-react';
import type { ForensicRecordRow } from '@verichron/db-reader';
import { Badge } from './ui/Badge';
import { useToast } from './ui/Toast';

interface RecordInspectorProps {
  record: ForensicRecordRow | null;
  onClose: () => void;
  onPivotCorrelated?: (record: ForensicRecordRow) => void;
}

export function RecordInspector({ record, onClose, onPivotCorrelated }: RecordInspectorProps) {
  const [activeTab, setActiveTab] = useState<'fields' | 'json'>('fields');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const { success } = useToast();

  if (!record) return null;

  const copyVal = (key: string, val: string) => {
    navigator.clipboard.writeText(val);
    setCopiedKey(key);
    success('Copied to Clipboard', `${key}: ${val.slice(0, 30)}...`);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const copyFullJson = () => {
    navigator.clipboard.writeText(JSON.stringify(record, null, 2));
    success('JSON Copied', 'Full record payload copied to clipboard');
  };

  const coreFields = [
    { label: 'Event Time', value: record.event_time ? new Date(record.event_time).toISOString() : null },
    { label: 'Source Type', value: record.source_type },
    { label: 'Process Name', value: record.process_name },
    { label: 'Bundle ID', value: record.bundle_id },
    { label: 'PID', value: record.pid ? String(record.pid) : null },
    { label: 'Incident ID', value: record.incident_id },
    { label: 'Bug Type', value: record.bug_type },
    { label: 'File Hash (SHA-256)', value: record.file_hash },
  ].filter((f) => f.value !== null && f.value !== undefined);

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-lg bg-surface border-l border-border shadow-2xl z-40 flex flex-col animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between bg-surface-raised/40">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/30 flex items-center justify-center text-accent shrink-0">
            <Cpu size="1rem" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-display text-sm font-bold text-foreground">Forensic Record #{record.id}</h3>
              <Badge variant="neutral">{record.source_type}</Badge>
            </div>
            <p className="text-3xs font-mono text-muted-foreground truncate">
              Run: {record.run_id}
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-surface-raised transition-colors cursor-pointer"
          title="Close Inspector (Esc)"
        >
          <X size="0.9rem" />
        </button>
      </div>

      {/* Navigation tabs */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-surface-raised/20">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab('fields')}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
              activeTab === 'fields'
                ? 'bg-surface-raised text-accent font-semibold border border-accent/30'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Normalized Fields
          </button>
          <button
            onClick={() => setActiveTab('json')}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
              activeTab === 'json'
                ? 'bg-surface-raised text-accent font-semibold border border-accent/30'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Raw JSON Payload
          </button>
        </div>

        {activeTab === 'json' && (
          <button
            onClick={copyFullJson}
            className="flex items-center gap-1 text-3xs font-mono text-muted-foreground hover:text-foreground px-2 py-0.5 rounded border border-border bg-surface hover:border-accent/40 transition-colors cursor-pointer"
          >
            <Copy size="0.65rem" /> Copy JSON
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {activeTab === 'fields' ? (
          <div className="space-y-4">
            {/* Core Identification */}
            <div>
              <p className="text-3xs uppercase tracking-wider font-semibold text-muted-foreground mb-2">
                Core Envelope Attributes
              </p>
              <div className="rounded-xl border border-border divide-y divide-border bg-surface-raised/30 overflow-hidden">
                {coreFields.map((field) => (
                  <div key={field.label} className="flex items-center justify-between p-2.5 text-xs">
                    <span className="text-3xs font-mono text-muted-foreground">{field.label}</span>
                    <div className="flex items-center gap-2 max-w-[65%]">
                      <span className="font-mono text-2xs text-foreground truncate select-all" title={String(field.value)}>
                        {field.value}
                      </span>
                      <button
                        onClick={() => copyVal(field.label, String(field.value))}
                        className="text-muted-foreground hover:text-accent p-0.5 rounded cursor-pointer"
                      >
                        {copiedKey === field.label ? (
                          <Check size="0.75rem" className="text-success" />
                        ) : (
                          <Copy size="0.75rem" />
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Extractor-Specific Fields Blob */}
            {record.fields && Object.keys(record.fields).length > 0 && (
              <div>
                <p className="text-3xs uppercase tracking-wider font-semibold text-muted-foreground mb-2">
                  Extractor Domain Attributes
                </p>
                <div className="rounded-xl border border-border divide-y divide-border bg-surface-raised/30 overflow-hidden">
                  {Object.entries(record.fields).map(([k, v]) => {
                    const formattedVal = typeof v === 'object' ? JSON.stringify(v) : String(v ?? '—');
                    return (
                      <div key={k} className="p-2.5 text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-3xs font-mono text-accent font-semibold">{k}</span>
                          <button
                            onClick={() => copyVal(k, formattedVal)}
                            className="text-muted-foreground hover:text-accent p-0.5 rounded cursor-pointer"
                          >
                            {copiedKey === k ? (
                              <Check size="0.75rem" className="text-success" />
                            ) : (
                              <Copy size="0.75rem" />
                            )}
                          </button>
                        </div>
                        <p className="font-mono text-2xs text-foreground/90 break-all select-all leading-relaxed">
                          {formattedVal}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Correlation Pivot Shortcut */}
            {record.event_time && onPivotCorrelated && (
              <div className="p-3.5 rounded-xl border border-accent/30 bg-accent/5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-foreground">Cross-Domain Correlation Pivot</p>
                  <p className="text-3xs text-muted-foreground">
                    Inspect all device artifacts recorded within ±15 minutes of this timestamp.
                  </p>
                </div>
                <button
                  onClick={() => onPivotCorrelated(record)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-background hover:bg-accent/90 font-semibold text-xs transition-colors shrink-0 cursor-pointer"
                >
                  <Layers size="0.85rem" /> Correlate Events
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-[#05070d] border border-border rounded-xl p-4 overflow-auto">
            <pre className="font-mono text-2xs text-foreground/90 leading-relaxed whitespace-pre-wrap select-all">
              {JSON.stringify(record, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
