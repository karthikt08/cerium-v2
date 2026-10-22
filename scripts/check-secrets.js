// scripts/check-secrets.js
// Scans project source files for exposed API keys, private keys, or secrets.
// Run with: npm run check:secrets

import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../server/config.js';

const TARGET = process.argv[2] ? path.resolve(process.argv[2]) : ROOT;

const SKIP_DIRS = new Set(['node_modules', '.git', 'data']);
const SKIP_FILES = new Set(['package-lock.json']);
const EXAMPLE_TEXT = /(paste|your-|change-?me|example|xxxx)/i;

const PATTERNS = [
  ['Google client secret', /GOCSPX-[A-Za-z0-9_-]{20,}/],
  ['Google API key', /AIza[0-9A-Za-z_-]{35}/],
  ['Stripe secret key', /\b(sk|rk)_(live|test)_[0-9A-Za-z]{10,}/],
  ['Razorpay live key', /rzp_live_[0-9A-Za-z]{14,}/],
  ['Private key', /-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----/],
  ['Google client id (real)', /\b\d{8,}-[a-z0-9]{20,}\.apps\.googleusercontent\.com\b/],
  ['A secret set to a real-looking value', /^\s*(SESSION_SECRET|GOOGLE_CLIENT_SECRET|RAZORPAY_KEY_SECRET)\s*=\s*[A-Za-z0-9_-]{20,}\s*$/m, true],
];

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* walk(path.join(dir, entry.name));
    } else if (!SKIP_FILES.has(entry.name)) {
      yield path.join(dir, entry.name);
    }
  }
}

let found = 0;
let checked = 0;
for (const file of walk(TARGET)) {
  const rel = path.relative(TARGET, file);
  if (rel === '.env') continue;
  if (rel === path.join('scripts', 'check-secrets.js')) continue;
  if (rel.startsWith('test' + path.sep)) continue; // Test mock values are in test fixtures
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  if (text.includes('\u0000')) continue;
  checked++;
  for (const [label, re, skipExamples] of PATTERNS) {
    const all = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    for (const m of text.matchAll(all)) {
      if (skipExamples && EXAMPLE_TEXT.test(m[0])) continue;
      console.error(`FOUND  ${label}  in  ${rel}`);
      found++;
      break;
    }
  }
}

if (found) {
  console.error(`\n${found} possible secret(s) found. Remove them, and change the key at its source.`);
  process.exit(1);
}
console.log(`No secrets found (${checked} files checked).`);
