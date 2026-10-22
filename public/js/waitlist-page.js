// The waitlist page.
// It asks the server who you are and what your spot is. Nothing is trusted from this browser.
// "Delete my data" and "Sign out" are real requests. The server does the work and checks it is you.
import { getMe, send, firstName, dateText, failText } from './api.js';

const $ = (id) => document.getElementById(id);
const PANELS = ['s-load', 's-err', 's-join', 's-on', 's-gone'];
const LEADS = ['lead-load', 'lead-on', 'lead-join', 'lead-gone', 'lead-err'];

function panel(name, lead) {
  for (const id of PANELS) $(id).hidden = id !== name;
  for (const id of LEADS) $(id).hidden = id !== lead;
  $('steps').hidden = name !== 's-on';
}

function heading(eyebrow, start, name) {
  $('ey').textContent = eyebrow;
  $('h1a').textContent = start;
  $('h1b').hidden = !name;
  $('fn').textContent = name || '';
}

function say(id, text, kind) {
  const el = $(id);
  el.textContent = text || '';
  el.className = 'msg' + (text ? ' ' + (kind || 'err') : '');
}

function showOn(me) {
  const when = dateText(me.member.joinedAt);
  heading('You’re in', 'You’re on the list, ', firstName(me.user.name));
  $('em1').textContent = me.user.email;
  $('v-name').textContent = me.user.name;
  $('v-email').textContent = me.user.email;
  $('v-date').textContent = when || '-';
  $('v-biz-row').hidden = !me.member.business;
  $('v-biz').textContent = me.member.business;
  $('s1').textContent = when ? 'Done. You joined on ' + when + '.' : 'Done.';
  panel('s-on', 'lead-on');
}

function showJoin(me) {
  heading('One more step', 'Almost there, ', firstName(me.user.name));
  $('j-email').textContent = me.user.email;
  say('j-msg', '');
  $('j-go').disabled = false;
  panel('s-join', 'lead-join');
}

function showGone() {
  heading('Done', 'Your data is deleted.', '');
  panel('s-gone', 'lead-gone');
}

function showError() {
  heading('Oops', 'We could not load this page.', '');
  panel('s-err', 'lead-err');
}

async function load() {
  panel('s-load', 'lead-load');
  heading('Your waitlist spot', 'One moment…', '');
  let me;
  try {
    me = await getMe();
  } catch (e) {
    return showError();
  }
  if (!me.signedIn) return location.replace('signup.html');
  if (me.member) showOn(me);
  else showJoin(me);
}

// ---- join (when signed in but not on the list yet)
$('j-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  $('j-go').disabled = true;
  say('j-msg', 'Adding you to the list…', 'info');
  const r = await send('POST', '/api/waitlist', { business: $('j-biz').value }).catch(() => ({ ok: false, status: 0 }));
  if (r.ok) return load();
  if (r.status === 401) return location.replace('login.html');
  say('j-msg', failText(r.status), 'err');
  $('j-go').disabled = false;
});

// ---- sign out
async function signOut() {
  await send('POST', '/api/logout').catch(() => {});
  location.replace('index.html');
}
$('out').addEventListener('click', signOut);
$('j-out').addEventListener('click', signOut);

// ---- delete my data
const dlg = $('dlg');

async function reallyDelete() {
  $('dlg-yes').disabled = true;
  say('dlg-msg', 'Deleting…', 'info');
  const r = await send('DELETE', '/api/me').catch(() => ({ ok: false, status: 0 }));
  if (r.ok) {
    if (dlg.open) dlg.close();
    return showGone();
  }
  if (r.status === 401) return location.replace('login.html');
  say('dlg-msg', failText(r.status), 'err');
  $('dlg-yes').disabled = false;
}

$('del').addEventListener('click', () => {
  say('dlg-msg', '');
  $('dlg-yes').disabled = false;
  if (typeof dlg.showModal === 'function') dlg.showModal();
  else if (confirm('Delete your data? This removes you from the waitlist. It cannot be undone.')) reallyDelete();
});
$('dlg-no').addEventListener('click', () => dlg.close());
$('dlg-yes').addEventListener('click', (ev) => {
  ev.preventDefault();
  reallyDelete();
});

$('retry').addEventListener('click', load);
// Back button: show what is true now, not an old copy of the page.
addEventListener('pageshow', (e) => {
  if (e.persisted) load();
});

load();
