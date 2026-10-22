import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = p => fs.readFileSync(new URL('../public/' + p, import.meta.url), 'utf8');
test('workspace styling overrides the shared landing skin without changing it', () => {
  const html = read('app.html');
  assert.ok(html.indexOf('css/workspace.css') > html.indexOf('css/spatial.css'));
  assert.match(html, /src="js\/workspace-ui.js" defer/);
  assert.doesNotMatch(html, /src="js\/cursor.js"/);
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
  assert.match(css, /:focus-visible/);
  assert.match(read('js/workspace-ui.js'), /el.tabIndex = 0/);
});
