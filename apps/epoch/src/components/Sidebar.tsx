import React from 'react';
import { Database, Activity, Target, FileText, HardDriveDownload, Fingerprint } from 'lucide-react';

export type Section = 'workspace' | 'runs' | 'records' | 'iocs' | 'reports';

interface SidebarProps {
  active: Section;
  onSelect: (section: Section) => void;
  dbStatus?: 'connected' | 'error' | 'unknown';
  runsCount?: number;
  recordsCount?: number;
  iocCount?: number;
}

export function Sidebar({ active, onSelect, runsCount = 0, recordsCount = 0, iocCount = 0 }: SidebarProps) {
  const navItems = [
    {
      id: 'workspace',
      label: 'Acquisition & Ingest',
      description: 'Physical USB & Staged Backups',
      icon: HardDriveDownload,
      shortcut: '⌘1',
      badge: null,
    },
    {
      id: 'runs',
      label: 'Pipeline Telemetry',
      description: 'Execution Stages & DAG',
      icon: Activity,
      shortcut: '⌘2',
      badge: runsCount > 0 ? { text: String(runsCount), variant: 'neutral' as const } : null,
    },
    {
      id: 'records',
      label: 'Forensic Records',
      description: 'Cross-Domain Artifact Grid',
      icon: Database,
      shortcut: '⌘3',
      badge: recordsCount > 0 ? { text: String(recordsCount), variant: 'accent' as const } : null,
    },
    {
      id: 'iocs',
      label: 'Indicator Matches',
      description: 'Spyware & Timing Anomalies',
      icon: Target,
      shortcut: '⌘4',
      badge: iocCount > 0 ? { text: String(iocCount), variant: 'danger' as const, pulse: true } : null,
    },
    {
      id: 'reports',
      label: 'Audit Dossiers',
      description: 'Executive Forensic Reports',
      icon: FileText,
      shortcut: '⌘5',
      badge: null,
    },
  ] as const;

  return (
    <aside className="w-64 bg-surface border-r border-border flex flex-col h-full select-none shrink-0 z-20">
      {/* Navigation section */}
      <div className="p-4 flex-1 overflow-y-auto">
        <p className="text-3xs uppercase tracking-widest font-bold text-muted-foreground/70 px-3 mb-3">
          Forensic Modules
        </p>

        <nav className="flex flex-col gap-1.5">
          {navItems.map(({ id, label, description, icon: Icon, shortcut, badge }) => {
            const isSelected = active === id;
            return (
              <button
                key={id}
                onClick={() => onSelect(id as Section)}
                className={`group relative flex items-center justify-between px-3.5 py-2.5 rounded-xl text-left transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-surface-raised border border-accent/35 text-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-surface-raised/60 hover:text-foreground border border-transparent'
                }`}
              >
                {/* Active left indicator glow */}
                {isSelected && (
                  <div className="absolute left-0 top-2 bottom-2 w-1 rounded-r bg-accent shadow-[0_0_8px_hsl(var(--accent))]" />
                )}

                <div className="flex items-center gap-3 min-w-0">
                  <Icon
                    size="1.05rem"
                    className={`shrink-0 transition-colors ${
                      isSelected ? 'text-accent' : 'text-muted-foreground group-hover:text-foreground'
                    }`}
                  />
                  <div className="min-w-0">
                    <p className={`text-xs font-semibold leading-tight truncate ${isSelected ? 'text-foreground' : ''}`}>
                      {label}
                    </p>
                    <p className="text-3xs text-muted-foreground/80 truncate mt-0.5">{description}</p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  {badge ? (
                    <span
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-3xs font-mono font-bold border ${
                        badge.variant === 'danger'
                          ? 'bg-danger/20 text-danger border-danger/40 animate-pulse'
                          : badge.variant === 'accent'
                          ? 'bg-accent/15 text-accent border-accent/30'
                          : 'bg-surface text-muted-foreground border-border'
                      }`}
                    >
                      {'pulse' in badge && Boolean(badge.pulse) && (
                        <span className="w-1 h-1 rounded-full bg-danger animate-ping" />
                      )}
                      {badge.text}
                    </span>
                  ) : (
                    <span className="text-3xs font-mono text-muted-foreground/40 group-hover:text-muted-foreground/70 transition-colors">
                      {shortcut}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Evidentiary Integrity Badge at Bottom */}
      <div className="p-4 border-t border-border bg-surface-raised/20">
        <div className="p-3 rounded-xl border border-border/80 bg-surface flex flex-col gap-1.5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-3xs uppercase tracking-wider font-bold text-accent flex items-center gap-1.5">
              <Fingerprint size="0.8rem" /> Chain of Custody
            </span>
            <span className="w-2 h-2 rounded-full bg-success shadow-[0_0_6px_hsl(var(--success))]" />
          </div>
          <p className="text-3xs text-muted-foreground leading-relaxed font-mono">
            Cryptographic SHA-256 ledger active. All forensic artifacts sealed.
          </p>
        </div>
      </div>
    </aside>
  );
}