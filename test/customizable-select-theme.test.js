import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const readPublic=path=>readFileSync(fileURLToPath(new URL('../public/'+path,import.meta.url)),'utf8');
const readDoc=path=>readFileSync(fileURLToPath(new URL('../docs/'+path,import.meta.url)),'utf8');

test('controls.css includes Cerium theme customizable select popups and fallbacks',()=>{
  const css=readPublic('css/controls.css');
  const doc=readDoc('interface-controls.md');

  // Fallback styling for all option elements
  assert.match(css,/select option\s*\{\s*background-color:\s*#fff/);

  // Modern base-select opt-in
  assert.match(css,/@supports\s*\(appearance:\s*base-select\)/);
  assert.match(css,/::picker\(select\)/);
  assert.match(css,/appearance:\s*base-select/);

  // Pop-up panel styling blends with Cerium software dialog cards
  assert.match(css,/select::picker\(select\)\s*\{[^}]*border-radius:\s*12px/);
  assert.match(css,/select::picker\(select\)\s*\{[^}]*box-shadow:/);
  assert.match(css,/select::picker\(select\)::-webkit-scrollbar-thumb/);

  // Option items styling: rounded corners, hover, and checked highlight with checkmark
  assert.match(css,/select option\s*\{[^}]*border-radius:\s*7px/);
  assert.match(css,/select option:hover/);
  assert.match(css,/select option:checked\s*\{[^}]*background-color:\s*#ecf2ff/);
  assert.match(css,/select option::checkmark/);

  // Arrow rotation on open
  assert.match(css,/select:open::picker-icon\s*\{[^}]*transform:\s*rotate\(180deg\)/);

  // Documentation references base-select and Cerium card blend
  assert.match(doc,/appearance:\s*base-select/);
  assert.match(doc,/::picker\(select\)/);
});

test('every user-facing page includes controls.css so dropdowns are styled consistently',()=>{
  const pages=[
    'app.html',
    'verify.html',
    'index.html',
    'contact.html',
    'signup.html',
    'login.html',
    'pricing.html',
    'privacy.html',
    'terms.html',
    'about.html',
    'waitlist.html'
  ];
  for(const page of pages){
    const html=readPublic(page);
    assert.match(html,/<link rel="stylesheet" href="css\/controls\.css">/,`${page} should include controls.css`);
  }
});
