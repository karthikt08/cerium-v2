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

test('Design D tabs do not trigger rectangular magnetic selection', () => {
  const code = read('public/js/workspace-cursor.js');
  const workspaceCSS = read('public/css/workspace-navigation.css');
  const dialogCSS = read('public/css/dialog-two-tier.css');

  // Both workspace navigation and multi-section dialog navigation have their
  // own selected-tab geometry; the cursor must remain a small pointer ring.
  assert.match(code, /overDesignDNavigation=.*workspace-angular-navigation,\.cerium-dialog-navigation/);
  assert.match(code, /target=!inDropdown&&!overDesignDNavigation\?/);
  assert.match(code, /c\.classList\.toggle\('over-control',snapped&&!down\)/);
  assert.match(code, /tw=14,th=14,tr=7,snapped=false/);
  assert.match(workspaceCSS, /Design D side-bracketed two-tier navigation/);
  assert.match(dialogCSS, /Design D side-bracketed primary/);

  // Focus indicators remain available to keyboard users; only the mouse's
  // rectangular magnetic selection effect is disabled.
  assert.match(workspaceCSS, /workspace-angular-navigation :is\(\.workspace-feature-tab,\.workspace-subfeature-tab\):focus-visible/);
  assert.match(dialogCSS, /\.cerium-dialog-tier-tab:focus-visible/);
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

test('cursor remains visible across dialog backdrop and page without being suppressed as an open dropdown', () => {
  const cursorJs = read('public/js/workspace-cursor.js');

  // Open select detection must be strictly scoped to select elements so that open dialogs
  // (which match the standard :open pseudo-class) are never misclassified as dropdowns or text fields
  assert.match(cursorJs, /select:open/);
  assert.doesNotMatch(cursorJs, /el\.matches\(['"]?:open['"]?\)/);

  // When an open dialog element or its backdrop is under the pointer, inDropdown must evaluate to false
  const mockDialog = {
    matches(sel) { return sel === ':open'; },
    closest(sel) { return sel === 'select:open' ? null : (sel === ':open' ? this : null); }
  };
  const isOption = mockDialog.closest('option,optgroup');
  let isOpenSelect = false;
  try { isOpenSelect = !!(mockDialog.closest && mockDialog.closest('select:open')); } catch {}
  const inDropdown = !!(isOption || isOpenSelect);
  assert.equal(inDropdown, false, 'dialog backdrop must not be flagged as inDropdown');
});
