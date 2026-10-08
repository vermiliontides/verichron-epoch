/**
 * EPOCH-406: a decrypt's repair provenance must account for every original it
 * preserved, even when a step after the copy fails. Uses a stub sqlite3 that
 * reports every database as malformed and "recovers" it.
 */

import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { after, before, describe, it } from 'node:test';

import type { Config } from './cli.js';
import { repairDecrypted } from './repair.js';

let tmp: string;
let sqlite: string;

before(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'repair-'));
  // -version              -> a version line
  // <db> "PRAGMA ..."     -> "not ok" (every database is malformed)
  // <db> .recover         -> some SQL
  // <new db>  (SQL stdin) -> creates <new db>
  sqlite = path.join(tmp, 'sqlite3-stub');
  writeFileSync(
    sqlite,
    `#!/bin/sh
if [ "$1" = -version ]; then echo "3.99.0 2026-10-08 stub"; exit 0; fi
case "$2" in
  "PRAGMA quick_check;") echo "not ok" ;;
  .recover) echo "CREATE TABLE t(x);" ;;
  "") cat > /dev/null; touch "$1" ;;
esac
exit 0
`
  );
  chmodSync(sqlite, 0o755);
});

after(() => rmSync(tmp, { recursive: true, force: true }));

function sqliteFile(file: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, Buffer.concat([Buffer.from('SQLite format 3\0', 'ascii'), Buffer.alloc(84)]));
}

describe('repair provenance', () => {
  it('records an original preserved before a later step failed', async () => {
    const decDir = path.join(tmp, 'decrypted');
    const db = path.join(decDir, 'HomeDomain', 'sms.db');
    sqliteFile(db);
    // Removing a stale "-wal" fails when it is a directory: the step after
    // the copy and the rename throws, as a real cleanup failure would.
    mkdirSync(`${db}-wal`);
    writeFileSync(path.join(`${db}-wal`, 'keep'), '');

    const repair = await repairDecrypted({ sqliteBin: sqlite } as Config, decDir);

    assert.equal(repair.status, 'ran');
    if (repair.status !== 'ran') return;
    assert.deepEqual(repair.tool, { name: 'sqlite3', version: '3.99.0' });
    assert.deepEqual(repair.failed_files, ['HomeDomain/sms.db'], 'the failure is recorded');
    assert.equal(repair.preserved_originals.length, 1, 'and so is the original it had already preserved');
    assert.match(repair.preserved_originals[0], /^HomeDomain\/sms\.db\.corrupt-/);
    assert.ok(existsSync(path.join(decDir, repair.preserved_originals[0])));
  });
});
