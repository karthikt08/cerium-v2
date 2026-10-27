import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {runInNewContext} from 'node:vm';

const readPublic=path=>readFileSync(fileURLToPath(new URL('../public/'+path,import.meta.url)),'utf8');

function legacyRedirect(query){
  const script=readPublic('js/welcome.js'),destinations=[];
  const location={origin:'https://cerium.example',search:query,replace:to=>destinations.push(to)};
  runInNewContext(script,{window:{location},URL,URLSearchParams},{timeout:1000});
  return destinations;
}

test('retired greeting URL is now only a lightweight workspace redirect',()=>{
  const html=readPublic('welcome.html');
  assert.match(html,/<title>Opening CERIUM Workspace<\/title>/);
  assert.match(html,/class="workspace-redirect-page"/);
  assert.match(html,/href="\/app.html"/,'non-JS fallback');
  assert.match(html,/src="js\/welcome.js"/);
  assert.doesNotMatch(html,/welcome-card|welcome-title|Daily Motivation|welcome-quote|welcome-enter-btn|welcome-pillars/i);
  assert.doesNotMatch(html,/href="css\/welcome.css"/,'old greeting design is not loaded');
});

test('legacy greeting redirects preserve only same-origin workspace deep links',()=>{
  const cases=[
    ['', '/app.html'],
    ['?next=%2Fapp.html%23invoices','/app.html#invoices'],
    ['?next=%2Fapp%3Fview%3Dcompact%23leads','/app?view=compact#leads'],
    ['?next=https%3A%2F%2Fevil.example%2Fapp.html','/app.html'],
    ['?next=%2F%2Fevil.example','/app.html'],
    ['?next=%2Fsettings.html','/app.html'],
    ['?next=javascript%3Aalert(1)','/app.html'],
  ];
  for(const [query,expected] of cases)
    assert.deepEqual(legacyRedirect(query),[expected],query||'default destination');
});

test('retired greeting route keeps CSP, zero storage, and working references',()=>{
  const html=readPublic('welcome.html'),js=readPublic('js/welcome.js');
  assert.doesNotMatch(html,/<script\b(?![^>]*\bsrc=)[^>]*>/i);
  assert.doesNotMatch(html,/\son[a-z]+\s*=\s*["']/i);
  assert.doesNotMatch(html,/(?:href|src|action)\s*=\s*["']\s*javascript:/i);
  assert.doesNotMatch(html+js,/localStorage|sessionStorage|document\.cookie/);
  assert.ok(existsSync(fileURLToPath(new URL('../public/js/welcome.js',import.meta.url))));
});

test('successful login goes straight to the requested workspace, not greeting',()=>{
  const auth=readPublic('js/auth-forms.js');
  assert.match(auth,/window\.location\.replace\(returnTo\)/);
  assert.doesNotMatch(auth,/\/welcome\.html\?next=/);
  assert.match(auth,/\/enter\.html\?next=/,'existing signup brand entry remains');
});

test('workspace toolbar no longer links to the greeting screen',()=>{
  const app=readPublic('app.html');
  assert.doesNotMatch(app,/href="welcome\.html"|Daily motivation &amp; greeting/);
  assert.match(app,/data-action="refresh"/,'workspace refresh stays available');
  assert.match(app,/id="user-avatar"/,'account settings remain available');
});
