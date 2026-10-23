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


test('estimate cards have exactly one primary next-step action and delete is under More',async()=>{
  const {renderQuotesPage}=await import('../public/js/quotes-page.js');
  const states=['Draft','Sent','Accepted','Converted','Declined'];
  const ws={
    account:{currency:'USD'},
    quotes:states.map((status,i)=>({
      id:'quote-'+i+'1234567',status,title:'AC repair '+i,customerName:'Taylor',
      customerEmail:'test@example.com',currency:'USD',
      items:[{description:'Labor',qty:1,rate:50}],total:50,
      createdAt:'2026-10-23T09:00:00Z',jobId:status==='Converted'?'job-1':null,
    })),
  };
  const html=renderQuotesPage(ws);
  assert.equal([...html.matchAll(/<article class="quote-card"/g)].length,5);
  assert.equal([...html.matchAll(/<details class="quote-more"/g)].length,5);
  const groups=[...html.matchAll(/<div class="quote-action-group">([\s\S]*?)<\/div>/g)].map(m=>m[1]);
  assert.equal(groups.length,5);
  for (const [i,action] of ['share','copy','convert','view-job',null].entries()) {
    const primary=[...groups[i].matchAll(/class="button primary quote-action-button"/g)];
    assert.equal(primary.length,action?1:0,states[i]);
    if(action)assert.match(groups[i],new RegExp('data-quote-action="'+action+'"'));
  }
  assert.match(groups[0],/data-quote-action="edit"/);
  assert.match(groups[2],/data-quote-action="copy"/);
  assert.doesNotMatch(groups.join(' '),/data-quote-action="delete"/);
  assert.equal([...html.matchAll(/<div class="quote-more-menu">/g)].length,5);
  assert.match(html,/Customer accepted · schedule an appointment/);
  const readOnly=renderQuotesPage(ws,true);
  assert.doesNotMatch(readOnly,/data-quote-action="delete"|data-quote-action="convert"/);
});

test('quotes have mobile-sized form actions and the More menu is keyboard focusable',()=>{
  const css=read('css/quotes.css');
  assert.match(css,/\.quote-action-group\{display:grid/);
  assert.match(css,/\.quote-more summary\{display:flex/);
  assert.match(css,/\.quotes-modal-actions\{position:sticky/);
  assert.match(css,/@media\(max-width:520px\)/);
  assert.match(css,/\.quote-item label:first-child\{grid-column:1 \/ -1\}/);
  assert.match(css,/:focus-visible/);
});
