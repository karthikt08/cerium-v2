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
