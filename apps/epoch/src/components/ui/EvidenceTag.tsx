import React from 'react';
import type { PipelineRunRow } from '@verichron/db-reader';
import { Badge } from './Badge';
import { Tooltip, TooltipTrigger, TooltipContent } from './Tooltip';

/**
 * Shows only what pipeline_runs actually has. No integrity/verification
 * claim is made here -- the schema's only real hash (ingested_files.file_hash,
 * SHA-256) is per-file, not per-run, and isn't exposed by any IPC channel
 * today. run_id is a UUID (gen_random_uuid), not a content hash; it's
 * labeled "Run" below, not "hash", so this doesn't imply a check that
 * isn't happening.
 */
interface EvidenceTagProps {
  run: PipelineRunRow;
  phase: 'in_progress' | 'finished';
}

export function EvidenceTag({ run, phase }: EvidenceTagProps) {
  return (
    <div className="flex items-center gap-4 px-5 py-2.5 border-b border-border text-xs">
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="font-mono text-accent cursor-default">
            {run.run_id.slice(0, 8)}
          </span>
        </TooltipTrigger>
        <TooltipContent>{run.run_id}</TooltipContent>
      </Tooltip>
      <span className="font-mono text-muted-foreground">
        {run.backup_source.split('/').pop()}
      </span>
      <span className="font-mono text-muted-foreground">
        {new Date(run.started_at).toLocaleString()}
      </span>
      <Badge variant={phase === 'finished' ? 'accent' : 'flag'}>
        {phase === 'finished' ? 'finished' : 'in progress'}
      </Badge>
    </div>
  );
}