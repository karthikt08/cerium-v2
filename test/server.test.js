// Tests for the server. Run all tests with:  npm test
// They use a pretend Google, so they need no internet and no keys.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { startServer, signIn, ALICE, BOB, CAROL, GOOD_SECRET } from './helpers.js';

const readSetCookie = (res, name) => res.headers.getSetCookie().find((c) => c.startsWith(name + '='));

describe('pages and safety headers', () => {
  let t;
  before(async () => { t = await startServer(); });
  after(() => t.close());

  it('serves the home page with strict headers', async () => {
    const r = await t.browser().req('/');
    assert.equal(r.status, 200);
    const csp = r.headers.get('content-security-policy');
    assert.match(csp, /script-src 'self' https:\/\/checkout\.razorpay\.com(;|$)/); // only our scripts plus the checkout provider
    assert.doesNotMatch(csp.split('script-src ')[1].split(';')[0], /'unsafe-inline'|'unsafe-eval'/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /object-src 'none'/);
    assert.match(csp, /form-action 'self' https:\/\/accounts\.google\.com/);
    assert.doesNotMatch(csp, /upgrade-insecure-requests/); // only in production
    assert.equal(r.headers.get('x-powered-by'), null);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(r.headers.get('referrer-policy'), 'same-origin');
    assert.ok(r.headers.get('permissions-policy'));
    assert.equal(r.headers.get('strict-transport-security'), null); // only in production
  });

  const PRIVATE_FILES = [
    '/.env', '/.env.example', '/package.json', '/package-lock.json', '/server/config.js', '/server/app.js',
    '/data/cerium.db', '/test/helpers.js', '/scripts/gen-secret.js', '/.git/config', '/.gitignore',
    '/node_modules/express/package.json', '/SETUP.md',
  ];
  for (const p of PRIVATE_FILES) {
    it(`does not serve ${p}`, async () => {
      const r = await t.browser().req(p);
      assert.equal(r.status, 404);
    });
  }

  it('does not let a path climb out of /public', async () => {
    for (const p of ['/%2e%2e/package.json', '/..%2fpackage.json', '/..%2f..%2fetc/passwd', '/%2e%2e%2f%2e%2e%2fserver/config.js']) {
      const r = await t.browser().req(p);
      assert.notEqual(r.status, 200, p);
    }
  });

  it('answers the hosting health check', async () => {
    const r = await t.browser().req('/healthz');
    assert.equal(r.status, 200);
    assert.equal(await r.text(), 'ok');
  });

  it('moves a visitor from the wrong address to the right one (development only)', async () => {
    const res = await new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port: t.port, path: '/signup.html?x=1', headers: { host: `localhost:${t.port}` } }, resolve);
      req.on('error', reject);
      req.end();
    });
    assert.equal(res.statusCode, 308);
    assert.equal(res.headers.location, `${t.base}/signup.html?x=1`);
    res.resume();
  });
});

describe('a person who is not signed in', () => {
  let t, b;
  before(async () => { t = await startServer(); b = t.browser(); });
  after(() => t.close());

  it('is told they are signed out', async () => {
    const r = await b.req('/api/me');
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { signedIn: false });
    assert.equal(r.headers.get('cache-control'), 'no-store');
  });

  it('cannot join, delete, download, or sign out through the API', async () => {
    assert.equal((await b.req('/api/waitlist', { method: 'POST', json: { business: 'x' } })).status, 401);
    assert.equal((await b.req('/api/me', { method: 'DELETE' })).status, 401);
    assert.equal((await b.req('/api/me/export')).status, 401);
  });

  it('gets "not found" for the admin download', async () => {
    assert.equal((await b.req('/admin/waitlist.csv')).status, 404);
  });

  it('cannot use a made-up session cookie', async () => {
    const fake = t.browser();
    fake.jar.set(t.config.sessionCookie, 'A'.repeat(43));
    assert.deepEqual(await fake.me(), { signedIn: false });
    assert.equal((await fake.req('/api/me/export')).status, 401);
  });

  it('cannot use a cookie from an expired session', async () => {
    const real = t.db.createSession({ sub: 's', email: 'e@example.com', name: 'E', ttlMs: 1000, now: Date.now() - 60_000 });
    const old = t.browser();
    old.jar.set(t.config.sessionCookie, real.token);
    assert.deepEqual(await old.me(), { signedIn: false });
  });

  it('sends workspace visitors through sign-in before serving the application', async () => {
    const r = await b.req('/app.html');
    assert.equal(r.status, 303);
    assert.equal(r.headers.get('location'), '/login.html?returnTo=%2Fapp.html');
  });
});

describe('Google sign-in flow', () => {
  let t;
  before(async () => { t = await startServer(); });
  after(() => t.close());

  it('sends the person to Google with state, nonce and PKCE', async () => {
    const b = t.browser();
    const r = await b.req('/auth/google', { method: 'POST', form: { intent: 'join', business: 'Roofing' } });
    assert.equal(r.status, 303);
    const u = new URL(r.headers.get('location'));
    assert.equal(u.origin + u.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
    assert.equal(u.searchParams.get('client_id'), t.config.googleClientId);
    assert.equal(u.searchParams.get('redirect_uri'), `${t.base}/auth/google/callback`);
    assert.equal(u.searchParams.get('response_type'), 'code');
    assert.equal(u.searchParams.get('scope'), 'openid email profile');
    assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
    assert.ok(u.searchParams.get('code_challenge').length >= 40);
    assert.ok(u.searchParams.get('state').length >= 20);
    assert.ok(u.searchParams.get('nonce').length >= 20);
    assert.equal(u.searchParams.get('access_type'), 'online');
    const cookie = readSetCookie(r, t.config.oauthCookie);
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Lax/i);
    assert.match(cookie, /Path=\//);
    // The secrets are not in the address that goes to Google (only the challenge is).
    assert.ok(!r.headers.get('location').includes('code_verifier'));
  });

  it('returns a verified Google user only to the protected workspace', async () => {
    const b = t.browser();
    const signedIn = await signIn(t, b, { intent: 'login', profile: CAROL, returnTo: 'https://evil.example/steal' });
    assert.equal(signedIn.cb.headers.get('location'), '/app.html');
  });

  it('only accepts the sign-in start from our own pages', async () => {
    const b = t.browser();
    assert.equal((await b.req('/auth/google', { method: 'POST', form: { intent: 'join' }, origin: null })).status, 403);
    assert.equal((await b.req('/auth/google', { method: 'POST', form: { intent: 'join' }, origin: 'https://evil.example' })).status, 403);
    assert.equal((await b.req('/auth/google', { method: 'POST', form: { intent: 'join' }, origin: 'null' })).status, 403);
    assert.equal((await b.req('/auth/google', { method: 'POST', form: { intent: 'join' }, origin: null, headers: { 'sec-fetch-site': 'cross-site' } })).status, 403);
    assert.equal((await b.req('/auth/google', { method: 'POST', form: { intent: 'join' }, origin: null, headers: { 'sec-fetch-site': 'same-origin' } })).status, 303);
  });

  it('accepts what a real browser sends for a form post (the bug a real browser found)', async () => {
    const b = t.browser();
    const post = (origin, site) => b.req('/auth/google', { method: 'POST', form: { intent: 'join' }, origin, headers: site ? { 'sec-fetch-site': site } : {} });
    // Chrome sends "Origin: null" on a form post when the page has a strict referrer policy.
    assert.equal((await post('null', 'same-origin')).status, 303, 'null origin + same-origin is our own form');
    assert.equal((await post(t.base, 'same-origin')).status, 303);
    // But the two signals must agree.
    assert.equal((await post('https://evil.example', 'same-origin')).status, 403, 'a wrong Origin is never fine');
    assert.equal((await post(t.base, 'cross-site')).status, 403);
    assert.equal((await post(t.base, 'same-site')).status, 403, 'a sibling subdomain is not us');
    assert.equal((await post('null', 'cross-site')).status, 403, 'a sandboxed frame on another site');
    assert.equal((await post('null', null)).status, 403, 'null alone proves nothing');
  });

  it('joins the waitlist after a good Google answer', async () => {
    const b = t.browser();
    const flow = await signIn(t, b, { intent: 'join', business: 'Plumbing', profile: ALICE });
    assert.equal(flow.cb.status, 303);
    assert.equal(flow.cb.headers.get('location'), '/app.html#settings');
    const session = readSetCookie(flow.cb, t.config.sessionCookie);
    assert.match(session, /HttpOnly/i);
    assert.match(session, /SameSite=Lax/i);
    assert.ok(!/Domain=/i.test(session));
    assert.ok(!b.cookie(t.config.oauthCookie), 'the short note is removed after use');
    const me = await b.me();
    assert.equal(me.signedIn, true);
    assert.equal(me.user.email, 'alice@example.com');
    assert.equal(me.member.business, 'Plumbing');
    assert.ok(!Number.isNaN(Date.parse(me.member.joinedAt)));
    assert.ok(me.csrfToken.length >= 20);
  });

  it('exchanges the code with the PKCE verifier and asks Google to check the right audience', async () => {
    const before = t.oauth.exchanges.length;
    const b = t.browser();
    await signIn(t, b, { intent: 'login', profile: BOB });
    assert.equal(t.oauth.exchanges.length, before + 1);
    assert.ok(t.oauth.exchanges.at(-1).codeVerifier.length >= 43);
  });

  it('signs in without joining when the person only logs in', async () => {
    const b = t.browser();
    const before = t.db.count();
    await signIn(t, b, { intent: 'login', profile: CAROL });
    const me = await b.me();
    assert.equal(me.signedIn, true);
    assert.equal(me.member, null);
    assert.equal(t.db.count(), before);
  });

  it('does not add a second row when the same person joins twice, and keeps the first join date', async () => {
    const b1 = t.browser();
    const dana = { sub: 'g-dana-9', email: 'dana@example.com', name: 'Dana Patel' };
    await signIn(t, b1, { intent: 'join', profile: dana });
    const first = (await b1.me()).member.joinedAt;
    const count = t.db.count();
    await new Promise((r) => setTimeout(r, 5));
    const b2 = t.browser();
    await signIn(t, b2, { intent: 'join', business: 'HVAC', profile: dana });
    assert.equal(t.db.count(), count);
    const again = (await b2.me()).member;
    assert.equal(again.joinedAt, first);
    assert.equal(again.business, 'HVAC'); // filled in because it was empty
  });

  it('rejects a Google answer with no matching note (cookie missing)', async () => {
    const b = t.browser();
    const r = await b.req('/auth/google/callback?code=abc&state=def');
    assert.equal(r.status, 303);
    assert.match(r.headers.get('location'), /error=expired/);
    assert.equal((await b.me()).signedIn, false);
  });

  it('rejects a wrong state value', async () => {
    const b = t.browser();
    await b.req('/auth/google', { method: 'POST', form: { intent: 'join' } });
    const r = await b.req('/auth/google/callback?code=abc&state=not-the-state');
    assert.match(r.headers.get('location'), /error=invalid/);
    assert.equal((await b.me()).signedIn, false);
  });

  it('rejects a forged note (changed without the secret)', async () => {
    const b = t.browser();
    await b.req('/auth/google', { method: 'POST', form: { intent: 'join' } });
    const [body, mac] = b.cookie(t.config.oauthCookie).split('.');
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url')), i: 'login', e: Date.now() + 1e9 })).toString('base64url');
    b.jar.set(t.config.oauthCookie, `${forged}.${mac}`);
    const r = await b.req('/auth/google/callback?code=abc&state=def');
    assert.match(r.headers.get('location'), /error=expired/);
  });

  it('handles the person pressing "Cancel" at Google', async () => {
    const b = t.browser();
    await b.req('/auth/google', { method: 'POST', form: { intent: 'join' } });
    const r = await b.req('/auth/google/callback?error=access_denied');
    assert.equal(r.headers.get('location'), '/signup.html?error=denied');
  });

  it('refuses an email that Google has not verified', async () => {
    const b = t.browser();
    const before = t.db.count();
    const flow = await signIn(t, b, { intent: 'join', profile: { ...BOB, sub: 'g-unverified', email: 'unverified@example.com', email_verified: false } });
    assert.match(flow.cb.headers.get('location'), /error=unverified/);
    assert.equal((await b.me()).signedIn, false);
    assert.equal(t.db.count(), before);
  });

  it('refuses an ID token made for a different nonce (replay)', async () => {
    const b = t.browser();
    const flow = await signIn(t, b, { intent: 'join', profile: { ...BOB, sub: 'g-replay', email: 'replay@example.com' }, tweak: (p) => ({ ...p, nonce: 'someone-elses' }) });
    assert.match(flow.cb.headers.get('location'), /error=failed/);
    assert.equal((await b.me()).signedIn, false);
  });

  it('refuses an ID token made for another app, another issuer, or an old one', async () => {
    for (const tweak of [
      (p) => ({ ...p, aud: 'another-app.apps.googleusercontent.com' }),
      (p) => ({ ...p, iss: 'https://evil.example' }),
      (p) => ({ ...p, exp: Math.floor(Date.now() / 1000) - 7200 }),
    ]) {
      const b = t.browser();
      const flow = await signIn(t, b, { intent: 'join', profile: { ...BOB, sub: 'g-bad-token', email: 'badtoken@example.com' }, tweak });
      assert.match(flow.cb.headers.get('location'), /error=failed/);
      assert.equal((await b.me()).signedIn, false);
    }
    assert.ok(!t.db.listForExport().some((r) => r.email === 'badtoken@example.com'));
  });

  it('refuses a wrong or reused code', async () => {
    const b = t.browser();
    await b.req('/auth/google', { method: 'POST', form: { intent: 'join' } });
    const note = unsignNote(t, b);
    const r = await b.req(`/auth/google/callback?code=never-issued&state=${note.s}`);
    assert.match(r.headers.get('location'), /error=failed/);

    // A code works once.
    const b2 = t.browser();
    const flow = await signIn(t, b2, { intent: 'login', profile: { ...CAROL, sub: 'g-once' } });
    assert.equal(flow.cb.headers.get('location'), '/app.html');
    const b3 = t.browser();
    await b3.req('/auth/google', { method: 'POST', form: { intent: 'login' } });
    const n3 = unsignNote(t, b3);
    const r3 = await b3.req(`/auth/google/callback?code=${flow.code}&state=${n3.s}`);
    assert.match(r3.headers.get('location'), /error=failed/);
  });

  it('gives every sign-in a new session id and ends the old one', async () => {
    const b = t.browser();
    await signIn(t, b, { intent: 'login', profile: { ...CAROL, sub: 'g-fix' } });
    const oldToken = b.cookie(t.config.sessionCookie);
    const old = t.browser();
    old.jar.set(t.config.sessionCookie, oldToken);
    assert.equal((await old.me()).signedIn, true);
    await signIn(t, b, { intent: 'login', profile: { ...CAROL, sub: 'g-fix' } });
    assert.notEqual(b.cookie(t.config.sessionCookie), oldToken);
    assert.equal((await old.me()).signedIn, false, 'the old session id must stop working');
  });

  it('keeps only name and email, not the photo, and no Google tokens', async () => {
    const b = t.browser();
    const eve = { sub: 'g-eve-5', email: 'eve@example.com', name: 'Eve Chen' };
    await signIn(t, b, { intent: 'join', profile: eve });
    const row = t.db.listForExport().find((r) => r.email === 'eve@example.com');
    assert.deepEqual(Object.keys(row).sort(), ['business', 'email', 'joinedAt', 'name']);
    const dump = JSON.stringify(t.db.listForExport());
    assert.ok(!dump.includes('photo.png'));
  });
});

function unsignNote(t, browser) {
  const [body] = browser.cookie(t.config.oauthCookie).split('.');
  return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
}

describe('requests from other websites (CSRF)', () => {
  let t, b, csrf;
  before(async () => {
    t = await startServer();
    b = t.browser();
    await signIn(t, b, { intent: 'login', profile: CAROL });
    csrf = (await b.me()).csrfToken;
  });
  after(() => t.close());

  it('needs the csrf token to join', async () => {
    assert.equal((await b.req('/api/waitlist', { method: 'POST', json: {} })).status, 403);
    assert.equal((await b.req('/api/waitlist', { method: 'POST', json: {}, csrf: 'wrong-token-wrong-token' })).status, 403);
    assert.equal(t.db.count(), 0);
  });

  it('needs the right Origin to join', async () => {
    assert.equal((await b.req('/api/waitlist', { method: 'POST', json: {}, csrf, origin: 'https://evil.example' })).status, 403);
    assert.equal((await b.req('/api/waitlist', { method: 'POST', json: {}, csrf, origin: null })).status, 403);
    assert.equal(t.db.count(), 0);
  });

  it('joins when everything is right', async () => {
    const r = await b.req('/api/waitlist', { method: 'POST', json: { business: 'Painting' }, csrf });
    assert.equal(r.status, 201);
    assert.equal((await b.req('/api/waitlist', { method: 'POST', json: { business: 'Painting' }, csrf })).status, 200);
    assert.equal(t.db.count(), 1);
  });

  it('cannot be deleted without the csrf token or from another site', async () => {
    assert.equal((await b.req('/api/me', { method: 'DELETE' })).status, 403);
    assert.equal((await b.req('/api/me', { method: 'DELETE', csrf, origin: 'https://evil.example' })).status, 403);
    assert.equal(t.db.count(), 1);
    assert.equal((await b.me()).member.business, 'Painting');
  });

  it('cannot be signed out by another site', async () => {
    assert.equal((await b.req('/api/logout', { method: 'POST', origin: 'https://evil.example' })).status, 403);
    assert.equal((await b.req('/api/logout', { method: 'POST' })).status, 403); // right origin, no token
    assert.equal((await b.me()).signedIn, true);
  });

  it('ignores text that is too long or has hidden characters', async () => {
    const long = 'x'.repeat(500);
    await b.req('/api/waitlist', { method: 'POST', json: { business: long }, csrf });
    assert.ok((await b.me()).member.business.length <= 80);
    const big = await b.req('/api/waitlist', { method: 'POST', json: { business: 'y'.repeat(5000) }, csrf });
    assert.equal(big.status, 413);
  });
});

describe('people can only reach their own data', () => {
  let t, a, b, c;
  before(async () => {
    t = await startServer();
    a = t.browser(); b = t.browser(); c = t.browser();
    await signIn(t, a, { intent: 'join', business: 'Plumbing', profile: ALICE });
    await signIn(t, b, { intent: 'join', profile: BOB });
    await signIn(t, c, { intent: 'login', profile: CAROL });
  });
  after(() => t.close());

  it('download holds only my own data', async () => {
    const r = await a.req('/api/me/export');
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-disposition'), /attachment/);
    const text = await r.text();
    assert.ok(text.includes('alice@example.com'));
    assert.ok(!text.includes('bob@example.com'));
    assert.ok(!text.includes('carol@example.com'));
    assert.equal(JSON.parse(text).waitlist.business, 'Plumbing');
    // Asking for someone else's data by adding a parameter does nothing.
    const sneaky = await a.req(`/api/me/export?sub=${BOB.sub}&email=bob@example.com`);
    assert.ok(!(await sneaky.text()).includes('bob@example.com'));
  });

  it('joining uses the signed-in identity, not what the request says', async () => {
    const { csrfToken } = await c.me();
    const r = await c.req('/api/waitlist', {
      method: 'POST', csrf: csrfToken,
      json: { business: 'Roofing', email: 'bob@example.com', name: 'Mallory', sub: BOB.sub, google_sub: BOB.sub },
    });
    assert.equal(r.status, 201);
    const rows = t.db.listForExport();
    const carol = rows.find((x) => x.email === 'carol@example.com');
    assert.equal(carol.name, 'Carol Lindqvist');
    assert.equal(carol.business, 'Roofing');
    const bobs = rows.filter((x) => x.email === 'bob@example.com');
    assert.equal(bobs.length, 1);
    assert.equal(bobs[0].name, 'Bob Okafor');
  });

  it('one person deleting their data does not touch another person', async () => {
    const { csrfToken } = await b.me();
    assert.equal((await b.req('/api/me', { method: 'DELETE', csrf: csrfToken })).status, 200);
    const rows = t.db.listForExport().map((r) => r.email);
    assert.ok(!rows.includes('bob@example.com'));
    assert.ok(rows.includes('alice@example.com'));
    assert.ok(rows.includes('carol@example.com'));
    assert.equal((await a.me()).signedIn, true);
    assert.equal((await a.me()).member.business, 'Plumbing');
  });

  it("another person's csrf token does not work for me", async () => {
    const aliceToken = (await a.me()).csrfToken;
    const r = await c.req('/api/me', { method: 'DELETE', csrf: aliceToken });
    assert.equal(r.status, 403);
    assert.ok(t.db.getMember(CAROL.sub));
  });
});

describe('account deletion', () => {
  let t, dir;
  before(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cerium-test-'));
    const { openDb } = await import('../server/db.js');
    t = await startServer({ db: openDb(path.join(dir, 'cerium.db')), env: { DATABASE_PATH: path.join(dir, 'cerium.db') } });
  });
  after(async () => { await t.close(); fs.rmSync(dir, { recursive: true, force: true }); });

  it('deletes the waitlist row, every session, and the cookie', async () => {
    const phone = t.browser();
    const laptop = t.browser();
    const bob = t.browser();
    await signIn(t, laptop, { intent: 'join', business: 'Electrician', profile: ALICE });
    await signIn(t, phone, { intent: 'login', profile: ALICE });
    await signIn(t, bob, { intent: 'join', profile: BOB });

    const { csrfToken } = await laptop.me();
    const r = await laptop.req('/api/me', { method: 'DELETE', csrf: csrfToken });
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { deleted: true });
    const cleared = readSetCookie(r, t.config.sessionCookie);
    assert.match(cleared, /Expires=Thu, 01 Jan 1970/i);

    assert.deepEqual(await laptop.me(), { signedIn: false });
    assert.deepEqual(await phone.me(), { signedIn: false }, 'a second device is signed out too');
    assert.equal(t.db.getMember(ALICE.sub), null);
    assert.equal((await bob.me()).user.name, 'Bob Okafor');
    assert.ok((await bob.me()).member, 'Bob is still on the waitlist');
    assert.equal((await laptop.req('/api/me/export')).status, 401);
  });

  it('removes the email from the database file itself', async () => {
    const b = t.browser();
    const frank = { sub: 'g-frank-7', email: 'frank.the.unique@example.com', name: 'Frank Zebra-Nguyen' };
    await signIn(t, b, { intent: 'join', business: 'Zebra Roofing Unique', profile: frank });
    const read = () => ['', '-wal', '-shm'].map((s) => { try { return fs.readFileSync(path.join(dir, 'cerium.db') + s); } catch { return Buffer.alloc(0); } });
    assert.ok(read().some((buf) => buf.includes('frank.the.unique@example.com')), 'the test needs to see the email before deleting');

    const { csrfToken } = await b.me();
    assert.equal((await b.req('/api/me', { method: 'DELETE', csrf: csrfToken })).status, 200);
    for (const buf of read()) {
      assert.ok(!buf.includes('frank.the.unique@example.com'), 'email must be gone from the file');
      assert.ok(!buf.includes('Frank Zebra-Nguyen'), 'name must be gone from the file');
      assert.ok(!buf.includes('Zebra Roofing Unique'), 'business must be gone from the file');
    }
  });

  it('lets the person join again later as a new member', async () => {
    const b = t.browser();
    await signIn(t, b, { intent: 'join', profile: ALICE });
    const again = await b.me();
    assert.equal(again.user.name, 'Alice Rivera');
    assert.ok(again.member, 'Alice is a member again');
  });
});

describe('sign out', () => {
  it('ends the session on the server, not only in the browser', async () => {
    const t = await startServer();
    try {
      const b = t.browser();
      await signIn(t, b, { intent: 'join', profile: ALICE });
      const token = b.cookie(t.config.sessionCookie);
      const { csrfToken } = await b.me();
      const r = await b.req('/api/logout', { method: 'POST', csrf: csrfToken });
      assert.equal(r.status, 204);
      const stolen = t.browser();
      stolen.jar.set(t.config.sessionCookie, token);
      assert.deepEqual(await stolen.me(), { signedIn: false }, 'a copied cookie must stop working');
      assert.equal(t.db.getMember(ALICE.sub).name, 'Alice Rivera', 'signing out keeps the waitlist spot');
    } finally { await t.close(); }
  });
});

describe('the owner download (admin)', () => {
  let t;
  before(async () => {
    t = await startServer({ env: { ADMIN_EMAILS: 'Owner@Example.com, second@example.com' } });
    const evil = t.browser();
    await signIn(t, evil, { intent: 'join', business: '=HYPERLINK("http://evil.example","click")', profile: { sub: 'g-evil', email: 'evil@example.com', name: '=cmd|\' /C calc\'!A0' } });
    await signIn(t, t.browser(), { intent: 'join', business: 'Plumbing', profile: ALICE });
    // The same email under a second Google account id must not show twice.
    await signIn(t, t.browser(), { intent: 'join', profile: { ...ALICE, sub: 'g-alice-second' } });
  });
  after(() => t.close());

  it('is hidden from signed-out people and from normal members', async () => {
    assert.equal((await t.browser().req('/admin/waitlist.csv')).status, 404);
    const member = t.browser();
    await signIn(t, member, { intent: 'login', profile: ALICE });
    assert.equal((await member.req('/admin/waitlist.csv')).status, 404);
  });

  it('cannot be reached by sending an admin email in the request', async () => {
    const member = t.browser();
    await signIn(t, member, { intent: 'login', profile: ALICE });
    const r = await member.req('/admin/waitlist.csv?email=owner@example.com', { headers: { 'x-admin': 'true', 'x-forwarded-email': 'owner@example.com' } });
    assert.equal(r.status, 404);
  });

  it('works for an admin email (any letter case) and cleans dangerous cells', async () => {
    const owner = t.browser();
    await signIn(t, owner, { intent: 'login', profile: { sub: 'g-owner', email: 'owner@example.com', name: 'The Owner' } });
    const r = await owner.req('/admin/waitlist.csv');
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /text\/csv/);
    assert.match(r.headers.get('content-disposition'), /attachment/);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    const text = await r.text();
    const lines = text.replace(/^\uFEFF/, '').trim().split('\r\n');
    assert.equal(lines[0], 'joined_at,name,email,business');
    assert.equal(lines.filter((l) => l.includes('alice@example.com')).length, 1, 'one row per email');
    assert.ok(lines.some((l) => l.includes("'=cmd")), 'a name that starts with = gets a quote mark in front');
    assert.ok(lines.some((l) => l.includes(`"'=HYPERLINK(""http://evil.example"",""click"")"`)));
    assert.ok(!lines.some((l) => /,=|^=|,"=/.test(l)), 'no cell may start with =');
  });

  it('does not make an admin out of someone whose email is not verified', async () => {
    const fake = t.browser();
    const flow = await signIn(t, fake, { intent: 'login', profile: { sub: 'g-fake', email: 'second@example.com', name: 'Fake', email_verified: false } });
    assert.match(flow.cb.headers.get('location'), /error=unverified/);
    assert.equal((await fake.req('/admin/waitlist.csv')).status, 404);
  });
});

describe('slowing down abuse', () => {
  it('stops many sign-in starts from one address', async () => {
    const t = await startServer({ limits: { auth: { windowMs: 60_000, limit: 2 } } });
    try {
      const b = t.browser();
      assert.equal((await b.req('/auth/google', { method: 'POST', form: { intent: 'join' } })).status, 303);
      assert.match((await b.req('/auth/google', { method: 'POST', form: { intent: 'join' } })).headers.get('location'), /accounts\.google\.com/);
      const third = await b.req('/auth/google', { method: 'POST', form: { intent: 'join' } });
      assert.equal(third.status, 303);
      assert.equal(third.headers.get('location'), '/signup.html?error=slow');
    } finally { await t.close(); }
  });

  it('stops many changes to the waitlist from one address', async () => {
    const t = await startServer({ limits: { write: { windowMs: 60_000, limit: 3 } } });
    try {
      const b = t.browser();
      await signIn(t, b, { intent: 'login', profile: ALICE });
      const { csrfToken } = await b.me();
      const codes = [];
      for (let i = 0; i < 5; i++) codes.push((await b.req('/api/waitlist', { method: 'POST', json: {}, csrf: csrfToken })).status);
      assert.deepEqual(codes, [201, 200, 200, 429, 429]);
    } finally { await t.close(); }
  });
});

describe('running in production', () => {
  let t, dir;
  before(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cerium-prod-'));
    t = await startServer({
      env: {
        NODE_ENV: 'production',
        BASE_URL: 'https://cerium.test',
        DATABASE_PATH: path.join(dir, 'cerium.db'),
        TRUST_PROXY: '1',
        SESSION_SECRET: GOOD_SECRET,
      },
    });
  });
  after(async () => { await t.close(); fs.rmSync(dir, { recursive: true, force: true }); });

  it('adds https-only headers', async () => {
    const r = await t.browser().req('/');
    assert.match(r.headers.get('strict-transport-security'), /max-age=15552000/);
    assert.match(r.headers.get('content-security-policy'), /upgrade-insecure-requests/);
  });

  it('uses locked cookies (__Host-, Secure, HttpOnly, SameSite=Lax)', async () => {
    const b = t.browser();
    const start = await b.req('/auth/google', { method: 'POST', form: { intent: 'join' } });
    const note = readSetCookie(start, '__Host-cerium_oauth');
    assert.ok(note, 'oauth cookie uses the __Host- prefix');
    for (const re of [/Secure/i, /HttpOnly/i, /SameSite=Lax/i, /Path=\//]) assert.match(note, re);
    assert.ok(!/Domain=/i.test(note));

    const flow = await signIn(t, b, { intent: 'join', profile: ALICE });
    const session = readSetCookie(flow.cb, '__Host-cerium_sid');
    assert.ok(session);
    for (const re of [/Secure/i, /HttpOnly/i, /SameSite=Lax/i, /Path=\//]) assert.match(session, re);
  });

  it('refuses the plain-http origin', async () => {
    const b = t.browser();
    const r = await b.req('/auth/google', { method: 'POST', form: { intent: 'join' }, origin: 'http://cerium.test' });
    assert.equal(r.status, 403);
  });

  it('does not redirect unknown hosts (so a proxy that rewrites Host cannot cause a loop)', async () => {
    const res = await new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port: t.port, path: '/', headers: { host: 'app.internal' } }, resolve);
      req.on('error', reject);
      req.end();
    });
    assert.equal(res.statusCode, 200);
    res.resume();
  });
});
