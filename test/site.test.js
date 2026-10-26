// Tests for the web pages in /public. They check that:
//   - Formspree, Netlify and the old Firebase / Apps Script setup are really gone,
//   - no page needs an inline script (the server blocks them),
//   - every link, script and element the page scripts look for exists.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../server/config.js';

const PUBLIC = path.join(ROOT, 'public');
const pages = fs.readdirSync(PUBLIC).filter((f) => f.endsWith('.html')).sort();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function listFiles(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listFiles(p, out);
    else out.push(p);
  }
  return out;
}

describe('old services are gone', () => {
  const CODE_FILES = [
    ...listFiles(PUBLIC),
    ...listFiles(path.join(ROOT, 'server')),
    ...listFiles(path.join(ROOT, 'scripts')),
    path.join(ROOT, 'package.json'),
    path.join(ROOT, '.env.example'),
  ];
  const BANNED = [/formspree/i, /netlify/i, /firebase/i, /firestore/i, /script\.google(usercontent)?\.com/i, /site-config/i, /waitlist-script/i, /apps script/i];
  for (const re of BANNED) {
    it(`no code or page mentions ${re.source}`, () => {
      const hits = CODE_FILES.filter((f) => re.test(fs.readFileSync(f, 'utf8'))).map((f) => path.relative(ROOT, f));
      assert.deepEqual(hits, []);
    });
  }

  it('no Netlify or Formspree files are left in the project', () => {
    const files = listFiles(ROOT).filter((f) => !f.includes('node_modules') && !f.includes(`${path.sep}.git${path.sep}`)).map((f) => path.relative(ROOT, f));
    for (const bad of ['netlify.toml', '_redirects', '_headers', 'site-config.js', 'auth.js', 'firestore.rules', 'waitlist-script.gs', 'account.html', 'waitlist.js']) {
      assert.ok(!files.includes(bad), `${bad} should be gone`);
    }
    assert.ok(!files.some((f) => /^\.netlify/.test(f)));
  });

  it('no page stores personal data in the browser', () => {
    for (const f of [...pages.map((p) => `public/${p}`), ...listFiles(path.join(PUBLIC, 'js')).map((p) => path.relative(ROOT, p))]) {
      let text = read(f);
      if (f === 'public/js/app.js') {
        // Only a boolean sidebar layout preference may be stored locally.
        // No business records, PII, session data, or other browser storage.
        assert.match(text, /const SIDEBAR_COLLAPSE_KEY='cerium\.sidebar\.collapsed'/);
        const reads = [...text.matchAll(/localStorage\.getItem\(([^)]*)\)/g)].map(m => m[1]);
        const writes = [...text.matchAll(/localStorage\.setItem\(([^)]*)\)/g)].map(m => m[1]);
        assert.deepEqual(reads, ['SIDEBAR_COLLAPSE_KEY']);
        assert.deepEqual(writes, ["SIDEBAR_COLLAPSE_KEY,value?'1':'0'"]);
        text = text.replace(/localStorage\.(?:getItem|setItem)\([^)]*\)/g, '');
      }
      assert.ok(!/localStorage\.(setItem|getItem)|sessionStorage|document\.cookie/.test(text), `${f} uses browser storage`);
    }
  });
});

describe('every page works with a strict Content-Security-Policy', () => {
  for (const page of pages) {
    describe(page, () => {
      // Notes for the site owner live in HTML comments. They are not part of the page.
      const html = read(`public/${page}`).replace(/<!--[\s\S]*?-->/g, '');

      it('has no inline script', () => {
        const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
        for (const [, attrs, body] of scripts) {
          assert.match(attrs, /\bsrc="[^"]+"/, 'a <script> without src: ' + body.slice(0, 60));
          assert.equal(body.trim(), '', 'script with src must be empty');
        }
      });

      it('has no inline event handlers or javascript: links', () => {
        assert.doesNotMatch(html, /\son[a-z]+\s*=\s*["']/i);
        assert.doesNotMatch(html, /(?:href|src|action)\s*=\s*["']\s*javascript:/i);
      });

      it('loads only our own scripts, and only Google Fonts from outside', () => {
        for (const m of html.matchAll(/<(script|link|img|iframe|source|video|audio)\b[^>]*?(?:src|href)="(https?:\/\/[^"]+)"/gi)) {
          const host = new URL(m[2]).hostname;
          assert.ok(['fonts.googleapis.com', 'fonts.gstatic.com'].includes(host), `${page} loads ${m[2]}`);
          assert.notEqual(m[1].toLowerCase(), 'script', 'no outside scripts');
        }
      });

      it('points every script and link to a file that exists', () => {
        for (const m of html.matchAll(/(?:src|href)="([^"#?]+)(?:[#?][^"]*)?"/g)) {
          const target = m[1];
          if (/^(https?:|mailto:|tel:|data:|\/)/.test(target)) continue;
          if (/\.(html|js|css|svg|png|jpg|jpeg|webp|ico)$/.test(target)) {
            assert.ok(fs.existsSync(path.join(PUBLIC, target)), `${page} links to missing ${target}`);
          }
        }
      });

      it('sends forms only to our own sign-in address', () => {
        for (const m of html.matchAll(/<form\b([^>]*)>/gi)) {
          const attrs = m[1];
          const action = (attrs.match(/\baction="([^"]*)"/i) || [])[1];
          if (action === undefined) continue; // a form handled by a page script
          // The contact form opens the visitor's email app (contact.js does it). It sends nothing to a service.
          if (action.startsWith('mailto:')) {
            assert.equal(page, 'contact.html');
            continue;
          }
          assert.equal(action, '/auth/google');
          assert.match(attrs, /method="post"/i);
        }
      });
    });
  }

  it('does not load any script from outside', () => {
    for (const f of listFiles(path.join(PUBLIC, 'js'))) {
      const text = fs.readFileSync(f, 'utf8');
      for (const m of text.matchAll(/fetch\(\s*['"`]([^'"`]+)/g)) {
        assert.ok(m[1].startsWith('/'), `${path.basename(f)} calls ${m[1]}`);
      }
      const external = [...text.matchAll(/https?:\/\/[^'"`\s]+/g)].map(m => m[0]);
      for (const url of external) {
        const allowed = ['https://myaccount.google.com', 'http://localhost', 'https://checkout.razorpay.com/v1/checkout.js'];
        // SVG's xmlns is an identifier, not a network fetch. Only invoice sharing
        // may add the external WhatsApp compose destination.
        const invoiceShareDestination = path.basename(f) === 'invoice-sharing.js' &&
          (url === 'https://wa.me/?text=' || url === 'http://www.w3.org/2000/svg');
        assert.ok(invoiceShareDestination || allowed.some(origin => url.startsWith(origin)), `${path.basename(f)} mentions an unapproved outside address: ${url}`);
        if (url.startsWith('https://checkout.razorpay.com')) {
          assert.equal(path.basename(f), 'billing.js', 'only the checkout integration may reference the provider script');
          assert.equal(url, 'https://checkout.razorpay.com/v1/checkout.js');
        }
      }
    }
  });
});

describe('the sign-in pages', () => {
  it('sign-up posts the join form to the server, with the optional business field', () => {
    const html = read('public/signup.html');
    assert.match(html, /<form id="wl" method="post" action="\/auth\/google">/);
    assert.match(html, /<input type="hidden" name="intent" value="join">/);
    assert.match(html, /name="business"[^>]*maxlength="80"/);
    assert.doesNotMatch(html, /name="(email|name)"/, 'the page must not ask for an email or name');
    assert.match(html, /href="terms\.html"/);
    assert.match(html, /href="privacy\.html"/);
  });

  it('log-in posts the login form to the server', () => {
    const html = read('public/login.html');
    assert.match(html, /<form id="wl" method="post" action="\/auth\/google">/);
    assert.match(html, /<input type="hidden" name="intent" value="login">/);
  });

  it('every id that a page script looks for exists on its page', () => {
    const pairs = [
      ['public/js/signin-page.js', ['public/signup.html', 'public/login.html']],
      ['public/js/waitlist-page.js', ['public/waitlist.html']],
      ['public/js/local-check.js', ['public/signup.html', 'public/login.html']],
    ];
    for (const [script, htmlFiles] of pairs) {
      const js = read(script);
      const ids = new Set([...js.matchAll(/(?:\$|getElementById)\(\s*'([\w-]+)'/g)].map((m) => m[1]));
      for (const id of [...js.matchAll(/(?:const|let)\s+(?:PANELS|LEADS)\s*=\s*\[([^\]]+)\]/g)].flatMap((m) => [...m[1].matchAll(/'([\w-]+)'/g)].map((x) => x[1]))) ids.add(id);
      assert.ok(ids.size > 0);
      for (const file of htmlFiles) {
        const html = read(file);
        for (const id of ids) {
          // ids that only exist on the other of two pages that share a script are fine only if the script handles it
          assert.match(html, new RegExp(`id="${id}"`), `${file} is missing id="${id}" that ${script} needs`);
        }
      }
    }
  });

  it('the waitlist page offers a real download and a real delete', () => {
    const html = read('public/waitlist.html');
    assert.match(html, /href="\/api\/me\/export"/);
    assert.match(html, /id="del"/);
    assert.match(html, /<dialog id="dlg"/);
    const js = read('public/js/waitlist-page.js');
    assert.match(js, /send\('DELETE', '\/api\/me'\)/);
    assert.match(js, /send\('POST', '\/api\/logout'\)/);
    assert.match(js, /send\('POST', '\/api\/waitlist'/);
  });

  it('the privacy page matches what the site does', () => {
    const html = read('public/privacy.html');
    assert.match(html, /Delete my data/);
    assert.doesNotMatch(html, /confirmation email/i, 'no confirmation email is sent any more');
    assert.doesNotMatch(html, /strong password/i, 'there are no passwords');
    assert.doesNotMatch(html, /profile photo, and/i);
    assert.match(html, /Last updated: October 26, 2026/);
  });
});
