import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css=fs.readFileSync(new URL('../public/css/workspace.css',import.meta.url),'utf8');
const js=fs.readFileSync(new URL('../public/js/app.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../public/app.html',import.meta.url),'utf8');

test('sidebar scrolling stays enabled but its visible scrollbar disappears',()=>{
  assert.match(css,/\.app-page \.sidebar \.navigation-scroll\{\s*overflow-x:hidden;overflow-y:auto/);
  assert.match(css,/\.app-page \.sidebar \.navigation-scroll\{[^}]*scrollbar-width:none/);
  assert.match(css,/\.app-page \.sidebar \.navigation-scroll::-webkit-scrollbar\{[^}]*display:none!important/);
  assert.match(css,/overscroll-behavior-y:contain/);
  assert.match(css,/\.content-scroll,.navigation-scroll/,'Other workspace scroll regions retain their own styling');
  assert.match(css,/@media\(max-width:760px\)/,'Mobile drawer styling remains separate');
});

test('collapsed header shares one logo/reopen slot instead of stacking two rows',()=>{
  assert.match(html,/class="sidebar-top"/);
  assert.match(html,/class="brand" data-nav="overview"/);
  assert.match(html,/id="sidebar-collapse-toggle"/);
  assert.match(css,/\.sidebar-top\{\s*position:relative/);
  assert.match(css,/\.sidebar-collapse-toggle\{\s*position:absolute;right:0;top:50%/);
  assert.match(css,/\.workspace\.sidebar-collapsed \.sidebar-top\{\s*justify-content:center/);
  assert.match(css,/\.workspace\.sidebar-collapsed \.sidebar-collapse-toggle\{\s*right:calc\(50% - 20px\)/);
  assert.doesNotMatch(css,/\.workspace\.sidebar-collapsed \.sidebar-top\{[^}]*flex-direction:column/);
  assert.match(css,/\.workspace\.sidebar-collapsed \.sidebar-collapse-toggle:is\(:hover,:focus-visible\)\{/);
  assert.match(css,/\.sidebar-top:has\(\.sidebar-collapse-toggle:is\(:hover,:focus-visible\)\) \.brand img\{/);
  assert.match(css,/\.workspace\.sidebar-collapsed \.sidebar-collapse-toggle \.icon\{\s*transform:rotate\(180deg\)/);
});

test('logo and toggle animate without compromising reduced-motion preference',()=>{
  assert.match(css,/transition:right \.25s/);
  assert.match(css,/transition:opacity \.18s ease,transform \.25s/);
  assert.match(css,/transition:max-width \.23s/);
  assert.match(css,/\.workspace\{transition:grid-template-columns \.25s/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css,/\.sidebar-top \.brand img,\.sidebar-top \.brand>span\{transition:none!important/);
});

test('toggle retains semantic labels, saved desktop preference, and mobile brand keyboard access',()=>{
  assert.match(html,/aria-label="Collapse sidebar"/);
  assert.match(html,/aria-controls="sidebar" aria-expanded="true"/);
  assert.match(js,/const SIDEBAR_COLLAPSE_KEY='cerium\.sidebar\.collapsed'/);
  assert.match(js,/toggle\.setAttribute\('aria-expanded',String\(!value\)\)/);
  assert.match(js,/toggle\.setAttribute\('aria-label',label\)/);
  assert.match(js,/const compactDesktop=value&&window\.innerWidth>760/);
  assert.match(js,/brand\.tabIndex=compactDesktop\?-1:0/);
  assert.match(js,/brand\.removeAttribute\('aria-hidden'\)/);
  assert.match(js,/setSidebarCollapsed\(\$\('workspace'\)\.classList\.contains\('sidebar-collapsed'\)\);revealActiveFeature/);
  assert.match(css,/@media\(max-width:760px\)\{\s*\.sidebar-collapse-toggle\{display:none\}/);
  assert.match(js,/localStorage\.setItem\(SIDEBAR_COLLAPSE_KEY/);
});
