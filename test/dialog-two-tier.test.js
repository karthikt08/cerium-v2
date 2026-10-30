import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL('../public/' + path, import.meta.url), 'utf8');
const script = read('js/dialog-two-tier.js');
const css = read('css/dialog-two-tier.css');
const page = read('app.html');

test('two-tier dialog navigation is included in the authenticated app and parses', () => {
  assert.match(page, /css\/dialog-two-tier\.css/);
  assert.match(page, /js\/dialog-two-tier\.js/);
  assert.doesNotThrow(() => new Function(script));
  assert.match(script, /new MutationObserver\(schedule\)/);
  assert.match(script, /type = 'button'/);
  assert.match(script, /aria-pressed/);
});

test('complex record, job, quote, customization, and import editors are integrated', () => {
  for (const dialog of [
    'record-dialog', 'cerium-job-dialog', 'cerium-quote-dialog',
    'workspace-customizer-dialog', 'lead-import-dialog', 'due-import-dialog'
  ]) assert.ok(script.includes("id === '" + dialog + "'"), dialog);
  for (const critical of ['customerName', 'task', 'amount', 'startAt', 'dueDate',
    'customerGstin', 'workspace-preferences-form', 'data-quote-items']) {
    assert.ok(script.includes(critical), 'Missing field/section: ' + critical);
  }
});

test('native form elements and validation survive tab selection', () => {
  assert.doesNotMatch(script, /cloneNode|outerHTML\s*=|innerHTML\s*=/);
  assert.match(script, /state\.activate\(i, index\)/);
  assert.match(script, /dialog\.addEventListener\('invalid'/);
  assert.match(script, /firstControl/);
  assert.match(script, /current\.targets\.forEach/);
  assert.match(script, /view\('Line items'/);
});

test('Design D primary bracket and secondary underline are responsive and accessible', () => {
  assert.match(css, /skewX\(-14deg\)/);
  assert.match(css, /cerium-dialog-tier-one \.cerium-dialog-tier-tab\.active::after/);
  assert.match(css, /cerium-dialog-tier-two \.cerium-dialog-tier-tab\.active/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /max-width: 600px/);
  assert.match(css, /@media print/);
  assert.match(css, /cerium-dialog-tier-hidden/);
});

test('Design D workspace and dialog navigation match the landing-page purple glow', () => {
  const landing = read('css/home.css');
  const workspace = read('css/workspace-navigation.css');
  const design = workspace.slice(workspace.indexOf('/* CERIUM WORKSPACE TABS — Design D'));
  assert.match(landing, /#7c3aed/);
  assert.match(landing, /#d946ef/);
  assert.match(landing, /drop-shadow\\(0 10px 18px rgba\\(124,58,237,\\.28\\)\\)/);
  assert.ok(design.startsWith('/* CERIUM WORKSPACE TABS — Design D'));
  assert.ok(design.includes('--cerium-tab-accent:#7c3aed;'));
  assert.ok(css.includes('--dialog-nav-accent: #7c3aed;'));
  assert.ok(design.includes('--cerium-tab-magenta:#d946ef;'));
  assert.ok(css.includes('--dialog-nav-magenta: #d946ef;'));

  for (const source of [design, css]) {
    assert.ok(source.includes("%3Cpath d='M 1.5 52 L 1.5 10"), 'preserve the original side-bracket geometry');
    assert.ok(source.includes("stop-color='%237c3aed'"), 'violet stroke endpoint');
    assert.ok(source.includes("stop-color='%23d946ef'"), 'magenta stroke endpoint');
    assert.ok(source.includes("stroke='url(%23purple)'"), 'gradient outlined bracket');
    assert.doesNotMatch(source, /stroke='%231d5bf0'/, 'no old blue primary bracket');
    assert.match(source, /drop-shadow\\(0 2px 7px/, 'bracket glow');
    assert.match(source, /box-shadow:\\s*0 0 8px/, 'secondary underline glow');
    assert.match(source, /:focus-visible/, 'preserve keyboard focus indication');
  }
  assert.match(design, /workspace-subfeature-tab\\.active::after/);
  assert.match(css, /cerium-dialog-tier-two \\.cerium-dialog-tier-tab\\.active::after/);
  assert.match(design, /@media\\(forced-colors:active\\)/);
  assert.match(design, /@media\\(prefers-reduced-motion:reduce\\)/);
  assert.match(css, /@media \\(prefers-reduced-motion:reduce\\)/);
});
