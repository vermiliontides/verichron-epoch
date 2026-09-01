// Translates mvt-runner's raw stdout/stderr lines into structured
// per-backup progress, so the UI can show a plain-English status next to
// (not instead of) the raw CLI output. Pure and tolerant by design: an
// unrecognized line is a no-op, never a thrown error -- this only drives a
// friendlier display, the raw technical log underneath remains the source
// of truth for anything this doesn't catch.
//
// Depends on mvt-runner's log format staying banner/prefix-based
// (`=== <name> ===`, `  [stage]  <detail>`) -- see apps/mvt-runner/src/main.ts's
// run() loop, which is what actually produces these lines.

export type StageName = 'hash' | 'decrypt' | 'repair' | 'check';
export type StageState = 'pending' | 'running' | 'done' | 'skipped' | 'error';
export type BackupOverallState = 'queued' | 'running' | 'done' | 'failed';

export interface BackupProgress {
  label: string;
  overall: BackupOverallState;
  stages: Record<StageName, StageState>;
  errorMessage?: string;
}

export interface MvtRunProgress {
  order: string[];
  byLabel: Record<string, BackupProgress>;
  currentLabel: string | null;
}

export const STAGE_ORDER: StageName[] = ['hash', 'decrypt', 'repair', 'check'];

export const STAGE_LABELS: Record<StageName, string> = {
  hash: 'Checking backup files',
  decrypt: 'Decrypting',
  repair: 'Repairing damaged files',
  check: 'Scanning for indicators',
};

function emptyStages(): Record<StageName, StageState> {
  return { hash: 'pending', decrypt: 'pending', repair: 'pending', check: 'pending' };
}

// Seeds progress for a fresh run from the labels the user actually
// selected -- not by parsing mvt-runner's own "found N backup(s)" banner.
// That text duplicates data the UI already has authoritatively (the exact
// same selection just sent via --only), and parsing it would just be one
// more place a log-format change could silently break the UI.
export function initMvtRunProgress(labels: string[]): MvtRunProgress {
  const byLabel: Record<string, BackupProgress> = {};
  for (const label of labels) {
    byLabel[label] = { label, overall: 'queued', stages: emptyStages() };
  }
  return { order: [...labels], byLabel, currentLabel: null };
}

const BACKUP_START_RE = /^=== (.+) ===$/;
const STAGE_LINE_RE = /^\s*\[(hash|decrypt|repair|check)\]\s*(.*)$/;
const STAGE_ERROR_RE = /^\s*\[(hash|decrypt|repair|check)\]\s*error\b:?\s*(.*)$/i;

export function applyMvtLogLine(state: MvtRunProgress, rawLine: string): MvtRunProgress {
  const line = rawLine.replace(/\s+$/, '');

  const startMatch = BACKUP_START_RE.exec(line);
  if (startMatch) {
    const label = startMatch[1];
    const current = state.byLabel[label];
    if (!current) return state; // unknown label (shouldn't happen) -- ignore rather than throw

    return {
      ...state,
      currentLabel: label,
      byLabel: {
        ...state.byLabel,
        [label]: { ...current, overall: 'running', stages: { ...current.stages, hash: 'running' } },
      },
    };
  }

  if (!state.currentLabel) return state;
  const current = state.byLabel[state.currentLabel];
  if (!current) return state;

  const errorMatch = STAGE_ERROR_RE.exec(line);
  if (errorMatch) {
    const [, stageRaw, msg] = errorMatch;
    const stage = stageRaw as StageName;
    return {
      ...state,
      byLabel: {
        ...state.byLabel,
        [state.currentLabel]: {
          ...current,
          overall: 'failed',
          stages: { ...current.stages, [stage]: 'error' },
          errorMessage: msg || undefined,
        },
      },
    };
  }

  const stageMatch = STAGE_LINE_RE.exec(line);
  if (stageMatch) {
    const [, stageRaw, rest] = stageMatch;
    const stage = stageRaw as StageName;
    const isSkipped = /^(already done, skipping|skipped)/i.test(rest);
    const isDone = isSkipped || /^done\b/i.test(rest);
    if (!isDone) return state;

    const stages: Record<StageName, StageState> = { ...current.stages, [stage]: isSkipped ? 'skipped' : 'done' };
    const idx = STAGE_ORDER.indexOf(stage);
    const isLastStage = idx === STAGE_ORDER.length - 1;
    if (!isLastStage) {
      stages[STAGE_ORDER[idx + 1]] = 'running';
    }

    return {
      ...state,
      byLabel: {
        ...state.byLabel,
        [state.currentLabel]: {
          ...current,
          stages,
          overall: isLastStage ? 'done' : current.overall,
        },
      },
    };
  }

  return state;
}
