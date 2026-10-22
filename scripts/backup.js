// scripts/backup.js
// Makes a safe copy of the SQLite database and removes copies older than keepDays.
//   npm run backup

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import Database from 'better-sqlite3';
import { buildConfig, ROOT } from '../server/config.js';

export async function backup({ databasePath, dir, keepDays = 30, now = new Date() }) {
  if (databasePath === ':memory:') throw new Error('There is no database file to copy.');
  if (!fs.existsSync(databasePath)) throw new Error(`No database found at ${databasePath}`);
  if (!Number.isInteger(keepDays) || keepDays < 1 || keepDays > 30) {
    throw new Error('BACKUP_KEEP_DAYS must be a whole number from 1 to 30. (The privacy policy promises 30 days at most.)');
  }

  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const target = path.join(dir, `cerium-${stamp}.db`);

  const db = new Database(databasePath, { readonly: true });
  try {
    await db.backup(target);
  } finally {
    db.close();
  }
  try { fs.chmodSync(target, 0o600); } catch { /* Windows ignore */ }

  const cutoff = now.getTime() - keepDays * 24 * 60 * 60 * 1000;
  const removed = [];
  for (const name of fs.readdirSync(dir)) {
    if (!/^cerium-.*\.db$/.test(name)) continue;
    const file = path.join(dir, name);
    if (file !== target && fs.statSync(file).mtimeMs < cutoff) {
      fs.rmSync(file);
      removed.push(name);
    }
  }
  return { target, removed };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.env.NODE_ENV !== 'production') dotenv.config({ path: path.join(ROOT, '.env'), quiet: true });
  let config;
  try {
    config = buildConfig(process.env);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  const dir = process.env.BACKUP_DIR || path.join(path.dirname(config.databasePath), 'backups');
  const keepDays = process.env.BACKUP_KEEP_DAYS ? Number(process.env.BACKUP_KEEP_DAYS) : 30;
  backup({ databasePath: config.databasePath, dir, keepDays })
    .then(({ target, removed }) => {
      console.log(`Backup saved: ${target}`);
      if (removed.length) console.log(`Removed ${removed.length} old backup(s).`);
    })
    .catch((err) => {
      console.error('Backup failed:', err.message);
      process.exit(1);
    });
}
