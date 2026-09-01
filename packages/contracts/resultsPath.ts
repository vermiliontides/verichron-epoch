import path from 'path';

/**
 * Mirrors apps/extractors/mvt_iocs/main.py's resolve_results_path fallback
 * exactly: <workspace>/decrypted/<name> -> <workspace>/results/<name>,
 * swapping the 'decrypted' path segment for 'results' -- mvt-runner's fixed
 * workspace layout (<workspace>/decrypted/<name> and
 * <workspace>/results/<name> are siblings), not a heuristic guessed
 * independently here.
 *
 * The Python original takes an explicit --results-path override and raises
 * when neither that nor a 'decrypted' segment is available, since a CLI
 * invocation missing both is a genuine user error worth failing loudly on.
 * This TypeScript version only implements the fallback derivation (no
 * override parameter) and returns undefined instead of throwing when it
 * can't derive one -- every current caller (apps/epoch's main.ts) is
 * UI-facing and wants to render a "no results path" state, not crash the
 * main process over a backup that was ingested before results/ existed.
 *
 * Uses the bare 'path' specifier, not 'node:path' -- matches every other
 * import in this monorepo (see apps/epoch/src/main.ts). The node: prefix
 * form tripped a resolution issue specific to this package's TS/@types
 * setup during development; bare 'path' sidesteps it and matches existing
 * convention regardless.
 */
export function deriveResultsPath(backupSource: string): string | undefined {
  const parts = backupSource.split(path.sep);
  const idx = parts.indexOf('decrypted');
  if (idx === -1) return undefined;
  parts[idx] = 'results';
  return parts.join(path.sep);
}
