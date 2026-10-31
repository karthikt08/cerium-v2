import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../public/'+path,import.meta.url),'utf8');
const workspace=read('css/workspace-navigation.css');
const dialog=read('css/dialog-two-tier.css');
const outlines=read('css/workspace-outlines.css');
const typography=read('css/typography.css');
const html=read('app.html');

test('Design D keeps its purple outline but no longer fills the tabs lavender',()=>{
  const design=workspace.slice(workspace.indexOf('/* CERIUM WORKSPACE TABS — Design D'));
  for(const css of [design,dialog]){
    assert.ok((css.match(/#f8faff/g)||[]).length>=2,'both inactive tab tiers have the new neutral near-white surface');
    assert.match(css, /background:\s*#fff;/,'white active tab interior');
    for(const tinted of ['#eeeaf5','#e7def4','#f4f1f9','#ece6f6','#f8f4ff']){
      assert.ok(!css.includes('background:'+tinted+';')&&!css.includes('background: '+tinted+';'),
        'no old purple-filled tab surfaces: '+tinted);
    }
    assert.match(css, /stop-color='%237c3aed'/,'violet primary border');
    assert.match(css, /stop-color='%23d946ef'/,'magenta primary border');
    assert.match(css, /stroke='url\(%23purple\)'/,'side-bracket remains gradient stroke');
    assert.match(css, /drop-shadow\(0 2px 7px/,'glowing outline preserved');
  }
});

test('outlines apply across workspace surfaces and do not leak into public pages or print',()=>{
  assert.ok(typography.startsWith('@import url("./workspace-reference-theme.css");'));
  assert.ok(typography.includes('@import url("./workspace-outlines.css");'));
  assert.ok(typography.indexOf('workspace-outlines.css')>typography.indexOf('workspace-reference-theme.css'));
  assert.ok(html.includes('css/typography.css'));
  assert.ok(!html.includes('<link rel="stylesheet" href="css/workspace-outlines.css">'));
  assert.match(outlines, /@media screen/);
  assert.match(outlines, /\.app-page #page-body/);
  for(const target of ['.panel','.metric','.jobs-panel','.quote-card','.report-stat','.marketing-stat',
    '.due-summary-card','.settings-content','.lead-card','.job-day','.invoice-billing-section',
    '.data-table','.jobs-table','.sidebar','.topbar','dialog.jobs-dialog','.guide-panel']){
    assert.ok(outlines.includes(target),'outline missing '+target);
  }
  assert.match(outlines, /border:1px solid var\(--cerium-outline\)/);
  assert.match(outlines, /border:1.5px solid #9ca8bf/);
  assert.match(outlines, /border-color:var\(--cerium-outline-focus\)/);
  assert.match(outlines, /:focus-visible/);
  assert.match(outlines, /@media \(forced-colors:active\)/);
  assert.ok(!outlines.includes('invoice-document'),'invoice templates must not receive panel outlines');
  assert.doesNotMatch(outlines, /\.app-page \*\s*\{/,'no border reset applied to every DOM node');
});
