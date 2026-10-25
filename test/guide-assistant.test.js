import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {GUIDE_SECTIONS,pickGuide} from '../public/js/guide-knowledge.js';
import {answerGuide,validateGuideQuestion} from '../server/guide-assistant.js';
import {startServer,signIn,ALICE} from './helpers.js';

test('guide covers current modules and recognizes intent',()=>{
  for(const section of ['overview','jobs','leads','quotes','followups','reminders','invoices','payments','reviews','settings','support'])
    assert.ok(GUIDE_SECTIONS.includes(section),section);
  assert.equal(pickGuide('How do I upload an Excel or CSV spreadsheet?').section,'leads');
  assert.equal(pickGuide('How can I create an invoice PDF?').section,'invoices');
  assert.equal(pickGuide('How can I customize my tools?').section,'settings');
  assert.equal(pickGuide('How do I schedule a job with a crew?').section,'jobs');
  assert.equal(pickGuide('How do I send a payment reminder?').section,'reminders');
  assert.equal(pickGuide('Unrecognized question','reviews').section,'reviews');
});
test('guide rejects invalid questions',()=>{
  for(const value of ['', ' '.repeat(12), 'a'.repeat(421), {}, '\u0000test'])assert.equal(validateGuideQuestion(value),false);
  assert.equal(validateGuideQuestion('Where are my invoices?'),true);
});
test('without AI key guide works and uses safe known routes',async()=>{
  const response=await answerGuide('I want to download a PDF','fake',{apiKey:''});
  assert.equal(response.source,'guide');
  assert.equal(response.section,'invoices');
  assert.match(response.steps,/Print/);
});
test('AI request contains the typed question, current section and static product guide',async()=>{
  let received;
  const result=await answerGuide('Where can I find leads?','overview',{
    apiKey:'test-key',
    fetcher:async(url,opts)=>{
      received={url,opts};
      return {ok:true,json:async()=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'Go to Leads to review new inquiries.'}]}]})};
    }
  });
  assert.equal(result.source,'ai');
  assert.equal(result.section,'leads');
  assert.equal(result.reply,'Go to Leads to review new inquiries.');
  const payload=JSON.parse(received.opts.body);
  assert.equal(received.url,'https://api.openai.com/v1/responses');
  assert.equal(payload.input,'Where can I find leads?');
  assert.equal(payload.store,false);
  assert.ok(!JSON.stringify(payload).includes('alice@example.com'));
});
test('provider failure safely returns the local guide',async()=>{
  const reply=await answerGuide('Please help with invoices','overview',{apiKey:'test-key',fetcher:async()=>({ok:false,status:503})});
  assert.equal(reply.source,'guide');
  assert.equal(reply.section,'invoices');
});
test('guide UI is linked and cannot call record writes',()=>{
  const html=fs.readFileSync(new URL('../public/app.html',import.meta.url),'utf8');
  const app=fs.readFileSync(new URL('../public/js/app.js',import.meta.url),'utf8');
  const guide=fs.readFileSync(new URL('../public/js/guide-assistant.js',import.meta.url),'utf8');
  assert.match(html,/css\/guide-assistant.css/);
  assert.match(app,/mountGuideAssistant/);
  assert.match(guide,/location\.hash/);
  assert.match(guide,/textContent=safe\.reply/);
  assert.doesNotMatch(guide,/createInvoice|updateInvoice|deleteInvoice|createLead|deleteLead|matchPayment/);
});
test('assistant endpoint requires login, origin, CSRF and validates question',async()=>{
  const t=await startServer();
  try{
    const guest=t.browser();
    const req={method:'POST',json:{question:'Where do I find invoices?',currentSection:'overview'}};
    assert.equal((await guest.req('/api/assistant/message',req)).status,401);
    const browser=t.browser();
    await signIn(t,browser,{profile:ALICE});
    assert.equal((await browser.req('/api/assistant/message',req)).status,403);
    const csrf=(await browser.me()).csrfToken;
    assert.equal((await browser.req('/api/assistant/message',{...req,csrf,origin:'https://invalid.example'})).status,403);
    const answer=await browser.req('/api/assistant/message',{...req,csrf});
    assert.equal(answer.status,200);
    assert.equal((await answer.json()).section,'invoices');
    const invalid=await browser.req('/api/assistant/message',{method:'POST',csrf,json:{question:'a'.repeat(421)}});
    assert.equal(invalid.status,400);
  }finally{await t.close();}
});
