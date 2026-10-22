// scripts/export-waitlist.js
// Exports waitlist members as a safe CSV.
//   npm run export > waitlist.csv

import path from 'node:path';
import dotenv from 'dotenv';
import { buildConfig, ROOT } from '../server/config.js';
import { openDb } from '../server/db.js';
import { csvCell } from '../server/security.js';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: path.join(ROOT, '.env'), quiet: true });
}

let config;
try {
  config = buildConfig(process.env);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const db = openDb(config.databasePath);
try {
  const rows = db.listForExport();
  const lines = ['joined_at,name,email,business', ...rows.map((r) => [r.joinedAt, r.name, r.email, r.business].map(csvCell).join(','))];
  process.stdout.write('\uFEFF' + lines.join('\r\n') + '\r\n');
} finally {
  db.close();
}
