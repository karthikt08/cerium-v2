import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
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
 for(const name of ['overview','leads','followups','invoices','payments','reviews','settings','support'])assert.match(html,new RegExp(`data-nav="${name}"`));
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
