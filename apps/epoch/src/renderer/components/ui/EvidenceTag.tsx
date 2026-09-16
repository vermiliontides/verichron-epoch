import React from 'react';
import type { PipelineRunRow } from '../../../../../../packages/etl-db-reader/dist';
import { Badge } from './Badge';
import { Tooltip, TooltipTrigger, TooltipContent } from './Tooltip';

interface EvidenceTagProps {
  run: PipelineRunRow;
  phase: 'in_progress' | 'finished';
}

export function EvidenceTag({ run, phase }: EvidenceTagProps) {
  return (
    <div className="flex items-center gap-4 px-6 py-3 shadow-elevation-1 text-xs">
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