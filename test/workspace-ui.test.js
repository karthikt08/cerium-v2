import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {renderCategoryNavigation,renderUtilityNavigation} from '../public/js/workspace-navigation.js';
import {WORKSPACE_CATEGORIES} from '../public/js/workspace-registry.js';
const read = p => fs.readFileSync(new URL('../public/' + p, import.meta.url), 'utf8');
test('rebuilt app has one visual system and loads its real controller',()=>{
 const html=read('app.html');
 assert.match(html,/css\/workspace.css/);
 assert.doesNotMatch(html,/css\/(?:app|spatial).css|workspace-ui.js/);
 assert.match(html,/type="module" src="js\/app.js"/);
 assert.match(html,/src="js\/workspace-cursor.js"/);
});
test('every navigation destination has an accessible named link',()=>{
 const html=read('app.html');
 const navigation=renderCategoryNavigation()+renderUtilityNavigation();
 for(const category of WORKSPACE_CATEGORIES){assert.ok(navigation.includes('data-category="'+category.id+'"'));assert.ok(navigation.includes('aria-label="'));}
 for(const utility of ['settings','settings/tools','support'])assert.ok(navigation.includes('data-nav="'+utility+'"'));
 assert.match(html,/id="category-navigation"/);
 assert.match(html,/aria-controls="sidebar"/);
 assert.match(html,/id="workspace-main" tabindex="-1"/);
});
test('no duplicate static IDs and every form dialog has a title',()=>{
 const html=read('app.html');const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size);
 for(const d of [...html.matchAll(/<dialog([^>]+)>/g)])assert.match(d[1],/aria-labelledby="[^"]+"/);
});
test('main, navigation and table scroll regions retain native scrolling',()=>{
 const css=read('css/workspace.css');
 assert.match(css,/\.content-scroll\{overflow:auto/);
 assert.match(css,/\.navigation-scroll\{overflow:auto/);
 assert.match(css,/\.table-scroll\{overflow:auto/);
 assert.match(css,/scrollbar-color/);assert.match(css,/@media\(max-width:760px\)/);assert.match(css,/prefers-reduced-motion:reduce/);
});

test('lead cards on pipeline board include edit and delete buttons',()=>{
 const appJs=read('js/app.js');
 assert.match(appJs,/<article class="lead-card"[^>]*>[\s\S]*?data-action="edit"[^>]*data-kind="lead"/);
 assert.match(appJs,/<article class="lead-card"[^>]*>[\s\S]*?data-action="delete"[^>]*data-kind="lead"[\s\S]*?icon\('close'\)/);
});


test('desktop sidebar collapses to an accessible icon rail without changing mobile navigation',()=>{
 const html=read('app.html'),css=read('css/workspace.css'),js=read('js/app.js');
 assert.match(html,/id="sidebar-collapse-toggle"[^>]*aria-controls="sidebar"[^>]*aria-expanded="true"[^>]*aria-label="Collapse sidebar"/);
 assert.match(html,/class="sidebar-top"/);
 assert.match(html,/class="signout-label">Sign out<\/span>/);
 assert.match(css,/@media\(min-width:761px\)/,'compact rail only on desktop');
 assert.match(css,/\.app-page \.workspace\.sidebar-collapsed\{grid-template-columns:76px minmax\(0,1fr\)\}/);
 assert.match(css,/\.workspace\.sidebar-collapsed \.nav-link>span\{display:none\}/);
 assert.match(css,/\.workspace\.sidebar-collapsed \.sidebar-top \.brand>span\{[^}]*max-width:0;opacity:0;visibility:hidden/,'brand text smoothly shrinks instead of snapping out');
 assert.match(css,/\.workspace\.sidebar-collapsed \.signout-label\{display:none\}/);
 assert.match(css,/@media\(max-width:760px\)\{\s*\.sidebar-collapse-toggle\{display:none\}/,'mobile uses existing drawer');
 assert.match(js,/const SIDEBAR_COLLAPSE_KEY='cerium\.sidebar\.collapsed'/);
 assert.match(js,/localStorage\.getItem\(SIDEBAR_COLLAPSE_KEY\)/);
 assert.match(js,/localStorage\.setItem\(SIDEBAR_COLLAPSE_KEY,value\?'1':'0'\)/);
 assert.match(js,/setSidebarCollapsed\(saved\)/);
 assert.match(js,/link\.setAttribute\('aria-label',name\);link\.title=name/,'icon-only destinations stay named and discoverable');
 assert.match(js,/toggle\.setAttribute\('aria-expanded',String\(!value\)\)/);
 assert.match(js,/function openNavigation\(\)/,'existing mobile drawer remains');
 assert.match(js,/function closeNavigation\(\)/);
 assert.match(js,/window\.addEventListener\('resize'/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/,'transition can be disabled');
});

test('collapsed desktop sidebar hides scrollbar chrome but remains scrollable',()=>{
 const css=read('css/workspace.css');
 const bothModesRule=/\.app-page \.sidebar \.navigation-scroll\{([^}]*)\}/.exec(css);
 assert.ok(bothModesRule,'expanded and collapsed nav share the hidden scrollbar rule');
 assert.match(bothModesRule[1],/overflow-y:auto/,'wheel, touch and keyboard scroll still work');
 assert.match(bothModesRule[1],/scrollbar-width:none/,'hide the Firefox scrollbar');
 assert.match(bothModesRule[1],/-ms-overflow-style:none/,'hide the legacy scrollbar');
 assert.match(css,/\.app-page \.sidebar \.navigation-scroll::-webkit-scrollbar\{[^}]*display:none/,'hide WebKit/Chromium scrollbar chrome');
 assert.match(css,/\.navigation-scroll\{overflow:auto/,'base sidebar remains scrollable');
});
