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
  assert.ok(css.includes('.app-page .workspace-feature-tab .workspace-feature-label{'));
  assert.match(css,/\.workspace-feature-tab\[aria-selected="true"\] \.workspace-feature-label\{/);
  assert.match(css,/background:linear-gradient\(100deg,#3047ad,#6341b4 54%,#8c4b9a\)/);
  assert.match(css,/\.workspace-feature-label::after\{/);
  assert.match(css,/\.workspace-feature-label::after\{[\s\S]*?transform:scaleX\(0\)/);
  assert.match(css,/\.workspace-feature-tab\[aria-selected="true"\] \.workspace-feature-label::after\{[\s\S]*?transform:scaleX\(1\)/);
  assert.match(css,/\.workspace-feature-count\{/,'numeric badges remain independently styled');
});

test('Invoices and other plain page headings get a shared glow; existing accents stay intact',()=>{
  const titleSelector='.app-page #page-body .page-heading h1:not(:has(.ac)):not(:has(.overview-title-accent))';
  assert.ok(css.includes(titleSelector+'{'),'the plain title has gradient text styling');
  assert.ok(css.includes(titleSelector+'::after{'),'the same title has a glowing underline');
  assert.match(css,/\.marketing-feature-header \.panel-title h2::after\{/);
  assert.match(css,/\.page-heading \.ac\{/);
  const app=read('js/app.js');
  assert.match(app,/const pageHeading = .*<h1>\$\{typeof title/);
  assert.match(app,/return pageHeading\(\.\.\.SECTIONS\[kind\]/);
  for(const id of ['leads','followups','invoices','payments','reviews','bank','crew','business','sales','revenue']){
    assert.ok(WORKSPACE_FEATURES.some(route=>route.id===id),id+' is a real subfeature');
  }
  assert.match(read('js/marketing-page.js'),/<h1>Marketing<\/h1>/);
  assert.match(read('js/workspace-insights.js'),/<h1>\$\{titles\[view\]\|\|titles\.business\}<\/h1>/);
  const jobs=read('js/jobs-page.js');
  assert.match(jobs,/<h1>\$\{title\}<\/h1>/,'crew, assignments and dispatch subviews get the same accent');
  for(const source of [jobs,read('js/quotes-page.js'),read('js/reminders-page.js')]){
    assert.ok(source.includes('class="ac"'),'existing rich title is preserved');
    assert.ok(source.includes('class="ul"'),'do not duplicate its SVG underline');
  }
  assert.ok(css.includes(':not(:has(.overview-title-accent))'),'the Overview greeting is unchanged');
  assert.ok(css.includes(':not(:has(.ac))'),'rich titles are not double-decorated');
});

test('subfeature glow cannot recolor forms, records, navigation, dialogs or entire page',()=>{
  assert.match(shell,/:root\{color-scheme:light;/);
  assert.doesNotMatch(midnight,/color-scheme\s*:\s*dark/);
  assert.doesNotMatch(css,/\.workspace-feature-panel\s*\{[^}]*background:\s*(?:#10131a|#151a27)/);
  const glow=css.slice(css.indexOf('/* A single Cerium signature accent'));
  assert.doesNotMatch(glow,/\.data-table\b|\.dialog\b|\.invoice-document\b|\.sidebar\b/);
  assert.match(glow,/@media\(prefers-reduced-motion:reduce\)/);
  assert.ok(glow.includes(':not(:has(.overview-title-accent))'),'Overview greeting remains exempt');
  assert.ok(glow.includes(':not(:has(.ac))'),'Existing accented titles keep one underline');
  assert.match(glow,/@media print\{/);
  assert.match(glow,/-webkit-text-fill-color:currentColor!important/);
});
