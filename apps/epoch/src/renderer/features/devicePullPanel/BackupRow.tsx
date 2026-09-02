import React from 'react';
import { Smartphone, Circle, Loader2, CheckCircle2, XCircle, KeyRound } from 'lucide-react';
import type { Backup } from '@verichron/contracts';
import { STAGE_ORDER, STAGE_LABELS, type BackupProgress } from '../../../shared/lib/mvtLogParser';

interface BackupRowProps {
  backup: Backup;
  selected: boolean;
  onToggle: () => void;
  disabled: boolean;
  // Set only while a run is actively in progress -- switches the row from
  // a checkbox into a live plain-English status line, since selection
  // can't change mid-run anyway.
  liveProgress?: BackupProgress;
  awaitingPassword?: boolean;
  // Set once a run has finished, so the checkbox comes back (letting the
  // user adjust selection for the next run) without losing what happened
  // last time.
  lastResult?: 'done' | 'failed';
}

export function BackupRow({
  backup,
  selected,
  onToggle,
  disabled,
  liveProgress,
  awaitingPassword,
  lastResult,
}: BackupRowProps) {
  if (liveProgress) {
    return <LiveBackupRow backup={backup} progress={liveProgress} awaitingPassword={awaitingPassword} />;
  }

  return (
    <label
      className={`flex items-center gap-3 px-4 py-3 text-sm cursor-pointer hover:bg-surface/60 ${
        disabled ? 'opacity-50 pointer-events-none' : ''
      }`}
    >
      <input type="checkbox" checked={selected} onChange={onToggle} disabled={disabled} className="accent-accent" />
      <Smartphone size="1rem" className="text-muted-foreground shrink-0" />
      <span className="font-mono text-foreground truncate flex-1" title={backup.path}>
        {backup.label}
      </span>
      {lastResult === 'done' && <CheckCircle2 size="1rem" className="text-accent shrink-0" />}
      {lastResult === 'failed' && <XCircle size="1rem" className="text-danger shrink-0" />}
    </label>
  );
}

function LiveBackupRow({
  backup,
  progress,
  awaitingPassword,
}: {
  backup: Backup;
  progress: BackupProgress;
  awaitingPassword?: boolean;
}) {
  const failedStage = STAGE_ORDER.find((s) => progress.stages[s] === 'error');
  const runningStage = STAGE_ORDER.find((s) => progress.stages[s] === 'running');

  let icon = <Circle size="1rem" className="text-muted-foreground shrink-0" />;
  let statusText = 'Waiting in queue';
  let statusClass = 'text-muted-foreground';

  if (progress.overall === 'running') {
    icon = <Loader2 size="1rem" className="text-flag shrink-0 animate-spin" />;
    statusText = awaitingPassword ? 'Waiting for password' : runningStage ? `${STAGE_LABELS[runningStage]}...` : 'Working...';
    statusClass = 'text-flag';
  } else if (progress.overall === 'done') {
    icon = <CheckCircle2 size="1rem" className="text-accent shrink-0" />;
    statusText = 'Complete';
    statusClass = 'text-accent';
  } else if (progress.overall === 'failed') {
    icon = <XCircle size="1rem" className="text-danger shrink-0" />;
    statusText = failedStage
      ? `Couldn't finish ${STAGE_LABELS[failedStage].toLowerCase()}${progress.errorMessage ? ` — ${progress.errorMessage}` : ''}`
      : "Couldn't finish";
    statusClass = 'text-danger';
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 text-sm">
      {awaitingPassword ? <KeyRound size="1rem" className="text-flag shrink-0" /> : icon}
      <div className="min-w-0 flex-1">
        <div className="font-mono text-foreground truncate" title={backup.path}>
          {backup.label}
        </div>
        <div className={`text-xs truncate ${statusClass}`}>{statusText}</div>
      </div>
    </div>
  );
}