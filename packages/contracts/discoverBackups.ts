import fsp from 'fs/promises';
import path from 'path';

// A discovered backup: `label` is the friendly top-level directory name
// under `source` (used for workspace organization), `path` is the actual
// directory containing Manifest.db / Info.plist (what gets passed to
// mvt-ios). These are the same directory in the simple case, but idevice-
// backup2 output is commonly one level deeper: <source>/<label>/<UDID>/Manifest.db
//
// Shared between apps/mvt-runner (CLI --only filtering) and apps/epoch
// (the workspace picker UI needs the same discovered set, not a
// reimplementation, so Stage 1's backup list and the CLI's actual
// processing set never drift apart).
export interface Backup {
  label: string;
  path: string;
}

export const BACKUP_SEARCH_MAX_DEPTH = 3;

// discoverBackups treats each immediate subdirectory of `source` as one
// logical backup ("label"), then searches within it (up to a bounded depth)
// for the actual directory containing Manifest.db / Info.plist, since
// idevicebackup2 nests the real backup root under a UDID-named folder.
export async function discoverBackups(source: string, only?: string): Promise<Backup[]> {
  let wanted: Set<string> | null = null;
  if (only !== undefined && only !== '') {
    wanted = new Set(only.split(',').map((n) => n.trim()));
  }

  const topEntries = await fsp.readdir(source, { withFileTypes: true });

  const found: Backup[] = [];
  for (const e of topEntries) {
    if (!e.isDirectory()) continue;
    if (wanted !== null && !wanted.has(e.name)) continue;

    const topPath = path.join(source, e.name);
    const roots = await findBackupRoots(topPath, BACKUP_SEARCH_MAX_DEPTH);

    if (roots.length === 0) continue;
    for (const root of roots) {
      // Multiple backup roots under one label is unusual but possible
      // (e.g. two UDID dirs nested under one date folder) - disambiguate.
      const label = roots.length > 1 ? `${e.name}__${path.basename(root)}` : e.name;
      found.push({ label, path: root });
    }
  }

  found.sort((a, b) => a.label.localeCompare(b.label));
  return found;
}

// findBackupRoots recursively searches for directories that look like an
// idevicebackup2 backup root, stopping as soon as a match is found along
// each branch (it does not descend into the 00-ff hashed content
// directories once Manifest.db has already been located higher up).
async function findBackupRoots(dir: string, remainingDepth: number): Promise<string[]> {
  if (await isBackupRoot(dir)) {
    return [dir];
  }
  if (remainingDepth <= 0) return [];

  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const results: string[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const sub = path.join(dir, e.name);
    results.push(...(await findBackupRoots(sub, remainingDepth - 1)));
  }
  return results;
}

async function isBackupRoot(dir: string): Promise<boolean> {
  return (await pathExists(path.join(dir, 'Manifest.db'))) || (await pathExists(path.join(dir, 'Info.plist')));
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
}
