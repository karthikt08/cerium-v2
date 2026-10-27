import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {WORKSPACE_FEATURES} from '../public/js/workspace-registry.js';
import {renderFeatureWorkspace} from '../public/js/workspace-navigation.js';

const read=path=>readFileSync(new URL('../public/'+path,import.meta.url),'utf8');
const css=read('css/workspace-navigation.css');
const shell=read('css/workspace.css');
const midnight=read('css/workspace-midnight.css');

test('every real subfeature tab contains a glowable label without altering badge text',()=>{
  for(const route of WORKSPACE_FEATURES.filter(f=>f.category!=='overview')){
    const html=renderFeatureWorkspace(route,undefined,'<p>Feature content</p>');
    assert.match(html,/class="workspace-feature-label"/);
    assert.match(html,new RegExp('<span class="workspace-feature-label">'+
      route.label.replace(/&/g,'&amp;').replace(/[.*+?^$\{\}()|[\]\\]/g,'\\$&')+'</span>'));
    assert.match(html,/aria-selected="true"/);
    assert.ok(html.includes('aria-labelledby="workspace-tab-'+route.id+'"'));
    assert.ok(html.includes('Feature content'));
  }
  const leads=renderFeatureWorkspace(WORKSPACE_FEATURES.find(x=>x.id==='leads'),undefined,
    '<div class="page-heading"><h1>Leads</h1></div>',
    {leads:[{id:1}],followUps:[]});
  assert.match(leads,/workspace-feature-label">Leads<\/span><span class="workspace-feature-count"/,
    'count badge follows label rather than being part of its gradient treatment');
});

test('all selected labels get a glowing gradient and inline underline, inactive labels retain contrast',()=>{
  assert.match(css,/\.workspace-feature-tab \ .workspace-feature-label/);
  assert.match(css,/\.workspace-feature-tab\[aria-selected="true"\] \.workspace-feature-label\{/);
  assert.match(css,/background:linear-gradient\(100deg,#3047ad,#6341b4 54%,#8c4b9a\)/);
  assert.match(css,/\.workspace-feature-label::after\{/);
  assert.match(css,/\.workspace-feature-label::after\{[\s\S]*?transform:scaleX\(0\)/);
  assert.match(css,/\.workspace-feature-tab\[aria-selected="true"\] \.workspace-feature-label::after\{[\s\S]*?transform:scaleX\(1\)/);
  assert.match(css,/\.workspace-feature-count\{/,'numeric badges remain independently styled');
});

test('normal feature headings and Marketing sub-headings get soft underline, existing accented headings stay intact',()=>{
  assert.match(css,/\.page-heading:not\(\.marketing-page-heading\) h1:not\(:has\(\.ac\)\)/);
  assert.match(css,/\.page-heading:not\(\.marketing-page-heading\) h1:not\(:has\(\.ac\)\)::after\{/);
  assert.match(css,/\.marketing-feature-header \.panel-title h2::after\{/);
  assert.match(css,/\.page-heading \.ac\{/);
  const app=read('js/app.js');
  assert.match(app,/const pageHeading =/);
  const jobs=read('js/jobs-page.js'),quotes=read('js/quotes-page.js'),reminders=read('js/reminders-page.js');
  for(const s of [jobs,quotes,reminders]){
    assert.ok(s.includes('class="ac"'),'existing .ac title and .ul underline left untouched');
    assert.ok(s.includes('class="ul"'),'existing underline path remains intact');
  }
});

test('subfeature glow cannot recolor forms, records, navigation, dialogs or entire page',()=>{
  assert.match(shell,/:root\{color-scheme:light;/);
  assert.doesNotMatch(midnight,/color-scheme\s*:\s*dark/);
  assert.doesNotMatch(css,/\.workspace-feature-panel\s*\{[^}]*background:\s*(?:#10131a|#151a27)/);
  const glow=css.slice(css.indexOf('/* A single Cerium signature accent'));
  assert.doesNotMatch(glow,/\.data-table\b|\.dialog\b|\.invoice-document\b|\.sidebar\b/);
  assert.match(glow,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(glow,/@media print\{/);
  assert.match(glow,/-webkit-text-fill-color:currentColor!important/);
});
