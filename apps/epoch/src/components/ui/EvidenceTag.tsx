import React from 'react';
import type { PipelineRunRow } from '@verichron/db-reader';
import { Badge } from './Badge';
import { Tooltip, TooltipTrigger, TooltipContent } from './Tooltip';
import { Copy, HardDrive, Calendar, X } from 'lucide-react';
import { useToast } from './Toast';

interface EvidenceTagProps {
  run: PipelineRunRow;
  phase: 'in_progress' | 'finished';
  onClearRun?: () => void;
}

export function EvidenceTag({ run, phase, onClearRun }: EvidenceTagProps) {
  const { success } = useToast();
  const backupName = run.backup_source.split('/').pop() ?? run.backup_source;

  const copyRunId = () => {
    navigator.clipboard.writeText(run.run_id);
    success('Run ID Copied', run.run_id);
  };

  const copyBackupPath = () => {
    navigator.clipboard.writeText(run.backup_source);
    success('Path Copied', run.backup_source);
  };

  return (
    <div className="flex items-center justify-between px-6 py-3 bg-surface border-b border-border text-xs select-none shadow-sm shrink-0">
      <div className="flex items-center gap-4 overflow-hidden">
        {/* Run UUID badge with copy */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={copyRunId}
              className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-surface-raised border border-border hover:border-accent/50 text-accent font-mono text-2xs cursor-pointer transition-colors"
            >
              <span className="text-muted-foreground text-3xs font-semibold">RUN:</span>
              <span className="font-bold">{run.run_id.slice(0, 8)}</span>
              <Copy size="0.7rem" className="opacity-60" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <span className="font-mono text-2xs">Click to copy: {run.run_id}</span>
          </TooltipContent>
        </Tooltip>

        <span className="text-border">/</span>

        {/* Backup source name */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={copyBackupPath}
              className="flex items-center gap-2 text-foreground hover:text-accent font-mono text-xs truncate max-w-md cursor-pointer transition-colors"
            >
              <HardDrive size="0.85rem" className="text-accent shrink-0" />
              <span className="truncate font-semibold">{backupName}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <span className="font-mono text-2xs">{run.backup_source}</span>
          </TooltipContent>
        </Tooltip>

        <span className="text-border">/</span>

        {/* Timestamp */}
        <div className="flex items-center gap-1.5 text-muted-foreground font-mono text-2xs">
          <Calendar size="0.8rem" />
          <span>{new Date(run.started_at).toLocaleString()}</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Badge variant={phase === 'finished' ? 'success' : 'running'} className="px-2.5 py-1">
          {phase === 'finished' ? 'ANALYSIS COMPLETE' : 'STAGE IN PROGRESS'}
        </Badge>

        {onClearRun && (
          <button
            onClick={onClearRun}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-raised transition-colors cursor-pointer"
            title="Deselect Active Run"
          >
            <X size="0.85rem" />
          </button>
        )}
      </div>
    </div>
  );
}