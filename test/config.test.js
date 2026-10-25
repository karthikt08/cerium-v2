// Tests for the settings checker. Production must refuse weak or missing settings.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildConfig, ConfigError, ROOT } from '../server/config.js';
import { GOOD_SECRET, FAKE_CLIENT_ID, FAKE_CLIENT_SECRET } from './helpers.js';

const PROD = {
  NODE_ENV: 'production',
  GEOIP_API_KEY: 'region-testing-key-123456',
  BASE_URL: 'https://cerium.test',
  GOOGLE_CLIENT_ID: FAKE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: FAKE_CLIENT_SECRET,
  SESSION_SECRET: GOOD_SECRET,
  DATABASE_PATH: '/data/cerium.db',
  TRUST_PROXY: '1',
};

function problemsOf(env) {
  try {
    buildConfig(env);
    return [];
  } catch (err) {
    assert.ok(err instanceof ConfigError, 'must be a ConfigError');
    return err.problems;
  }
}

// Reads the example file the same way a person would use it.
function readEnvFile(file) {
  const env = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

describe('production settings', () => {
  it('never allows a normal local run to disable mandatory setup',()=>{
    assert.throws(()=>buildConfig({WORKSPACE_ACCESS_MODE:'off'}),/reserved for automated tests/);
    assert.equal(buildConfig({NODE_ENV:'test',WORKSPACE_ACCESS_MODE:'off'}).workspaceAccessMode,'off');
  });
  it('accepts a complete, strong setup', () => {
    const c = buildConfig(PROD);
    assert.equal(c.mode, 'production');
    assert.equal(c.workspaceAccessMode,'phone_and_mandate');
    assert.equal(c.baseUrl, 'https://cerium.test');
    assert.equal(c.cookieSecure, true);
    assert.equal(c.sessionCookie, '__Host-cerium_sid');
    assert.equal(c.host, '0.0.0.0');
    assert.equal(c.trustProxy, 1);
    assert.deepEqual([...c.adminEmails], []);
    assert.ok(Object.isFrozen(c), 'settings cannot be changed while running');
  });

  for (const key of ['BASE_URL', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'SESSION_SECRET', 'DATABASE_PATH', 'TRUST_PROXY']) {
    it(`refuses to start without ${key}`, () => {
      const env = { ...PROD };
      delete env[key];
      const problems = problemsOf(env);
      assert.ok(problems.length > 0, `${key} missing must be a problem`);
      assert.ok(problems.some((p) => p.includes(key) || (key.startsWith('GOOGLE') && p.includes('GOOGLE_CLIENT'))), problems.join(' | '));
    });
  }

  const BAD = [
    ['BASE_URL is plain http', { BASE_URL: 'http://cerium.test' }, /https/],
    ['BASE_URL is localhost', { BASE_URL: 'https://localhost' }, /localhost/],
    ['BASE_URL has a path', { BASE_URL: 'https://cerium.test/app' }, /BASE_URL/],
    ['SESSION_SECRET is short', { SESSION_SECRET: 'short-secret' }, /SESSION_SECRET/],
    ['SESSION_SECRET is the example text', { SESSION_SECRET: 'change-me-change-me-change-me-change-me' }, /SESSION_SECRET/],
    ['TRUST_PROXY is "true"', { TRUST_PROXY: 'true' }, /TRUST_PROXY/],
    ['TRUST_PROXY is negative', { TRUST_PROXY: '-1' }, /TRUST_PROXY/],
    ['DATABASE_PATH is relative', { DATABASE_PATH: 'data/cerium.db' }, /DATABASE_PATH/],
    ['DATABASE_PATH is memory', { DATABASE_PATH: ':memory:' }, /DATABASE_PATH/],
    ['Google id is the example text', { GOOGLE_CLIENT_ID: 'paste-your-client-id-here.apps.googleusercontent.com' }, /GOOGLE_CLIENT/],
    ['Google id has the wrong ending', { GOOGLE_CLIENT_ID: 'abc123' }, /GOOGLE_CLIENT/],
    ['Google secret is the example text', { GOOGLE_CLIENT_SECRET: 'paste-your-client-secret-here' }, /GOOGLE_CLIENT/],
    ['ADMIN_EMAILS has a bad address', { ADMIN_EMAILS: 'owner@cerium.test, not-an-email' }, /ADMIN_EMAILS/],
    ['PORT is not a number', { PORT: 'abc' }, /PORT/],
    ['SESSION_DAYS is too big', { SESSION_DAYS: '365' }, /SESSION_DAYS/],
  ];
  for (const [name, change, pattern] of BAD) {
    it(`refuses when ${name}`, () => {
      const problems = problemsOf({ ...PROD, ...change });
      assert.ok(problems.some((p) => pattern.test(p)), `expected a problem matching ${pattern}, got: ${problems.join(' | ')}`);
    });
  }

  it('lists every problem at once, so they can be fixed in one go', () => {
    const problems = problemsOf({ NODE_ENV: 'production' });
    assert.ok(problems.length >= 5, problems.join(' | '));
  });

  it('refuses the untouched .env.example', () => {
    const example = readEnvFile(path.join(ROOT, '.env.example'));
    const problems = problemsOf({ ...example, NODE_ENV: 'production' });
    assert.ok(problems.some((p) => /SESSION_SECRET/.test(p)));
    assert.ok(problems.some((p) => /GOOGLE_CLIENT/.test(p)));
    assert.ok(problems.some((p) => /https/.test(p)));
  });
});

describe('development settings', () => {
  it('lets a beginner start with the untouched .env.example, with warnings', () => {
    const example = readEnvFile(path.join(ROOT, '.env.example'));
    const c = buildConfig({ ...example, NODE_ENV: 'development' });
    assert.equal(c.googleConfigured, false);
    assert.ok(c.warnings.some((w) => /GOOGLE_CLIENT/.test(w)));
    assert.ok(c.warnings.some((w) => /SESSION_SECRET/.test(w)));
  });

  it('has safe defaults on a personal computer', () => {
    const c = buildConfig({});
    assert.equal(c.mode, 'development');
    assert.equal(c.baseUrl, 'http://localhost:3000');
    assert.equal(c.host, '127.0.0.1', 'only this computer can reach the server');
    assert.equal(c.sessionCookie, 'cerium_sid');
    assert.equal(c.trustProxy, 0);
    assert.equal(c.cookieSecure, false);
  });

  it('makes a different temporary secret each time when none is given', () => {
    assert.notEqual(buildConfig({}).sessionSecret, buildConfig({}).sessionSecret);
  });

  it('follows PORT for the default address', () => {
    assert.equal(buildConfig({ PORT: '4100' }).baseUrl, 'http://localhost:4100');
  });

  it('turns admin emails into lower case', () => {
    assert.deepEqual([...buildConfig({ ADMIN_EMAILS: ' Me@Example.com ,You@Example.com' }).adminEmails], ['me@example.com', 'you@example.com']);
  });

  it('knows when Google keys are real-looking', () => {
    const c = buildConfig({ GOOGLE_CLIENT_ID: FAKE_CLIENT_ID, GOOGLE_CLIENT_SECRET: FAKE_CLIENT_SECRET });
    assert.equal(c.googleConfigured, true);
  });
});

describe('paid-trial entry security policy',()=>{
  it('requires verified payment method authorization in production',()=>{
    for(const mode of ['phone','off']){
      const issues=problemsOf({...PROD,WORKSPACE_ACCESS_MODE:mode});
      assert.ok(issues.some(s=>/phone_and_mandate/.test(s)),issues.join(' | '));
    }
  });
  it('still supports SMS-only localhost demos explicitly',()=>{
    const config=buildConfig({WORKSPACE_ACCESS_MODE:'phone'});
    assert.equal(config.workspaceAccessMode,'phone');
  });
});
