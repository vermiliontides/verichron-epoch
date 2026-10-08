import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { after, describe, it } from 'node:test';

import { ileappInputType } from './ileapp.js';

const tmp = mkdtempSync(path.join(os.tmpdir(), 'ileapp-input-'));
after(() => rmSync(tmp, { recursive: true, force: true }));

function backup(name: string, files: string[]): string {
  const dir = path.join(tmp, name);
  for (const file of files) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), '');
  }
  return dir;
}

describe('ileappInputType (EPOCH-416)', () => {
  it('reads a decrypt with a top-level Manifest.db as an iTunes backup', () => {
    assert.equal(ileappInputType(backup('itunes', ['Manifest.db', 'Info.plist'])), 'itunes');
  });

  it('reads a folder with only Info.plist as a file system extraction', () => {
    assert.equal(ileappInputType(backup('fs', ['Info.plist'])), 'fs');
  });

  it('does not search below the top level', () => {
    const nested = backup('nested', ['private/var/mobile/Manifest.db', 'Library/Info.plist']);
    assert.throws(() => ileappInputType(nested), /no Manifest\.db or Info\.plist at its top level/);
  });
});
