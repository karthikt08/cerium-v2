// Shared by the sign-up page and the log-in page.
// The button posts a normal form to our server. The server sends you to Google.
// This file only shows messages and stops double clicks.
import { getMe } from './api.js';

const msg = document.getElementById('msg');
const go = document.getElementById('go');
const form = document.getElementById('wl');
const requestedReturnTo = new URLSearchParams(location.search).get('returnTo');
const returnTo = safeWorkspaceReturnTo(requestedReturnTo);

function safeWorkspaceReturnTo(value) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/app.html';
  try {
    const target = new URL(value, location.origin);
    if (target.origin !== location.origin || !['/app', '/app.html'].includes(target.pathname)) return '/app.html';
    return target.pathname + target.search + target.hash;
  } catch {
    return '/app.html';
  }
}

// The server sends people back here with ?error=<code> when something went wrong.
const MESSAGES = {
  denied: ['You closed Google without allowing sign-in. No problem. You can try again when you are ready.', 'info'],
  expired: ['That sign-in took too long, or the page was reloaded. Please try again.', 'err'],
  invalid: ['We could not check that sign-in. Please try again.', 'err'],
  unverified: ['Google says this email address is not verified. Please use a different Google account.', 'err'],
  failed: ['Sign-in did not work. Please try again in a minute.', 'err'],
  slow: ['Too many tries. Please wait a few minutes and try again.', 'err'],
  'not-configured': ['Google sign-in is not set up on this server yet. (Site owner: see SETUP.md, step 3.)', 'err'],
};

function say(text, kind) {
  if (!msg) return;
  msg.textContent = text || '';
  msg.className = 'msg' + (text ? ' ' + (kind || 'err') : '');
}

const code = new URLSearchParams(location.search).get('error');
if (code && Object.prototype.hasOwnProperty.call(MESSAGES, code)) {
  say(MESSAGES[code][0], MESSAGES[code][1]);
  history.replaceState(null, '', location.pathname); // keep the message, clean the address
}

// Already signed in? Go to the protected workspace the person asked for.
getMe()
  .then((me) => {
    if (me.signedIn) location.replace('/enter.html?next=' + encodeURIComponent(returnTo));
  })
  .catch(() => {});

if (form && go) {
  form.addEventListener('submit', () => {
    go.disabled = true;
    say('Opening Google…', 'info');
  });

  // Coming back with the Back button: let the person try again.
  addEventListener('pageshow', (e) => {
    if (e.persisted) {
      go.disabled = false;
      say('');
    }
  });
}
