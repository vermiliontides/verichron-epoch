import { Smartphone, Circle, Loader2, CheckCircle2, XCircle, KeyRound, Lock } from 'lucide-react';
import type { Backup } from '@verichron/contracts';
import { STAGE_ORDER, STAGE_LABELS, type BackupProgress } from '../lib/mvtLogParser';
import { Badge } from './ui/Badge';

interface BackupRowProps {
  backup: Backup;
  selected: boolean;
  onToggle: () => void;
  disabled: boolean;
  liveProgress?: BackupProgress;
  awaitingPassword?: boolean;
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
      className={`group relative flex items-center justify-between px-3.5 py-3 text-sm cursor-pointer transition-all ${
        selected
          ? 'bg-surface-raised/80 border-l-2 border-l-accent'
          : 'hover:bg-surface-raised/40 border-l-2 border-l-transparent'
      } ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          disabled={disabled}
          className="w-4 h-4 rounded border-border bg-surface text-accent focus:ring-accent accent-accent cursor-pointer"
        />

        <div className="w-8 h-8 rounded bg-surface border border-border flex items-center justify-center shrink-0 text-muted-foreground group-hover:text-accent group-hover:border-accent/30 transition-colors">
          <Smartphone size="1rem" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold text-foreground truncate" title={backup.label}>
              {backup.label}
            </span>
            <span className="text-3xs font-mono text-muted-foreground px-1.5 py-0.2 rounded border border-border bg-surface flex items-center gap-1">
              <Lock size="0.65rem" className="text-flag" /> Encrypted
            </span>
          </div>
          <p className="text-3xs font-mono text-muted-foreground truncate mt-0.5" title={backup.path}>
            {backup.path}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 ml-3">
        {lastResult === 'done' && (
          <Badge variant="success">
            <CheckCircle2 size="0.75rem" /> Complete
          </Badge>
        )}
        {lastResult === 'failed' && (
          <Badge variant="danger">
            <XCircle size="0.75rem" /> Failed
          </Badge>
        )}
      </div>
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
  let statusBadge = <Badge variant="neutral">Queued</Badge>;

  if (progress.overall === 'running') {
    icon = <Loader2 size="1rem" className="text-accent shrink-0 animate-spin" />;
    statusText = awaitingPassword
      ? 'Waiting for decryption password'
      : runningStage
      ? `${STAGE_LABELS[runningStage]}...`
      : 'Processing pipeline...';
    statusBadge = (
      <Badge variant="running">
        {awaitingPassword ? 'Password Needed' : runningStage ? STAGE_LABELS[runningStage] : 'In Progress'}
      </Badge>
    );
  } else if (progress.overall === 'done') {
    icon = <CheckCircle2 size="1rem" className="text-success shrink-0" />;
    statusText = 'Decryption and MVT scans complete';
    statusBadge = <Badge variant="success">Complete</Badge>;
  } else if (progress.overall === 'failed') {
    icon = <XCircle size="1rem" className="text-danger shrink-0" />;
    statusText = failedStage
      ? `Failed at ${STAGE_LABELS[failedStage].toLowerCase()}${
          progress.errorMessage ? `: ${progress.errorMessage}` : ''
        }`
      : 'Pipeline failed';
    statusBadge = <Badge variant="danger">Failed</Badge>;
  }

  return (
    <div className="flex items-center justify-between px-3.5 py-3 text-sm bg-surface-raised/50 border-l-2 border-l-accent">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {awaitingPassword ? <KeyRound size="1.1rem" className="text-flag shrink-0 animate-bounce" /> : icon}

        <div className="min-w-0 flex-1">
          <div className="font-mono text-xs font-semibold text-foreground truncate" title={backup.path}>
            {backup.label}
          </div>
          <div className="text-3xs font-mono text-muted-foreground truncate mt-0.5">{statusText}</div>
        </div>
      </div>

      <div className="shrink-0 ml-3">{statusBadge}</div>
    </div>
  );
}
