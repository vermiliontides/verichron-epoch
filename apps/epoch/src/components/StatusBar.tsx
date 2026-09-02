import React from 'react';
import { Copy, HardDrive, ShieldCheck, Database } from 'lucide-react';
import type { PipelineRunRow } from '@verichron/db-reader';
import { useToast } from './ui/Toast';

interface StatusBarProps {
  selectedRun: PipelineRunRow | null;
  totalRecordsCount?: number;
  iocCount?: number;
  workspacePath?: string;
}

export function StatusBar({ selectedRun, totalRecordsCount = 0, iocCount = 0, workspacePath = '~/mvt-workspace' }: StatusBarProps) {
  const { success } = useToast();

  const copyRunId = () => {
    if (!selectedRun) return;
    navigator.clipboard.writeText(selectedRun.run_id);
    success('Run ID Copied', selectedRun.run_id);
  };

  return (
    <footer className="h-6 bg-surface border-t border-border flex items-center justify-between px-3 text-3xs font-mono text-muted-foreground select-none shrink-0 z-20">
      {/* Left items: Run UUID and path */}
      <div className="flex items-center gap-3">
        {selectedRun ? (
          <button
            onClick={copyRunId}
            className="flex items-center gap-1.5 hover:text-foreground text-accent transition-colors group cursor-pointer"
            title="Click to copy full Run UUID"
          >
            <span className="text-muted-foreground">RUN:</span>
            <span className="font-semibold">{selectedRun.run_id.slice(0, 8)}...</span>
            <Copy size="0.65rem" className="opacity-60 group-hover:opacity-100" />
          </button>
        ) : (
          <span className="text-muted-foreground/60 italic">No Active Run Selected</span>
        )}

        <span className="text-border">|</span>

        <div className="flex items-center gap-1 text-muted-foreground truncate max-w-xs" title={workspacePath}>
          <HardDrive size="0.65rem" />
          <span>{workspacePath}</span>
        </div>
      </div>

      {/* Center: Evidentiary Guarantee */}
      <div className="hidden md:flex items-center gap-1.5 text-muted-foreground/80">
        <ShieldCheck size="0.75rem" className="text-success" />
        <span className="text-3xs tracking-wider uppercase">Ledger: SHA-256 Chain-of-Custody Active</span>
      </div>

      {/* Right: Telemetry metrics */}
      <div className="flex items-center gap-3">
        {selectedRun && (
          <>
            <div className="flex items-center gap-1">
              <Database size="0.65rem" />
              <span>Records:</span>
              <span className="text-foreground font-semibold tabular-nums">{totalRecordsCount}</span>
            </div>

            {iocCount > 0 && (
              <div className="flex items-center gap-1 text-danger font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-danger animate-pulse" />
                <span>IOC Hits:</span>
                <span className="tabular-nums">{iocCount}</span>
              </div>
            )}

            <span className="text-border">|</span>
          </>
        )}

        <div className="flex items-center gap-1 text-success">
          <span className="w-1.5 h-1.5 rounded-full bg-success" />
          <span>Local Enclave</span>
        </div>
      </div>
    </footer>
  );
}
