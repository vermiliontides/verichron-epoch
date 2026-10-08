import * as path from 'node:path';

/** <workspace>/decrypted/<label> -> <workspace>/<dir>/<label>, or undefined if not under decrypted/. */
function siblingOfDecrypted(backupSource: string, dir: string): string | undefined {
  const parts = backupSource.split(path.sep);
  const idx = parts.indexOf('decrypted');
  if (idx === -1) return undefined;
  parts[idx] = dir;
  return parts.join(path.sep);
}

/** Where the processor writes mvt-ios's check-backup results for a decrypt. */
export function deriveResultsPath(backupSource: string): string | undefined {
  return siblingOfDecrypted(backupSource, 'results');
}

/** Where the processor writes iLEAPP's output for a decrypt (EPOCH-416). */
export function deriveIleappPath(backupSource: string): string | undefined {
  return siblingOfDecrypted(backupSource, 'ileapp');
}
