import {test} from 'node:test';
import assert from 'node:assert/strict';
import {NAVLM_EXAMPLES,NAVLM_HOLDOUT} from '../server/navlm-data.js';
import {trainNavLM,classifyNavLM} from '../server/navlm-core.js';
import {navigateWithNavLM,evaluateNavLM} from '../server/navlm.js';
import {answerGuide} from '../server/guide-assistant.js';
import {GUIDE_SECTIONS} from '../public/js/guide-knowledge.js';
import fs from 'node:fs';

test('NavLM trains its vocabulary and labeled prototypes entirely locally',()=>{
  const model=trainNavLM(NAVLM_EXAMPLES);
  const count=Object.values(NAVLM_EXAMPLES).reduce((n,examples)=>n+examples.length,0);
  assert.ok(count>=290,'Sufficient initial labeled examples');
  assert.equal(model.prototypes.length,count);
  assert.ok(Object.keys(model.idf).length>200);
  assert.equal(model.algorithm,'tfidf-nearest-prototype');
  for(const label of Object.keys(NAVLM_EXAMPLES))if(label!=='unsupported')
    assert.ok(GUIDE_SECTIONS.includes(label),label+' must be an approved route');
});

test('NavLM validation questions achieve the minimum release accuracy',()=>{
  const result=evaluateNavLM(NAVLM_HOLDOUT);
  assert.equal(result.total,28);
  assert.ok(result.accuracy>=0.80,'Navigation validation accuracy '+result.correct+'/'+result.total+
    ' missed: '+result.results.filter(x=>x.expected!==x.predicted).map(x=>x.question+'=>'+x.predicted).join('; '));
});

test('NavLM recognizes core product tasks and returns existing route instructions',()=>{
  for(const [question,expected] of [
    ['I have 300 contacts in an Excel worksheet','leads'],
    ['Where can I download the PDF for an invoice?','invoices'],
    ['Send an automatic reminder about an unpaid bill','reminders'],
    ['Assign a crew to next Monday appointment','jobs'],
    ['I want to choose the modules that appear for me','settings']
  ]){
    const result=navigateWithNavLM(question);
    assert.equal(result.section,expected,question);
    assert.equal(result.source,'navlm');
    assert.ok(result.matched);
    assert.ok(result.steps);
  }
});

test('Unknown or unsafe prompts abstain rather than inventing routes or executing changes',()=>{
  for(const prompt of ['weather on mars','Please automatically erase every invoice','How do I cook risotto?','zxqv jklm qwerop']){
    const answer=navigateWithNavLM(prompt);
    assert.equal(answer.section,null,prompt);
    assert.equal(answer.matched,false,prompt);
    assert.equal(answer.steps,null,prompt);
  }
});

test('Cerium Guide can select NavLM with no API key and no network access',async()=>{
  let fetched=false;
  const answer=await answerGuide('I have 300 contacts in an Excel worksheet','overview',{
    provider:'navlm',apiKey:'',fetcher:async()=>{fetched=true;throw Error('Must not call network');}
  });
  assert.equal(answer.source,'navlm');
  assert.equal(answer.section,'leads');
  assert.equal(fetched,false);
  const uncertain=await answerGuide('zxqv jklm qwerop','overview',{provider:'navlm',apiKey:''});
  assert.equal(uncertain.source,'navlm');
  assert.equal(uncertain.section,null);
});

test('NavLM UI suppresses navigation on model abstention',()=>{
  const ui=fs.readFileSync(new URL('../public/js/guide-assistant.js',import.meta.url),'utf8');
  assert.match(ui,/result\.source==='navlm'&&result\.matched===false/);
  assert.match(ui,/renderGuideLinks\(safe,resolved\)/);
  assert.match(ui,/anchor\.href=trusted\.href/);
  assert.doesNotMatch(ui,/createInvoice|deleteInvoice|matchPayment/);
});
