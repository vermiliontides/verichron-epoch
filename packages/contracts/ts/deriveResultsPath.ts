import * as path from 'node:path';

export function deriveResultsPath(backupSource: string): string | undefined {
  const parts = backupSource.split(path.sep);
  const idx = parts.indexOf('decrypted');
  if (idx === -1) return undefined;
  parts[idx] = 'results';
  return parts.join(path.sep);
}