import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {WORKSPACE_FEATURES} from '../public/js/workspace-registry.js';
import {renderFeatureWorkspace} from '../public/js/workspace-navigation.js';

const read=path=>readFileSync(new URL('../public/'+path,import.meta.url),'utf8');
const css=read('css/workspace-navigation.css');
const shell=read('css/workspace.css');
const midnight=read('css/workspace-midnight.css');

test('every feature renders a single destination selector without changing record totals',()=>{
  for(const route of WORKSPACE_FEATURES.filter(f=>!['overview','settings','assistant','support'].includes(f.category))){
    const html=renderFeatureWorkspace(route,undefined,'<p>Feature content</p>');
    assert.match(html,/data-workspace-destination/);
    assert.match(html,/class="workspace-feature-content"/);
    assert.ok(html.includes('value="'+route.href+'"'));
    assert.doesNotMatch(html,/workspace-feature-tab|workspace-subfeature-tab|role="tablist"/);
    assert.ok(html.includes('Feature content'));
  }
  const leads=renderFeatureWorkspace(WORKSPACE_FEATURES.find(x=>x.id==='leads'),undefined,
    '<div class="page-heading"><h1>Leads</h1></div>',
    {leads:[{id:1}],followUps:[]});
  assert.match(leads,/Leads · 1<\/option>/,'record count appears as selector text rather than a decorative tab badge');
});

test('all selected labels get a glowing gradient and inline underline, inactive labels retain contrast',()=>{
  assert.ok(css.includes('.app-page .workspace-feature-tab .workspace-feature-label{'));
  assert.match(css,/\.workspace-feature-tab\[aria-selected="true"\] \.workspace-feature-label\{/);
  assert.match(css,/background:linear-gradient\(100deg,#1e3a8a,#2563eb 54%,#3b82f6\)/);
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

test('animated underlinings match landing hand-drawn SVG curve with motion safeguards',()=>{
  assert.match(css,/animation:ac-ul-in 1\.1s \.25s cubic-bezier\(\.6,0,\.2,1\) both/);
  assert.match(css,/@keyframes ac-ul-in\{/);
  assert.match(css,/@keyframes cerium-tab-ul-in\{/);
  assert.doesNotMatch(css,/width:min\(100%,\s*150px\)/,'underline must not cut off prematurely');
  assert.match(css,/\.marketing-feature-header \.panel-title h2::after\{[\s\S]*?width:100%/);
  const uiConsistency=read('css/ui-consistency.css');
  assert.match(uiConsistency,/@keyframes dr\s*\{/);
  assert.match(uiConsistency,/animation:\s*dr\s+1\.1s\s+0\.3s\s+cubic-bezier\(0\.6,\s*0,\s*0\.2,\s*1\)\s+both/);
});
