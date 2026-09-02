import React from 'react';
import { Database, Activity, Target, FileText, PlusCircle } from 'lucide-react';

export type Section = 'workspace' | 'runs' | 'records' | 'iocs' | 'reports';

interface SidebarProps {
  active: Section;
  onSelect: (section: Section) => void;
  dbStatus: 'connected' | 'error' | 'unknown';
}

export function Sidebar({ active, onSelect, dbStatus }: SidebarProps) {
  const navItems = [
    { id: 'workspace', label: 'New Run', icon: PlusCircle },
    { id: 'runs', label: 'Pipeline Runs', icon: Activity },
    { id: 'records', label: 'Forensic Records', icon: Database },
    { id: 'iocs', label: 'Indicator Matches', icon: Target },
    { id: 'reports', label: 'Reports', icon: FileText },
  ] as const;

  return (
    <div className="w-64 bg-surface border-r border-border flex flex-col h-full">
      <div className="p-6 border-b border-border">
        <h1 className="font-display text-xl font-bold text-foreground tracking-tight">Epoch</h1>
        <div className="flex items-center gap-2 mt-3">
          <div className={`w-2 h-2 rounded-full ${
            dbStatus === 'connected' ? 'bg-accent' : dbStatus === 'error' ? 'bg-flag' : 'bg-muted-foreground'
          }`} />
          <span className="text-xs font-mono text-muted-foreground">
            {dbStatus === 'connected' ? 'DB Connected' : dbStatus === 'error' ? 'DB Error' : 'Connecting...'}
          </span>
        </div>
      </div>

      <nav className="flex-1 p-4 flex flex-col gap-1.5 overflow-y-auto">
        {navItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onSelect(id as Section)}
            className={`flex items-center gap-3 px-4 py-2.5 rounded-md text-sm font-medium transition-all ${
              active === id
                ? 'bg-accent/10 text-accent'
                : 'text-muted-foreground hover:bg-surface/80 hover:text-foreground'
            }`}
          >
            <Icon size="1.125rem" />
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}