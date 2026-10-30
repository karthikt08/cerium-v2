import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../public/'+path,import.meta.url),'utf8');
const css=read('css/workspace-title-glow.css');
const base=read('css/workspace-navigation.css');
const page=read('app.html');
const typography=read('css/typography.css');

test('all workspace pages load violet title styling without altering public stylesheets',()=>{
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

test('Job schedule stroke thickness and purple glow match all other headings',()=>{
  assert.match(read('js/jobs-page.js'), /Job schedule<svg class="ul"/);
  assert.match(read('js/app.js'), /const brandHeadingSVG = '<svg class="ul"/);
  assert.match(css, /--cerium-page-title-stroke:8\.5;/);
  assert.match(css, /stroke-width='8\.5'/);
  assert.match(css, /stroke-width:8\.5!important/);
  assert.match(css, /viewBox='0 0 300 14'/);
  assert.match(css, /d='M3 9C60 3 120 12 180 6s90 3 117 0'/);
  assert.ok(base.includes('h1:not(:has(.ac)):not(:has(.overview-title-accent))'));
  assert.match(css, /h1:not\(:has\(\.ac\)\):not\(:has\(\.overview-title-accent\)\)::after/);
  assert.match(css, /\.page-heading \.ul path/);
  assert.match(css, /\.marketing-feature-header \.panel-title h2::after/);
  assert.match(css, /\.overview-stage-unified \.overview-title-accent::after/);
  assert.match(css, /height:14px/);
  assert.match(css, /drop-shadow\(0 4px 9px rgba\(124,58,237,\.52\)\)/);
});

test('all SVG headings use the same in-document violet to magenta gradient',()=>{
  assert.match(page, /id="cerium-title-purple"/);
  assert.match(page, /id="cerium-title-purple"[^>]*>[\s\S]*?stop-color="#6d28d9"/);
  assert.match(page, /stop-color="#7c3aed"/);
  assert.match(page, /stop-color="#d946ef"/);
  assert.match(css, /stroke:url\(#cerium-title-purple\)!important/);
  assert.match(css, /stroke='url\(%23ceriumTitle\)'/);
  assert.match(css, /stop-color='%237c3aed'/);
  assert.match(css, /stop-color='%23d946ef'/);
  assert.match(css, /@media screen and \(prefers-reduced-motion:reduce\)/);
  assert.match(css, /stroke-dashoffset:0!important/);
  assert.doesNotMatch(css, /color-scheme:dark|background:#10131a/);
});
