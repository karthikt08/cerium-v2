import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('landing and workspace load the exact same magnetic cursor controller',()=>{
  const landing=read('public/index.html');
  const workspace=read('public/app.html');
  assert.match(landing,/<script src="js\/workspace-cursor\.js" defer><\/script>/);
  assert.match(workspace,/<script src="js\/workspace-cursor\.js" defer><\/script>/);
  assert.doesNotMatch(landing,/<script src="js\/cursor\.js"/);
  assert.match(landing,/<link rel="stylesheet" href="css\/landing-workspace-cursor\.css">/);
});
test('landing magnetic cursor matches workspace styles and respects input, reduced-motion, print',()=>{
  const workspace=read('public/css/workspace.css');
  const landing=read('public/css/landing-workspace-cursor.css');
  const actual=workspace.split('\n').find(line=>line.startsWith('.workspace-cursor{'));
  const expected=actual.slice(0,actual.indexOf('.btn{'));
  assert.ok(landing.includes(expected),'the cursor ring CSS should be byte-identical to workspace CSS');
  assert.match(landing,/prefers-reduced-motion/);
  assert.match(landing,/@media print/);
  const cursor=read('public/js/workspace-cursor.js');
  assert.match(cursor,/pointerType==='touch'/);
  assert.match(cursor,/targetAtPointer/);
  assert.match(cursor,/document\.addEventListener\('keydown'/);
  assert.match(cursor,/document\.addEventListener\('scroll'/);
});
