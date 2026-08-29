import React from 'react';
import { ListChecks, FileSearch, Flag, FileText } from 'lucide-react';
import { cn } from '../lib/utils';

export type Section = 'runs' | 'records' | 'iocs' | 'reports';

const NAV_ITEMS: { section: Section; label: string; icon: typeof ListChecks }[] = [
  { section: 'runs', label: 'Runs', icon: ListChecks },
  { section: 'records', label: 'Records', icon: FileSearch },
  { section: 'iocs', label: 'IOCs', icon: Flag },
  { section: 'reports', label: 'Reports', icon: FileText },
];

interface SidebarProps {
  active: Section;
  onSelect: (section: Section) => void;
  dbStatus: 'connected' | 'error' | 'unknown';
}

export function Sidebar({ active, onSelect, dbStatus }: SidebarProps) {
  return (
    <div className="w-44 shrink-0 bg-[hsl(217_17%_12%)] border-r border-border flex flex-col py-4">
      <div className="font-display text-[15px] font-medium px-4 pb-4">Epoch</div>
      {NAV_ITEMS.map(({ section, label, icon: Icon }) => (
        <button
          key={section}
          onClick={() => onSelect(section)}
          className={cn(
            'flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-left border-l-2 border-transparent transition-colors',
            active === section
              ? 'bg-surface text-accent border-accent'
              : 'text-muted-foreground hover:bg-surface hover:text-foreground'
          )}
        >
          <Icon size={16} />
          {label}
        </button>
      ))}
      <div className="mt-auto pt-3 px-4 border-t border-border flex items-center gap-2 text-xs text-muted-foreground">
        <span
          className={cn(
            'w-1.5 h-1.5 rounded-full',
            dbStatus === 'connected' && 'bg-accent',
            dbStatus === 'error' && 'bg-flag',
            dbStatus === 'unknown' && 'bg-muted-foreground'
          )}
        />
        {dbStatus === 'connected' ? 'connected' : dbStatus === 'error' ? 'db error' : 'unknown'}
      </div>
    </div>
  );
}
