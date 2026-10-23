// Shared tools for the tests. Nothing here talks to the real Google.

import net from 'node:net';
import { randomBytes } from 'node:crypto';
import { buildConfig } from '../server/config.js';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { createGoogle, pkceChallenge } from '../server/google.js';

export const GOOD_SECRET = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0';
// Fake Google keys. They are short on purpose, so the secret scanner does not think they are real.
export const FAKE_CLIENT_ID = 'test-123456789.apps.googleusercontent.com';
export const FAKE_CLIENT_SECRET = 'GOCSPX-fake-for-tests';

async function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

// A pretend Google client. It plays the part of google-auth-library.
// The real code in server/google.js still runs on top of it.
export function fakeOAuthClient(config) {
  const codes = new Map(); // code -> { payload, challenge }   (a code works once, like at Google)
  const tokens = new Map(); // id_token -> payload
  const ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];
  return {
    codes,
    exchanges: [],
    async getToken({ code, codeVerifier }) {
      this.exchanges.push({ code, codeVerifier });
      const entry = codes.get(code);
      if (!entry) throw new Error('invalid_grant');
      // Google checks the PKCE verifier against the challenge from step 1.
      if (!codeVerifier || pkceChallenge(codeVerifier) !== entry.challenge) throw new Error('invalid_grant');
      codes.delete(code);
      tokens.set(code, entry.payload);
      return { tokens: { id_token: code } };
    },
    async verifyIdToken({ idToken, audience }) {
      const payload = tokens.get(idToken);
      if (!payload) throw new Error('Invalid token signature');
      if (payload.aud !== audience) throw new Error('Wrong recipient, payload audience != requiredAudience');
      if (!ISSUERS.includes(payload.iss)) throw new Error('Invalid issuer');
      if (payload.exp && payload.exp * 1000 < Date.now()) throw new Error('Token used too late');
      return { getPayload: () => payload };
    },
  };
}

export async function startServer({ env = {}, limits, db: givenDb, regionLookup } = {}) {
  const port = await freePort();
  const config = buildConfig({
    NODE_ENV: 'test',
    PORT: String(port),
    BASE_URL: `http://127.0.0.1:${port}`,
    DATABASE_PATH: ':memory:',
    SESSION_SECRET: GOOD_SECRET,
    GOOGLE_CLIENT_ID: FAKE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: FAKE_CLIENT_SECRET,
    ...env,
  });
  const db = givenDb || openDb(config.databasePath);
  const oauth = fakeOAuthClient(config);
  const google = createGoogle(config, oauth);
  // Big limits by default, so that many test sign-ins are not slowed down.
  // The tests about rate limits give small limits on purpose.
  const BIG = { windowMs: 60_000, limit: 100_000 };
  const app = createApp({ config, db, google, regionLookup, limits: { global: BIG, auth: BIG, write: BIG, ...limits }, log: false });
  const server = await new Promise((resolve) => {
    const s = app.listen(port, '127.0.0.1', () => resolve(s));
  });

  const base = config.baseUrl; // what the server believes its public address is
  const url = `http://127.0.0.1:${port}`; // where the test really connects
  const t = {
    config, db, oauth, base, url, port,
    async close() {
      await new Promise((r) => server.close(r));
      db.close();
    },
    // Makes a fetch with a cookie jar and the Origin header a browser would send.
    browser() {
      return makeBrowser({ url, origin: base });
    },
  };
  t.google = google;
  t.nextProfile = null;
  return t;
}

export function makeBrowser({ url, origin: siteOrigin }) {
  const jar = new Map();
  const b = {
    jar,
    cookie(name) { return jar.get(name); },
    cookieHeader() { return [...jar].map(([k, v]) => `${k}=${v}`).join('; '); },
    async req(path, { method = 'GET', headers = {}, body, origin = siteOrigin, form, json, csrf } = {}) {
      const h = { ...headers };
      if (jar.size) h.cookie = b.cookieHeader();
      if (origin && method !== 'GET') h.origin = origin;
      if (csrf) h['x-csrf-token'] = csrf;
      let payload = body;
      if (form) { h['content-type'] = 'application/x-www-form-urlencoded'; payload = new URLSearchParams(form).toString(); }
      if (json !== undefined) { h['content-type'] = 'application/json'; payload = JSON.stringify(json); }
      const res = await fetch(url + path, { method, headers: h, body: payload, redirect: 'manual' });
      for (const line of res.headers.getSetCookie()) {
        const [pair] = line.split(';');
        const eq = pair.indexOf('=');
        const name = pair.slice(0, eq);
        const value = pair.slice(eq + 1);
        if (/;\s*Max-Age=0/i.test(line) || /Expires=Thu, 01 Jan 1970/i.test(line) || value === '') jar.delete(name);
        else jar.set(name, value);
      }
      return res;
    },
    async me() {
      const r = await b.req('/api/me');
      return r.json();
    },
  };
  return b;
}

// Walks through the whole sign-in with the pretend Google.
//   profile: what Google says about the person
//   tweak:   a function to change the ID token payload (to test bad tokens)
export async function signIn(t, browser, { intent = 'login', business = '', profile, tweak, callbackExtra = '', returnTo = '' } = {}) {
  const start = await browser.req('/auth/google', { method: 'POST', form: { intent, business, returnTo } });
  if (start.status !== 303) throw new Error('start gave ' + start.status);
  const google = new URL(start.headers.get('location'));
  const state = google.searchParams.get('state');
  const nonce = google.searchParams.get('nonce');

  const code = 'code-' + randomBytes(6).toString('hex');
  const payload = {
    iss: 'https://accounts.google.com',
    aud: t.config.googleClientId,
    sub: profile.sub,
    email: profile.email,
    email_verified: profile.email_verified ?? true,
    name: profile.name,
    picture: 'https://example.invalid/photo.png',
    nonce,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  t.oauth.codes.set(code, { payload: tweak ? tweak(payload) : payload, challenge: google.searchParams.get('code_challenge') });

  const cb = await browser.req(`/auth/google/callback?code=${code}&state=${encodeURIComponent(state)}${callbackExtra}`);
  return { start, google, cb, code, state, nonce };
}

export const ALICE = { sub: 'g-alice-1', email: 'alice@example.com', name: 'Alice Rivera' };
export const BOB = { sub: 'g-bob-2', email: 'bob@example.com', name: 'Bob Okafor' };
export const CAROL = { sub: 'g-carol-3', email: 'carol@example.com', name: 'Carol Lindqvist' };
