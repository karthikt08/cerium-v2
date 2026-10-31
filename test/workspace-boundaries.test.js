import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../public/'+path,import.meta.url),'utf8');
const css=read('css/workspace-boundaries.css');
const typography=read('css/typography.css');
const app=read('app.html');

test('last shared stylesheet gives every authenticated page the same boundary scale',()=>{
  const imports=[...typography.matchAll(/@import url\("\.\/([^"]+)"\);/g)].map(m=>m[1]);
  assert.equal(imports.at(-1),'workspace-boundaries.css');
  assert.ok(imports.indexOf('workspace-boundaries.css')>imports.indexOf('workspace-layout.css'));
  assert.ok(imports.indexOf('workspace-boundaries.css')>imports.indexOf('workspace-outlines.css'));
  assert.match(app, /href="css\/typography\.css"/);
  assert.ok(!app.includes('href="css/workspace-boundaries.css"'),'avoid duplicated stylesheet');
  assert.match(css, /@media screen/);
  for(const token of [
    '--cerium-boundary-strong:', '--cerium-boundary-card:',
    '--cerium-boundary-control:', '--cerium-boundary-divider:',
    '--cerium-boundary-hover:', '--cerium-boundary-focus:'
  ])assert.ok(css.includes(token),'shared edge token missing '+token);
  assert.match(css, /border:1\.5px solid var\(--cerium-boundary-strong\)/);
  assert.match(css, /border:1\.25px solid var\(--cerium-boundary-card\)/);
  assert.match(css, /border:1\.25px solid var\(--cerium-boundary-control\)/);
});

test('real primary cards and secondary record surfaces are outlined across all feature areas',()=>{
  // Verify selectors, not a brittle list of route names; each route reuses the
  // same card families from the main renderers.
  for(const token of [
    '.panel','.card','.data-panel','.table-panel','.jobs-panel',
    '.workspace-customizer','.marketing-main','.marketing-composer',
    '.marketing-next-moves','.settings-content','.metric','.jobs-stat',
    '.quotes-summary>div','.quote-card','.reminders-stats>div',
    '.report-stat','.marketing-stat','.due-summary-card','.board-column',
    '.lead-card','.job-day','.quotes-progress>span','.overview-tool-link',
    '.workspace-customizer .ws-pick-module'
  ])assert.ok(css.includes(token),'missing component edge '+token);
  const originalModules={
    jobs:'css/jobs.css',
    quotes:'css/quotes.css',
    reminders:'css/reminders.css',
    payments:'css/payment-dues.css',
    marketing:'css/marketing.css',
    customization:'css/workspace-customizer.css',
    service:'css/vertical-workflows.css'
  };
  for(const [area,path] of Object.entries(originalModules)){
    assert.ok(read(path).length>100,'missing original '+area+' module styles');
  }
  assert.match(css, /\.app-page #page-body \.workspace-subfeature-strip/);
  assert.doesNotMatch(css, /\.workspace-angular-navigation\s*\{/,
    'do not box-in the Design D tab controls');
  assert.doesNotMatch(css, /\.app-page #page-body \.workspace-feature-panel\s*\{\s*border:/,
    'do not reintroduce the old all-white outer workspace panel');
});

test('data tables and fields gain legible edges without drawing each cell as a card',()=>{
  assert.match(css, /tbody tr:not\(:last-child\) td/);
  assert.match(css, /border-bottom:1\.5px solid var\(--cerium-boundary-strong\)/);
  assert.match(css, /border-bottom:1px solid var\(--cerium-boundary-divider\)/);
  for(const token of ['.search-field','.view-toggle','.filter-chips',
    '.workspace-view-picker select','.marketing-link','.button.secondary',
    '.btn.gh','.quote-more summary']){
    assert.ok(css.includes(token),'missing interactive control edge '+token);
  }
  assert.match(css, /input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\)/);
  assert.match(css, /:not\(\.search-field input\)/);
  assert.match(css, /\.search-field input\s*\{\s*border:0!important/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /outline:2px solid rgba\(124,58,237,\.58\)/);
  assert.doesNotMatch(css, /\btd\s*\{\s*border:1\.25px/,
    'cells use dividers rather than repeated boxes');
});

test('dialogs and popovers match cards without damaging statuses, accents, or print',()=>{
  for(const token of [
    'dialog.dialog','dialog.c-modal','dialog.jobs-dialog',
    'dialog.quotes-dialog','dialog.workspace-config-dialog',
    '.jobs-trade','.vertical-check','.invoice-billing-section',
    '.ws-recommender','.ws-pick-module',
    '.guide-panel','.quote-more-menu'
  ])assert.ok(css.includes(token),'missing dialog edge '+token);
  assert.ok(css.includes('border-color:#7687aa;'),'dark summary card contrast retained');
  assert.ok(css.includes('Business status badges, trade-specific job tile left stripes'));
  assert.doesNotMatch(css, /\.job-tile\s*[\s,{]/,
    'do not overwrite semantic job-tile left borders');
  assert.doesNotMatch(css, /:is\(\s*\.job-tile|\.badge\s*\{/,
    'do not overwrite semantic badges');
  assert.doesNotMatch(css, /\.invoice-document\s*\{/,
    'do not style printed invoice sheet');
  assert.doesNotMatch(css, /@media print\s*\{/,
    'screen-only system cannot modify print layout');
  assert.match(css, /@media \(forced-colors:active\)/);
  assert.doesNotMatch(css, /\.pg(?:\.| )|\.home\b/,
    'do not modify the public landing/marketing site');
});
