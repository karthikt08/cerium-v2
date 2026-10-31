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
  assert.match(landing, /drop-shadow\(0 10px 18px rgba\(124,58,237,\.28\)\)/);
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
    assert.match(source, /drop-shadow\(0 2px 7px/, 'bracket glow');
    assert.match(source, /box-shadow:\s*0 0 8px/, 'secondary underline glow');
    assert.match(source, /:focus-visible/, 'preserve keyboard focus indication');
  }
  assert.match(design, /workspace-subfeature-tab\.active::after/);
  assert.match(css, /cerium-dialog-tier-two \.cerium-dialog-tier-tab\.active::after/);
  assert.match(design, /@media\(forced-colors:active\)/);
  assert.match(design, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)/);
});


test('inactive Design D tabs remain recognizable against landing ambience in both navigation rows', () => {
  const workspace = read('css/workspace-navigation.css');
  const design = workspace.slice(workspace.indexOf('/* CERIUM WORKSPACE TABS — Design D'));
  const dialogs = read('css/dialog-two-tier.css');

  assert.match(design, /--cerium-tab-outline:#94a6c0;/);
  assert.match(dialogs, /--dialog-nav-outline: #94a6c0;/);
  assert.match(design, /--cerium-tab-outline-hover:#766b9d;/);
  assert.match(dialogs, /--dialog-nav-outline-hover: #766b9d;/);

  // Actual border on each skewed background pseudo-element, not a rectangular
  // box on the anchor/button: the parallelogram shape must stay unchanged.
  const workspaceShapes = [
    '.workspace-feature-tab::before{',
    '.workspace-subfeature-tab::before{'
  ];
  for (const shape of workspaceShapes) {
    const start = design.indexOf(shape);
    assert.ok(start !== -1, 'missing workspace shape ' + shape);
    const rule = design.slice(start, design.indexOf('}', start));
    assert.match(rule, /transform:skewX\(-14deg\)/);
    assert.match(rule, /border:2px solid var\(--cerium-tab-outline\)/);
    assert.match(rule, /box-sizing:border-box/);
    assert.match(rule, /pointer-events:none/);
  }
  assert.match(dialogs, /border: 2px solid var\(--dialog-nav-outline\)/);
  assert.match(dialogs, /transform: skewX\(-14deg\)/);

  // A neutral fill and closed, rounded outline distinguish inactive tabs
  // against the pale landing background. Their lower edge is not clipped.
  assert.match(design, /border-radius:9px;background:#f8faff/);
  assert.match(design, /border-radius:8px;background:#f8faff/);
  assert.match(dialogs, /border-radius: 9px;[\s\S]*?background: #f8faff/);
  assert.match(dialogs, /border-radius: 8px;/);
  assert.match(design, /workspace-feature-tab:not\(\.active\):not\(\[aria-current="page"\]\)/);
  assert.match(design, /workspace-subfeature-tab:not\(\.active\):not\(\[aria-current="page"\]\)/);
  assert.match(design, /margin-bottom:2px;/);
  assert.match(dialogs, /cerium-dialog-tier-tab:not\(\.active\)[\s\S]*?margin-bottom: 2px;/);


  // Selection still belongs exclusively to purple: gray inactive outlines
  // disappear under both the active primary bracket and active secondary rule.
  assert.match(design, /background:#fff;bottom:-2px;border:0;/);
  assert.match(design, /background:#fff;border:0;/);
  assert.match(dialogs, /background: #fff;\s+bottom: -2px;\s+border: 0;/);
  assert.match(dialogs, /background: #fff;\s+border: 0;/);
  for (const source of [design, dialogs]) {
    assert.match(source, /stop-color='%237c3aed'/);
    assert.match(source, /stop-color='%23d946ef'/);
    assert.match(source, /:focus-visible/);
  }
  assert.match(design, /@media\(max-width:760px\)/);
  assert.match(dialogs, /@media \(max-width: 600px\)/);
  assert.match(design, /@media print/);
  assert.match(dialogs, /@media print/);
});
