import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('workspace-cursor.js includes all modal popup controls, actions and select triggers', () => {
  const code = read('public/js/workspace-cursor.js');

  // Verify controls include dialog buttons, selects, options, module cards, tabs and close buttons
  assert.match(code, /controls=['"][^']*\[role="option"\]/);
  assert.match(code, /controls=['"][^']*\[role="tab"\]/);
  assert.match(code, /controls=['"][^']*select/);
  assert.match(code, /controls=['"][^']*\.dial-option/);
  assert.match(code, /controls=['"][^']*\.ws-pick-module/);
  assert.match(code, /controls=['"][^']*\.quote-x/);
  assert.match(code, /controls=['"][^']*\.ws-config-close/);
  assert.match(code, /controls=['"][^']*\[data-action\]/);
  assert.match(code, /controls=['"][^']*\[data-quote-action\]/);
  assert.match(code, /controls=['"][^']*\[data-job-action\]/);

  // Module picker cards must resolve to card rather than tiny nested checkbox
  assert.match(code, /el\.closest\('\.ws-pick-module'\)/);

  // Real text fields hide cursor, but select elements remain interactive controls
  assert.match(code, /input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\)/);
  assert.doesNotMatch(code, /const text=el\.closest\?[^;]*select/);

  // Top-layer dialog host management: cursor stays in top-layer dialog while open
  assert.match(code, /document\.querySelector\('dialog\[open\]:last-of-type'\)/);
  assert.match(code, /document\.addEventListener\('close'/);

  // Symmetrical concentric calculation for compact buttons (close '×', icon buttons)
  assert.match(code, /isCompact/);
  assert.match(code, /tw=th=side\+6/);
});

test('every modal popup across app templates and modules pairs with cursor controls', () => {
  const appHtml = read('public/app.html');
  const customizer = read('public/js/workspace-customizer.js');
  const jobs = read('public/js/jobs-page.js');
  const quotes = read('public/js/quotes-page.js');
  const verify = read('public/verify.html');

  // record-dialog, confirm-dialog, invoice-dialog close buttons
  assert.match(appHtml, /id="record-dialog"/);
  assert.match(appHtml, /id="confirm-dialog"/);
  assert.match(appHtml, /id="invoice-dialog"/);
  assert.match(appHtml, /data-action="close-dialog"/);

  // workspace-customizer-dialog
  assert.match(customizer, /id="workspace-customizer-dialog"/);
  assert.match(customizer, /class="ws-config-close"/);
  assert.match(customizer, /class="ws-pick-module"/);

  // cerium-job-dialog
  assert.match(jobs, /id='cerium-job-dialog'/);
  assert.match(jobs, /data-job-action="close"/);

  // cerium-quote-dialog
  assert.match(quotes, /id='cerium-quote-dialog'/);
  assert.match(quotes, /class="quote-x"/);

  // country picker dial panel
  assert.match(verify, /id="dial-panel"/);
  assert.match(verify, /class="dial-panel"/);
});

test('cursor is preserved inside select options and dropdown popups', () => {
  const workspaceCss = read('public/css/workspace.css');
  const controlsCss = read('public/css/controls.css');
  const cursorJs = read('public/js/workspace-cursor.js');

  // Option and optgroup elements maintain visible cursor
  assert.match(workspaceCss, /\.has-workspace-cursor select,\.has-workspace-cursor select \*,\.has-workspace-cursor option,\.has-workspace-cursor optgroup\{cursor:default!important\}/);
  assert.match(controlsCss, /select option\s*\{[^}]*cursor:\s*pointer\s*!important/);

  // workspace-cursor.js recognizes dropdown options and does not pull ring onto parent select trigger
  assert.match(cursorJs, /el\.closest\('option,optgroup'\)/);
  assert.match(cursorJs, /inDropdown/);
});
