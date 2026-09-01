import path from 'node:path';
 
/**
 * Derives a backup's results/<n>/ directory from its decrypted/<n>/ path.
 *
 * orchestrator (deriving --results-path centrally for every stage) and
 * epoch (reading a run's report file after the fact, via the same swap)
 * used to each carry their own copy of this, which could silently drift
 * out of sync with no test to catch it.
 *
 * mvt_iocs's own Python resolve_results_path performs the same swap as a
 * documented fallback for manual/standalone invocation without
 * --results-path -- it stays independent here, not because it's meant to
 * diverge, but because there's no practical way to share code across the
 * Python/TypeScript boundary in this repo. Keep the two logically
 * equivalent if this ever changes.
 */
export function deriveResultsPath(backupSource: string): string | undefined {
  const parts = backupSource.split(path.sep);
  const idx = parts.indexOf('decrypted');
  if (idx === -1) return undefined;
  parts[idx] = 'results';
  return parts.join(path.sep);
}
 