import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {conversationReply,unknownGuideResponse,conciseGuideResponse} from '../public/js/guide-dialogue.js';
import {pickGuide} from '../public/js/guide-knowledge.js';
import {isToolRecommendationRequest} from '../public/js/business-tool-advisor.js';
import {answerGuide} from '../server/guide-assistant.js';
import {startServer,signIn,ALICE} from './helpers.js';

test('greetings and social turns never navigate based on the current tab',async()=>{
  for(const question of ['hi','Hi!','hello','hey there','good morning','how are you','thanks','thank you','help','what can you do','wtf']){
    for(const provider of ['guide','navlm','openai','ollama']){
      let invoked=false;
      const reply=await answerGuide(question,'settings',{
        provider,apiKey:'test-key',lastSection:null,
        fetcher:async()=>{invoked=true;throw Error('No AI provider should handle a greeting');}
      });
      assert.equal(reply.section,null,question+' '+provider);
      assert.equal(reply.type,'conversation',question+' '+provider);
      assert.ok(reply.reply.length>10);
      assert.equal(invoked,false,question+' '+provider);
    }
  }
});

test('greeting followed by task still routes correctly',async()=>{
  const greeting=await answerGuide('Hi','settings',{provider:'navlm'});
  assert.equal(greeting.kind,'greeting');
  const next=await answerGuide('How do I download an invoice PDF?','overview',{provider:'guide'});
  assert.equal(next.section,'invoices');
  assert.match(next.reply,/invoice/i);
  assert.ok(next.reply.length<210,'Task answer should be compact');
});

test('follow-up questions use only last verified section, never current tab',async()=>{
  const reply=await answerGuide('How do I do that?','settings',{provider:'navlm',lastSection:'leads'});
  assert.equal(reply.kind,'followup');
  assert.equal(reply.section,'leads');
  assert.match(reply.reply,/import/i);
  const missing=await answerGuide('How do I do that?','settings',{provider:'navlm'});
  assert.equal(missing.section,null);
  assert.match(missing.reply,/which part/i);
  const injected=await answerGuide('How do I do that?','settings',{provider:'navlm',lastSection:'../../admin'});
  assert.equal(injected.section,null);
});

test('assistant never offers itself permission to modify records',async()=>{
  const result=await answerGuide('Can you do it for me?','invoices',{provider:'navlm',lastSection:'invoices'});
  assert.equal(result.kind,'permissions');
  assert.equal(result.section,'invoices');
  assert.match(result.reply,/can't change/i);
  const unknown=await answerGuide('frobnicate the platypus','settings',{provider:'guide'});
  assert.equal(unknown.type,'conversation');
  assert.equal(unknown.kind,'unknown');
  assert.equal(unknown.section,null);
  assert.match(unknown.reply,/wrong place/i);
});

test('specific task descriptions have one concise answer, not generic documentation twice',()=>{
  const pdf=conciseGuideResponse('download PDF',pickGuide('download PDF'));
  assert.equal(pdf.section,'invoices');
  assert.match(pdf.reply,/save PDF/);
  assert.ok(pdf.steps.includes('Print'));
  const importAnswer=conciseGuideResponse('upload Excel',pickGuide('upload Excel'));
  assert.equal(importAnswer.section,'leads');
  assert.match(importAnswer.reply,/map the columns/i);
  assert.equal(unknownGuideResponse().section,null);
});

test('natural business introductions trigger private tool advice without a paid API',async()=>{
  assert.equal(isToolRecommendationRequest('I run a small bakery'),true);
  assert.equal(isToolRecommendationRequest('I own a photography studio'),true);
  const rec=await answerGuide('I run a small bakery','overview',{
    provider:'guide',businessContext:{category:'other',trade:''},apiKey:''
  });
  assert.equal(rec.type,'tool_recommendations');
  assert.ok(rec.modules.includes('invoices'));
  assert.ok(rec.modules.includes('payments'));
});

test('assistant HTTP endpoint handles greetings and lastSection context safely',async()=>{
  const app=await startServer();
  try{
    const browser=app.browser();
    await signIn(app,browser,{profile:ALICE});
    const csrf=(await browser.me()).csrfToken;
    const body=async payload=>{
      const res=await browser.req('/api/assistant/message',{method:'POST',csrf,json:payload});
      assert.equal(res.status,200);
      return res.json();
    };
    const hello=await body({question:'hi',currentSection:'settings',lastSection:'invoices'});
    assert.equal(hello.section,null);
    assert.equal(hello.kind,'greeting');
    const followup=await body({question:'How do I do that?',currentSection:'settings',lastSection:'invoices'});
    assert.equal(followup.section,'invoices');
    const invalidContext=await body({question:'Where is it?',currentSection:'settings',lastSection:'../../admin'});
    assert.equal(invalidContext.section,null);
  }finally{await app.close();}
});

test('browser handles conversation and unknown answers without bogus navigation',()=>{
  const code=fs.readFileSync(new URL('../public/js/guide-assistant.js',import.meta.url),'utf8');
  assert.match(code,/lastSection/);
  assert.match(code,/conversationReply/);
  assert.match(code,/const conversational=result\.type==='conversation'/);
  assert.match(code,/progress\.textContent=safe\.reply/);
  assert.match(code,/suggestions\.hidden=/);
  assert.match(code,/renderGuideLinks\(safe,clean\)/);
  assert.match(code,/trustedGuideLink/);
  assert.doesNotMatch(code,/createInvoice|deleteInvoice|matchPayment/);
});

test('cross-feature workflows produce useful, verified navigation sequences',async()=>{
  const fromLead=await answerGuide('How do I turn a lead into an invoice?','overview',{provider:'navlm'});
  assert.equal(fromLead.type,'workflow');
  assert.deepEqual(fromLead.actions.map(item=>item.section),['leads','quotes','jobs','invoices','payments']);
  assert.equal(fromLead.section,null);
  const imported=await answerGuide('How do I import Excel contacts and send a quote?','overview',{provider:'guide'});
  assert.equal(imported.type,'workflow');
  assert.deepEqual(imported.actions.map(item=>item.section),['leads','quotes']);
  const scheduling=await answerGuide('How do I schedule a job and invoice it?','settings',{provider:'guide'});
  assert.equal(scheduling.type,'workflow');
  assert.deepEqual(scheduling.actions.map(item=>item.section),['jobs','invoices']);
  for(const step of [...fromLead.actions,...imported.actions,...scheduling.actions])
    assert.ok(['leads','quotes','jobs','invoices','payments'].includes(step.section));
});
