import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../public/'+path,import.meta.url),'utf8');
const css=read('css/workspace-title-glow.css');
const base=read('css/workspace-navigation.css');
const page=read('app.html');
const typography=read('css/typography.css');

test('all authenticated workspace pages load a shared title treatment',()=>{
  assert.ok(typography.startsWith('@import url("./workspace-reference-theme.css");'));
  for(const name of ['workspace-outlines.css','workspace-title-glow.css']){
    assert.ok(typography.includes('@import url("./'+name+'");'));
  }
  assert.ok(typography.indexOf('workspace-outlines.css')<typography.indexOf('workspace-title-glow.css'));
  assert.ok(page.includes('<link rel="stylesheet" href="css/typography.css">'));
  assert.doesNotMatch(page,/<link rel="stylesheet" href="css\/workspace-title-glow\.css">/);
  assert.match(css, /@media screen/);
  assert.match(css, /\.app-page #page-body \.page-heading/);
  assert.doesNotMatch(css, /\.pg\.home|\.sidebar|\.invoice-document/);
});

test('all title lengths render the same physical stroke width rather than scaling inline SVGs',()=>{
  assert.match(read('js/jobs-page.js'), /Job schedule<svg class="ul"/);
  assert.match(read('js/app.js'), /const brandHeadingSVG = '<svg class="ul"/);
  assert.ok(base.includes('h1:not(:has(.ac)):not(:has(.overview-title-accent))'));
  assert.match(css, /--cerium-page-title-stroke:5\.5px;/);
  assert.match(css, /viewBox='0 0 300 14'/);
  assert.match(css, /preserveAspectRatio='none'/);
  assert.match(css, /stroke-width='5\.5'/);
  assert.match(css, /vector-effect='non-scaling-stroke'/);
  assert.match(css, /d='M3 9C60 3 120 12 180 6s90 3 117 0'/);
  assert.match(css, /\.page-heading \.ac > svg\.ul \{\s*display:none!important/);
  const unified=css.slice(css.indexOf('/* All headings now render'));
  for(const selector of [
    '.page-heading h1:not(:has(.ac)):not(:has(.overview-title-accent))::after',
    '.page-heading .ac::after',
    '.marketing-feature-header .panel-title h2::after',
    '.overview-stage-unified .overview-title-accent::after'
  ])assert.ok(unified.includes(selector),'missing shared line geometry: '+selector);
  assert.match(unified, /height:14px/);
  assert.match(unified, /background:var\(--cerium-page-title-underline\) left bottom \/ 100% 100% no-repeat!important;/);
  assert.doesNotMatch(css, /stroke:url\(#cerium-title-purple\)!important/,'inline SVG is no longer the visible stroke');
});

test('violet-magenta hue stays, while heading and underline radiation are reduced',()=>{
  for(const color of ["%236d28d9","%237c3aed","%23d946ef"]){
    assert.ok(css.includes(color),'missing purple gradient stop '+color);
  }
  assert.match(css, /stroke='url\(%23ceriumTitle\)'/);
  assert.match(css, /filter:drop-shadow\(0 3px 9px rgba\(124,58,237,\.22\)\)!important/);
  assert.match(css, /filter:drop-shadow\(0 2px 6px rgba\(124,58,237,\.28\)\)!important/);
  assert.doesNotMatch(css, /drop-shadow\(0 4px 9px rgba\(124,58,237,\.52\)\)/);
  assert.doesNotMatch(css, /drop-shadow\(0 5px 14px rgba\(124,58,237,\.35\)\)/);
  assert.match(css, /@media screen and \(prefers-reduced-motion:reduce\)/);
  assert.match(css, /clip-path:none!important/);
  assert.doesNotMatch(css, /color-scheme:dark|background:#10131a/);
});
