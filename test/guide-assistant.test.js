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

test('self-hosted Qwen Ollama works without a paid API key',async()=>{
  let received;
  const response=await answerGuide('How do I make an invoice PDF?','overview',{
    provider:'ollama',model:'qwen3.5:4b',apiKey:'',
    fetcher:async(url,opts)=>{
      received={url,opts};
      return {ok:true,json:async()=>({done:true,message:{role:'assistant',content:'Open Invoices and preview the document to save a PDF.'}})};
    }
  });
  assert.equal(response.source,'ai');
  assert.equal(response.section,'invoices');
  assert.equal(received.url,'http://127.0.0.1:11434/api/chat');
  const sent=JSON.parse(received.opts.body);
  assert.equal(sent.model,'qwen3.5:4b');
  assert.equal(sent.think,false);
  assert.equal(sent.stream,false);
  assert.equal(sent.messages[1].content,'How do I make an invoice PDF?');
  assert.equal(received.opts.headers.Authorization,undefined);
});
test('Ollama rejects arbitrary hosts, HTTPS, credentials and query paths',async()=>{
  const {validateOllamaBaseURL}=await import('../server/guide-assistant.js');
  for(const host of ['https://127.0.0.1:11434','http://example.com:11434','http://192.168.0.5:11434','http://127.0.0.1:11434/evil','http://127.0.0.1:11434/?q=1','http://user:pass@127.0.0.1:11434']){
    assert.equal(validateOllamaBaseURL(host),null);
  }
  assert.equal(validateOllamaBaseURL('http://localhost:11434'),'http://localhost:11434');
  let called=false;
  const response=await answerGuide('Where are invoices?', 'overview',{
    provider:'ollama',ollamaBaseURL:'https://evil.example',fetcher:async()=>{called=true;return {ok:true};}
  });
  assert.equal(response.source,'guide');
  assert.equal(called,false);
});
test('local model errors gracefully use the guide without trying paid API',async()=>{
  let called=0;
  const response=await answerGuide('Where are invoices?','overview',{
    provider:'ollama',fetcher:async()=>{called++;throw Error('Connection refused');}
  });
  assert.equal(called,1);
  assert.equal(response.source,'guide');
  assert.equal(response.section,'invoices');
});
