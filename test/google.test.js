// Tests the REAL Google library (google-auth-library) with tokens we sign ourselves.
// Nothing here uses the internet. We play Google: we make a key, sign tokens,
// and hand the matching public key to the library.

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign as rsaSign } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { buildConfig } from '../server/config.js';
import { createGoogle, SignInError } from '../server/google.js';
import { FAKE_CLIENT_ID, FAKE_CLIENT_SECRET } from './helpers.js';

const config = buildConfig({ GOOGLE_CLIENT_ID: FAKE_CLIENT_ID, GOOGLE_CLIENT_SECRET: FAKE_CLIENT_SECRET });
const NONCE = 'nonce-from-the-sign-in-start';

const good = generateKeyPairSync('rsa', { modulusLength: 2048 });
const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicPem = good.publicKey.export({ type: 'spki', format: 'pem' });

const b64 = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');
function makeJwt(payload, { key = good.privateKey, kid = 'k1', signature = true } = {}) {
  const head = b64({ alg: 'RS256', typ: 'JWT', kid });
  const body = b64(payload);
  const sig = signature ? rsaSign('RSA-SHA256', Buffer.from(`${head}.${body}`), key).toString('base64url') : '';
  return `${head}.${body}.${sig}`;
}

// The real OAuth2Client, except: it does not call Google over the internet.
class OfflineClient extends OAuth2Client {
  nextToken = null;
  async getFederatedSignonCertsAsync() { return { certs: { k1: publicPem }, format: 'PEM' }; }
  async getToken() { return { tokens: { id_token: this.nextToken } }; }
}

function payload(extra = {}) {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: 'https://accounts.google.com', aud: FAKE_CLIENT_ID, sub: '1234567890',
    email: 'Person@Example.com', email_verified: true, name: 'Person Example',
    nonce: NONCE, iat: now, exp: now + 3600, ...extra,
  };
}

async function attempt(token, nonce = NONCE) {
  const client = new OfflineClient({ clientId: FAKE_CLIENT_ID, clientSecret: FAKE_CLIENT_SECRET, redirectUri: 'http://localhost:3000/auth/google/callback' });
  client.nextToken = token;
  const google = createGoogle(config, client);
  try {
    return { ok: await google.verifyCode({ code: 'c', codeVerifier: 'v'.repeat(43), nonce }) };
  } catch (err) {
    assert.ok(err instanceof SignInError, 'only SignInError may come out: ' + err);
    return { error: err };
  }
}

describe('the real Google library with our own signed tokens', () => {
  it('accepts a good token and cleans the profile', async () => {
    const r = await attempt(makeJwt(payload({ name: '  Per\u0000son \n Example  ' })));
    assert.deepEqual(r.ok, { sub: '1234567890', email: 'person@example.com', name: 'Per son Example' });
  });

  it('accepts the other issuer spelling Google uses', async () => {
    const r = await attempt(makeJwt(payload({ iss: 'accounts.google.com' })));
    assert.ok(r.ok);
  });

  it('uses the email name when Google sends no name', async () => {
    const p = payload(); delete p.name;
    assert.equal((await attempt(makeJwt(p))).ok.name, 'person');
  });

  const REJECT = [
    ['made for another app (audience)', () => makeJwt(payload({ aud: 'someone-else.apps.googleusercontent.com' }))],
    ['from another issuer', () => makeJwt(payload({ iss: 'https://evil.example' }))],
    ['expired', () => makeJwt(payload({ iat: Math.floor(Date.now() / 1000) - 7200, exp: Math.floor(Date.now() / 1000) - 3600 }))],
    ['signed with a different key', () => makeJwt(payload(), { key: other.privateKey })],
    ['with a key id Google does not have', () => makeJwt(payload(), { kid: 'unknown' })],
    ['with no signature', () => makeJwt(payload(), { signature: false })],
    ['that is not a token at all', () => 'not-a-token'],
    ['missing', () => null],
    ['changed after signing', () => {
      const [h, , s] = makeJwt(payload()).split('.');
      return `${h}.${b64(payload({ email: 'admin@example.com' }))}.${s}`;
    }],
    ['with no subject', () => { const p = payload(); delete p.sub; return makeJwt(p); }],
    ['with no email', () => { const p = payload(); delete p.email; return makeJwt(p); }],
  ];
  for (const [name, make] of REJECT) {
    it(`rejects a token ${name}`, async () => {
      const r = await attempt(make());
      assert.ok(r.error, 'must be rejected');
      assert.equal(r.error.code, 'failed');
    });
  }

  it('rejects a token with the wrong nonce', async () => {
    const r = await attempt(makeJwt(payload()), 'a-different-nonce');
    assert.equal(r.error.code, 'failed');
  });

  it('rejects an email that is not verified, with its own code', async () => {
    const r = await attempt(makeJwt(payload({ email_verified: false })));
    assert.equal(r.error.code, 'unverified');
  });

  it('rejects email_verified when it is the text "true" and not the real value', async () => {
    const r = await attempt(makeJwt(payload({ email_verified: 'true' })));
    assert.ok(r.error);
  });

  it('never puts the token in an error message (so it cannot reach the logs)', async () => {
    for (const [, make] of REJECT) {
      const token = make();
      const r = await attempt(token);
      assert.ok(r.error);
      const text = r.error.message + String(r.error.stack || '').split('\n')[0];
      assert.ok(!text.includes('eyJ'), 'a token-like text is in: ' + text);
      if (token) assert.ok(!text.includes(token.slice(0, 30)));
      assert.ok(!/person@example\.com|admin@example\.com/i.test(text));
    }
  });

  it('builds the Google address with only the data we need', () => {
    const google = createGoogle(config, new OfflineClient({ clientId: FAKE_CLIENT_ID, clientSecret: FAKE_CLIENT_SECRET }));
    const u = new URL(google.buildAuthUrl({ state: 's', nonce: 'n', codeChallenge: 'c' }));
    assert.equal(u.searchParams.get('scope'), 'openid email profile');
    assert.equal(u.searchParams.get('access_type'), 'online');
    assert.equal(u.searchParams.get('prompt'), 'select_account');
    assert.equal(u.searchParams.get('redirect_uri'), 'http://localhost:3000/auth/google/callback');
    assert.equal(u.searchParams.get('client_secret'), null, 'the secret never goes in the address');
    assert.ok(!u.toString().includes(FAKE_CLIENT_SECRET));
  });
});
