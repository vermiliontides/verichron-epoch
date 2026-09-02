import { ShieldCheck, RotateCw, Cpu, Lock } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from './ui/Tooltip';
import type { PipelineRunRow } from '@verichron/db-reader';

interface HeaderProps {
  dbStatus: 'connected' | 'error' | 'unknown';
  selectedRun: PipelineRunRow | null;
  onRefresh: () => void;
  isRefreshing?: boolean;
}

export function Header({ dbStatus, selectedRun, onRefresh, isRefreshing }: HeaderProps) {
  const isMac = typeof window !== 'undefined' && (
    window.epoch?.platform === 'darwin' ||
    navigator.userAgent?.includes('Mac') ||
    navigator.platform?.includes('Mac')
  );

  return (
    <header className="h-13 bg-surface border-b border-border flex items-center justify-between px-6 select-none shrink-0 app-drag-region z-30">
      {/* Left section: macOS Traffic light clearance (min 112px spacer) + Branding */}
      <div className="flex items-center gap-4">
        {isMac ? (
          <div className="w-24 shrink-0 pointer-events-none" aria-hidden="true" />
        ) : null}

        <div className="flex items-center gap-3 app-no-drag">
          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-accent/15 border border-accent/35 text-accent shadow-sm">
            <Cpu size="1rem" className="animate-pulse" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-display font-bold text-sm tracking-tight text-foreground">
              VERICHRON <span className="text-accent font-mono text-xs">//</span> EPOCH
            </span>
            <span className="text-3xs font-mono font-semibold text-muted-foreground uppercase px-1.5 py-0.5 rounded border border-border bg-surface-raised">
              ENTERPRISE
            </span>
          </div>
        </div>
      </div>

      {/* Center section: Air-gapped enclave assurance badge */}
      <div className="flex items-center gap-3 app-no-drag">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-raised border border-success/30 text-success text-2xs font-mono cursor-default hover:border-success/60 transition-colors shadow-sm">
              <ShieldCheck size="0.9rem" />
              <span className="font-semibold tracking-wide">AIR-GAPPED WORKSTATION</span>
              <span className="text-3xs font-bold px-1.5 py-0.2 rounded bg-success/15 border border-success/20 text-success uppercase">
                ZERO EGRESS
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs text-xs">
            <div className="space-y-1 p-1">
              <p className="font-semibold text-foreground flex items-center gap-1.5">
                <Lock size="0.85rem" className="text-success" /> Forensic Enclave Guaranteed
              </p>
              <p className="text-muted-foreground text-2xs leading-relaxed">
                All decryption, extraction, correlation, and database operations execute locally. Outbound network telemetry is mathematically blocked to preserve digital chain of custody.
              </p>
            </div>
          </TooltipContent>
        </Tooltip>

        {selectedRun && (
          <div className="hidden xl:flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-raised border border-border text-2xs font-mono text-muted-foreground">
            <span className="text-3xs uppercase tracking-wider text-accent font-semibold">Active Case:</span>
            <span className="text-foreground font-medium truncate max-w-[220px]" title={selectedRun.backup_source}>
              {selectedRun.backup_source.split('/').pop() ?? selectedRun.backup_source}
            </span>
            <span className="text-3xs text-muted-foreground/60 font-mono">
              ({selectedRun.run_id.slice(0, 8)})
            </span>
          </div>
        )}
      </div>

      {/* Right section: DB status & Refresh */}
      <div className="flex items-center gap-3 app-no-drag">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-md border border-border bg-surface-raised text-2xs font-mono cursor-default">
              <div
                className={`w-2 h-2 rounded-full ${
                  dbStatus === 'connected'
                    ? 'bg-success shadow-[0_0_6px_hsl(var(--success))]'
                    : dbStatus === 'error'
                    ? 'bg-danger shadow-[0_0_6px_hsl(var(--danger))]'
                    : 'bg-flag animate-pulse'
                }`}
              />
              <span className="text-muted-foreground">
                {dbStatus === 'connected' ? 'Postgres: 5432' : dbStatus === 'error' ? 'DB Offline' : 'Connecting'}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p className="text-2xs font-mono">
              {dbStatus === 'connected'
                ? 'Local forensics Postgres instance connected & operational.'
                : dbStatus === 'error'
                ? 'Postgres unreachable. Check local service.'
                : 'Establishing local database connection...'}
            </p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="p-2 rounded-md border border-border bg-surface-raised hover:bg-surface-hover hover:border-accent/50 text-muted-foreground hover:text-foreground transition-all disabled:opacity-50 cursor-pointer"
              title="Refresh Data (⌘R)"
            >
              <RotateCw size="0.9rem" className={isRefreshing ? 'animate-spin text-accent' : ''} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Refresh pipeline runs and forensics state (⌘R)</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}
