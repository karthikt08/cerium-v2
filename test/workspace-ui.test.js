import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = p => fs.readFileSync(new URL('../public/' + p, import.meta.url), 'utf8');
test('workspace styling overrides the shared landing skin without changing it', () => {
  const html = read('app.html');
  assert.ok(html.indexOf('css/workspace.css') > html.indexOf('css/spatial.css'));
  assert.match(html, /src="js\/workspace-ui.js" defer/);
  assert.match(html, /src="js\/cursor.js" defer/);
});
test('all eight workspace sections and application modules remain available', () => {
  const html = read('app.html');
  for (const id of ['today','leads','followups','invoices','bank','reviews','account','messages']) {
    assert.ok(html.includes('id="view-' + id + '"'));
  }
  for (const file of ['api','billing','app']) assert.ok(html.includes('src="js/' + file + '.js"'));
});
test('product layer includes mobile, keyboard focus and reduced motion support', () => {
  const css = read('css/workspace.css');
  assert.match(css, /max-width:760px/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /\.pg \.grid-bg \{ display:block!important; \}/);
  assert.match(css, /:focus-visible/);
  assert.match(read('js/workspace-ui.js'), /el.tabIndex = 0/);
});
test('workspace navigation and dashboard have a clear hierarchy', () => {
  const html = read('app.html');
  for (const group of ['Overview','Customers','Money','Reputation','Workspace']) {
    assert.ok(html.includes('class="sb-section-label">' + group + '</p>'));
  }
  assert.match(html, /class="sb-footer">\s*<button class="side-link" type="button" data-action="logout"/);
  assert.doesNotMatch(html.match(/<header class="top-cmd-bar">[\s\S]*?<\/header>/)?.[0] || '', /data-action="logout"/);
  assert.match(html, /class="section-heading"><h2>Needs your attention<\/h2>/);
  assert.match(read('css/workspace.css'), /\.pg \.pillars-grid \{ grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});
test('long workspace content scrolls independently and tab changes reset its position', () => {
  const css = read('css/workspace.css');
  assert.match(css, /\.pg \.workspace-shell \{[^}]*height:100dvh;[^}]*overflow:hidden/);
  assert.match(css, /\.pg \.app-body \{[^}]*overflow-y:auto/);
  assert.match(css, /\.pg \.app-body::-webkit-scrollbar-thumb/);
  assert.match(css, /@media\(max-width:760px\)[^\n]*\.pg \.app-body \{ overflow:visible/);
  assert.match(read('js/app.js'), /contentPane\.scrollTop = 0/);
});
