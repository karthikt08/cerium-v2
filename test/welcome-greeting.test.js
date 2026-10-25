import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const readPublic=path=>readFileSync(fileURLToPath(new URL('../public/'+path,import.meta.url)),'utf8');

test('welcome.html exists, has valid structure and software UI styling elements',()=>{
  const html=readPublic('welcome.html');
  assert.match(html,/<title>Welcome to CERIUM<\/title>/);
  assert.match(html,/class="welcome-page"/);
  assert.match(html,/class="welcome-card"/);
  assert.match(html,/id="welcome-title"/);
  assert.match(html,/id="welcome-subtitle"/);
  assert.match(html,/id="welcome-quote"/);
  assert.match(html,/id="welcome-enter-btn"/);
  assert.match(html,/Enter workspace/);
  assert.match(html,/href="css\/welcome\.css"/);
  assert.match(html,/src="js\/welcome\.js"/);
  assert.match(html,/src="js\/workspace-cursor\.js"/);
});

test('welcome page adheres to strict CSP and zero browser storage rules',()=>{
  const html=readPublic('welcome.html');
  const js=readPublic('js/welcome.js');

  // No inline scripts or event handlers
  assert.doesNotMatch(html,/<script\b(?![^>]*\bsrc=)[^>]*>/i);
  assert.doesNotMatch(html,/\son[a-z]+\s*=\s*["']/i);
  assert.doesNotMatch(html,/(?:href|src|action)\s*=\s*["']\s*javascript:/i);

  // Zero browser storage
  assert.doesNotMatch(html,/localStorage|sessionStorage|document\.cookie/);
  assert.doesNotMatch(js,/localStorage|sessionStorage|document\.cookie/);

  // Referenced files exist
  assert.ok(existsSync(fileURLToPath(new URL('../public/css/welcome.css',import.meta.url))));
  assert.ok(existsSync(fileURLToPath(new URL('../public/js/welcome.js',import.meta.url))));
});

test('login form routes successful authentication to welcome page',()=>{
  const auth=readPublic('js/auth-forms.js');
  assert.match(auth,/\/welcome\.html\?next=/);
  // Preserves entry loader compatibility
  assert.match(auth,/\/enter\.html\?next=/);
});

test('workspace topbar provides direct access to daily wishes & motivation',()=>{
  const app=readPublic('app.html');
  assert.match(app,/href="welcome\.html"/);
  assert.match(app,/Daily motivation &amp; greeting/);
});
