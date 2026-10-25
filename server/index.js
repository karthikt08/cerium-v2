// server/index.js
// Starts the Cerium unified application server. Run with: npm start

import path from 'node:path';
import dotenv from 'dotenv';
import { buildConfig, ConfigError, ROOT } from './config.js';
import { openDb } from './db.js';
import { createGoogle } from './google.js';
import { makeRazorpay } from './razorpay.js';
import { createApp } from './app.js';
import { makeSmtpSender } from './reminder-worker.js';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: path.join(ROOT, '.env'), quiet: true });
}

let config;
try {
  config = buildConfig(process.env);
} catch (err) {
  if (err instanceof ConfigError) {
    console.error('\nCerium cannot start.\n\n' + err.message + '\n\nSee SETUP.md.\n');
    process.exit(1);
  }
  throw err;
}
for (const w of config.warnings) console.warn('Warning: ' + w);

const db = openDb(config.databasePath);
const google = config.googleConfigured ? createGoogle(config) : null;
const razorpay = config.razorpayConfigured ? makeRazorpay(config) : null;
const accountEmailSender = makeSmtpSender(process.env);
const app = createApp({ config, db, google, razorpay, accountEmailSender });

const server = app.listen(config.port, config.host, () => {
  console.log(`\n========================================================`);
  console.log(`  CERIUM UNIFIED WEB PRODUCT (${config.mode.toUpperCase()})`);
  console.log(`  Website & Workspace: ${config.baseUrl}`);
  console.log(`  Health Check:        ${config.baseUrl}/healthz`);
  console.log(`========================================================\n`);
});

// Purge expired sessions once per hour
const cleaner = setInterval(() => db.purgeExpiredSessions(), 60 * 60 * 1000);
cleaner.unref();

function stop() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
