// Tests for the backup script.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { openDb } from '../server/db.js';
import { backup } from '../scripts/backup.js';

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cerium-backup-'));
  const databasePath = path.join(dir, 'cerium.db');
  const db = openDb(databasePath);
  db.joinWaitlist({ sub: 's1', email: 'one@example.com', name: 'One', termsVersion: 't' });
  return { dir, databasePath, db, backups: path.join(dir, 'backups') };
}

describe('backup', () => {
  it('makes a readable copy that holds the waitlist, with private permissions', async () => {
    const { dir, databasePath, db, backups } = setup();
    try {
      const { target } = await backup({ databasePath, dir: backups });
      const copy = new Database(target, { readonly: true });
      assert.equal(copy.prepare('SELECT email FROM waitlist').get().email, 'one@example.com');
      copy.close();
      if (process.platform !== 'win32') assert.equal(fs.statSync(target).mode & 0o777, 0o600);
    } finally { db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('removes copies older than the limit, and only its own files', async () => {
    const { dir, databasePath, db, backups } = setup();
    try {
      fs.mkdirSync(backups, { recursive: true });
      const old = path.join(backups, 'cerium-old.db');
      const recent = path.join(backups, 'cerium-recent.db');
      const other = path.join(backups, 'notes.txt');
      for (const f of [old, recent, other]) fs.writeFileSync(f, 'x');
      const longAgo = new Date(Date.now() - 31 * 24 * 3600 * 1000);
      fs.utimesSync(old, longAgo, longAgo);
      fs.utimesSync(other, longAgo, longAgo);
      const { removed } = await backup({ databasePath, dir: backups, keepDays: 30 });
      assert.deepEqual(removed, ['cerium-old.db']);
      assert.ok(fs.existsSync(recent));
      assert.ok(fs.existsSync(other), 'files that are not ours are never touched');
    } finally { db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('will not keep copies longer than the 30 days the privacy page promises', async () => {
    const { dir, databasePath, db, backups } = setup();
    try {
      await assert.rejects(backup({ databasePath, dir: backups, keepDays: 31 }), /1 to 30/);
      await assert.rejects(backup({ databasePath, dir: backups, keepDays: 0 }), /1 to 30/);
      await assert.rejects(backup({ databasePath: path.join(dir, 'missing.db'), dir: backups }), /No database/);
      await assert.rejects(backup({ databasePath: ':memory:', dir: backups }), /no database file/i);
    } finally { db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
  });
});
