import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../public/'+p,import.meta.url),'utf8');

test('quotes navigation and premium quote builder are connected to the workspace',()=>{
  const html=read('app.html'),app=read('js/app.js'),ui=read('js/quotes-page.js');
  assert.match(html,/data-nav="quotes"/);
  assert.match(html,/css\/quotes\.css/);
  assert.match(app,/renderQuotesPage/);
  assert.match(app,/initializeQuotesUI/);
  assert.match(ui,/Create approval link/);
  assert.match(ui,/Schedule job/);
  assert.match(ui,/consent|email|customer/i);
});
test('leads offer a direct quote action and approved estimates do not send email automatically',()=>{
  const app=read('js/app.js'),ui=read('js/quotes-page.js');
  assert.match(app,/data-action="new-quote"/);
  assert.match(app,/cerium:new-quote/);
  assert.match(ui,/Copy approval link/);
  assert.match(ui,/nothing is emailed|No email is sent automatically|nothing was emailed/i);
});
