import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL('../public/'+path,import.meta.url),'utf8');
const html=read('app.html');
const css=read('css/workspace-outlines.css');

test('outlined UI theme loads after workspace themes and before typography',()=>{
  const style='css/workspace-outlines.css';
  assert.match(html,/css\/workspace-outlines\.css/);
  assert.ok(html.indexOf('css/workspace-midnight.css')<html.indexOf(style));
  assert.ok(html.indexOf(style)<html.indexOf('css/typography.css'));
  assert.match(css,/@media screen\s*\{/);
  assert.doesNotMatch(css,/@media print\s*\{/);
});

test('both shared tab tiers keep white interiors with clear selected borders',()=>{
  assert.match(css,/\.workspace-feature-tab\.active::before,/);
  assert.match(css,/border:2px solid var\(--workspace-outline-active\)/);
  assert.match(css,/\.workspace-subfeature-tab\[aria-current="page"\]/);
  assert.match(css,/background:#fff/);
  assert.match(css,/:focus-visible/);
  assert.match(css, /forced-colors:active/);
  assert.doesNotMatch(css,/#(?:7c3aed|d946ef|f8f4ff|eeeaf5|f4f1f9)/i,
    'new theme must not introduce lavender or purple-filled tabs');
});

test('outlines cover shared content and controls without overriding primary actions',()=>{
  for(const cls of ['.panel','.jobs-panel','.quote-card','.marketing-stat','.metric',
    '.board-column','.marketing-composer','.button.secondary','.sidebar','.nav-link']){
    assert.ok(css.includes(cls),cls+' is part of the outlined workspace');
  }
  assert.match(css,/input:not\(\[type="checkbox"\]\)/);
  assert.match(css,/border-color:var\(--workspace-outline-strong\)/);
  assert.doesNotMatch(css,/\.button\.primary\s*\{/,
    'the blue create/save button treatment should remain unchanged');
});

test('new outline stylesheet is syntactically balanced',()=>{
  let braces=0;
  for(const char of css){
    if(char==='{')braces++;
    if(char==='}')braces--;
    assert.ok(braces>=0,'close brace without opener');
  }
  assert.equal(braces,0);
});
