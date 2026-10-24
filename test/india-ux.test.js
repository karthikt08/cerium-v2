// Indian edition UX wiring: backend integration is tested in india-edition.test.js.
// These checks keep the customer-facing UI visibly connected to saved account market.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=relative=>readFileSync(new URL('../'+relative,import.meta.url),'utf8');

test('workspace header displays persisted market and currency',()=>{
  const html=read('public/app.html');
  const js=read('public/js/app.js');
  assert.match(html,/id="edition-label"/);
  assert.match(html,/id="edition-chip"/);
  assert.match(js,/edition-chip/);
  assert.match(js,/edition-label/);
  assert.match(js,/document\.body\.dataset\.edition/);
  assert.match(js,/a\.country==='IN'&&a\.currency==='INR'/);
});

test('India onboarding and unsaved edition selection are explained clearly',()=>{
  const js=read('public/js/app.js');
  assert.match(js,/INDIA EDITION ACTIVE/);
  assert.match(js,/GST\/UPI draft fields/);
  assert.match(js,/Click Save changes to activate/);
  assert.match(js,/id="edition-save-hint"/);
  assert.match(js,/Saved edition:/);
});

test('Indian business forms do not demand US postal addresses',()=>{
  for(const file of ['public/js/app.js','public/js/jobs-page.js','public/js/quotes-page.js']){
    const source=read(file);
    assert.match(source,/Street, area, city, state, PIN/,file);
  }
  assert.match(read('public/js/app.js'),/\+91 98765 43210/);
});

test('signed-in marketing page pricing uses stored workspace country',()=>{
  const source=read('public/js/region-pricing.js');
  assert.match(source,/\/api\/me/);
  assert.match(source,/account\?\.signedIn/);
  assert.match(source,/account\.user\?\.country/);
  assert.match(source,/\/api\/region/);
});
