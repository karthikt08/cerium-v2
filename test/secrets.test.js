// Tests for the script that looks for secret keys in the project files.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from '../server/config.js';

function scan(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cerium-secrets-'));
  try {
    for (const [name, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
      fs.writeFileSync(path.join(dir, name), text);
    }
    return spawnSync(process.execPath, ['scripts/check-secrets.js', dir], { cwd: ROOT, encoding: 'utf8' });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// The fake keys are built here, piece by piece, so this file does not contain a real-looking key.
const FAKES = {
  'Google client secret': 'GOCSPX-' + 'a1B2c3D4'.repeat(4),
  'Google API key': 'AIza' + 'Sy'.repeat(17) + 'x',
  'Stripe secret key': 'sk_' + 'live_' + '4eC39HqLyjWDarjtT1zdp7dc',
  'Private key': '-----BEGIN ' + 'PRIVATE KEY-----',
  'Google client id (real)': '123456789012-' + 'abcdefghij0123456789'.repeat(1) + 'k.apps.googleusercontent.com',
};

describe('secret scanner', () => {
  for (const [label, fake] of Object.entries(FAKES)) {
    it(`finds a ${label}`, () => {
      const r = scan({ 'page.html': `<script>var k="${fake}"</script>` });
      assert.equal(r.status, 1, r.stdout + r.stderr);
      assert.match(r.stderr, new RegExp(label.replace(/[()]/g, '\\$&')));
      assert.match(r.stderr, /page\.html/);
    });
  }

  it('finds a secret set in a file that is not .env', () => {
    const r = scan({ 'notes.txt': 'SESSION_SECRET=' + 'q9Zr7LmN2xV8bK4tH6wP' + 'sD3fG1' });
    assert.equal(r.status, 1);
  });

  it('is fine with clean files and with the example settings', () => {
    const r = scan({ 'index.html': '<p>hello</p>', '.env.example': 'SESSION_SECRET=change-me\nGOOGLE_CLIENT_SECRET=paste-your-client-secret-here\n' });
    assert.equal(r.status, 0, r.stderr);
  });

  it('lets the private .env file hold secrets (git ignores it)', () => {
    const r = scan({ '.env': 'SESSION_SECRET=' + 'q9Zr7LmN2xV8bK4tH6wP' + 'sD3fG1\n' });
    assert.equal(r.status, 0, r.stderr);
  });

  it('finds nothing in this project', () => {
    const r = spawnSync(process.execPath, ['scripts/check-secrets.js'], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
  });
});
