// Guards for the project settings that keep production safe.
// If one of these fails, someone removed a safety setting.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../server/config.js';

const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const pkg = JSON.parse(read('package.json'));

describe('project safety settings', () => {
  it('git ignores private files', () => {
    const ignore = read('.gitignore').split('\n').map((l) => l.trim());
    for (const entry of ['.env', '.env.*', '!.env.example', 'data/', '*.db', 'node_modules/']) {
      assert.ok(ignore.includes(entry), `.gitignore must contain ${entry}`);
    }
  });

  it('npm never runs install scripts, and refuses an old Node', () => {
    const npmrc = read('.npmrc');
    assert.match(npmrc, /^ignore-scripts=true$/m);
    assert.match(npmrc, /^engine-strict=true$/m);
    assert.match(pkg.engines.node, />=22/);
  });

  it('has no install-time scripts of its own', () => {
    for (const name of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish']) {
      assert.equal(pkg.scripts[name], undefined, `${name} script`);
    }
  });

  it('pins every dependency to one exact version, with a lockfile', () => {
    assert.ok(fs.existsSync(path.join(ROOT, 'package-lock.json')));
    for (const [name, version] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })) {
      assert.match(version, /^\d+\.\d+\.\d+$/, `${name} is "${version}", not an exact version`);
    }
  });

  it('keeps the server code out of the public folder, and the public folder free of server files', () => {
    const publicFiles = fs.readdirSync(path.join(ROOT, 'public'), { recursive: true });
    for (const f of publicFiles) {
      assert.doesNotMatch(String(f), /\.(env|db|sqlite|md|json|log|map)$/i, `public/${f}`);
    }
  });

  it('.env.example holds only example text, and lists every setting the server reads', () => {
    const example = read('.env.example');
    const config = read('server/config.js');
    const used = [...config.matchAll(/get\('([A-Z_]+)'\)/g)].map((m) => m[1]);
    assert.ok(used.length >= 8, used.join(','));
    for (const name of used) assert.match(example, new RegExp(`${name}=`), `${name} is missing from .env.example`);
    assert.match(example, /^SESSION_SECRET=change-me$/m);
    assert.match(example, /^GOOGLE_CLIENT_SECRET=paste-/m);
  });

  it('the setup guide mentions every npm command', () => {
    const setup = read('SETUP.md') + read('README.md');
    for (const name of Object.keys(pkg.scripts)) {
      if (name === 'dev') continue;
      assert.ok(setup.includes(name), `docs do not mention "${name}"`);
    }
  });
});
