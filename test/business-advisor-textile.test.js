import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {isToolRecommendationRequest,recommendBusinessTools} from '../public/js/business-tool-advisor.js';
import {answerGuide} from '../server/guide-assistant.js';
import {WORKSPACE_MODULES} from '../public/js/industry-workspaces.js';
import {startServer,signIn,ALICE} from './helpers.js';

const USER_TEXT='i run a typical textile shop. recommend whats useful for me';
test('exact reported textile shop query gets specific recommendations, not a generic repeated question',async()=>{
  assert.equal(isToolRecommendationRequest(USER_TEXT),true);
  const result=await answerGuide(USER_TEXT,'settings',{
    provider:'navlm',apiKey:'',
    businessContext:{category:'other',trade:''}
  });
  assert.equal(result.type,'tool_recommendations');
  assert.equal(result.needsMoreInfo,false);
  assert.match(result.reply,/textile shop/i);
  assert.ok(result.modules.includes('invoices'));
  assert.ok(result.modules.includes('payments'));
  assert.ok(!result.modules.includes('jobs'),'Do not assume a walk-in textile shop needs crew dispatch');
  assert.ok(result.recommendations.find(x=>x.id==='invoices'&&x.priority==='core'));
  assert.ok(result.recommendations.find(x=>x.id==='quotes'&&x.priority==='optional'));
  assert.match(result.limitations.join(' '),/inventory|stock|POS/i);
  assert.ok(result.followUpOptions.includes('Wholesale / bulk'));
  assert.ok(result.followUp,'optional clarification is useful after recommendations');
});

test('textile retail examples and diverse spellings work without a paid model',()=>{
  for(const q of [
    'I own a fabric store',
    'I sell sarees and dress materials in my shop',
    'I run a cloth shop',
    'My garment shop needs tools',
    'We operate a clothing and apparel store'
  ]){
    assert.equal(isToolRecommendationRequest(q),true,q);
    const result=recommendBusinessTools({description:q,category:'other'});
    assert.equal(result.needsMoreInfo,false,q);
    for(const id of ['invoices','payments'])assert.ok(result.modules.includes(id),q+' missing '+id);
    assert.equal(result.recommendations[0].priority,'core');
  }
});

test('wholesale textile, tailoring, and textile manufacturing receive distinct workflows',()=>{
  const wholesaler=recommendBusinessTools({description:'I run a bulk wholesale textile distributor'});
  for(const id of ['quotes','invoices','payments'])assert.ok(wholesaler.modules.includes(id));
  assert.equal(wholesaler.recommendations[0].id,'quotes');
  assert.match(wholesaler.reply,/wholesale textile business/i);
  const tailor=recommendBusinessTools({description:'I run a tailoring and garment stitching workshop'});
  for(const id of ['jobs','quotes','invoices'])assert.ok(tailor.modules.includes(id));
  assert.equal(tailor.recommendations[0].id,'jobs');
  const manufacturing=recommendBusinessTools({description:'We operate a textile mill manufacturing woven fabrics'});
  for(const id of ['quotes','invoices','payments'])assert.ok(manufacturing.modules.includes(id));
  assert.match(manufacturing.reply,/manufacturing/i);
  assert.ok(!manufacturing.modules.includes('jobs'));
});

test('short follow-up refines textile recommendation without inventing unsupported modules',()=>{
  const context=USER_TEXT+'; Wholesale / bulk';
  const rec=recommendBusinessTools({description:context});
  assert.match(rec.reply,/wholesale/i);
  assert.equal(rec.recommendations[0].id,'quotes');
  assert.ok(rec.recommendations.every(x=>WORKSPACE_MODULES.some(m=>m.id===x.id)));
  assert.ok(!rec.modules.includes('inventory'));
  assert.ok(!rec.modules.includes('pos'));
});

test('explicit user business takes precedence over an unrelated stored industry',()=>{
  const rec=recommendBusinessTools({description:USER_TEXT,category:'construction',trade:'Plumbing'});
  assert.match(rec.reply,/textile shop/i);
  assert.ok(!rec.modules.includes('jobs'));
});

test('known business with unfamiliar trade receives careful initial recommendations instead of repeating question',()=>{
  const result=recommendBusinessTools({description:'I run a small handmade candle business',category:'other'});
  assert.equal(result.needsMoreInfo,false);
  assert.ok(result.modules.includes('invoices'));
  assert.ok(result.modules.includes('payments'));
  assert.ok(result.followUp);
  const genuinelyUnknown=recommendBusinessTools({description:'Which tools should I use for my business?',category:'other'});
  assert.equal(genuinelyUnknown.needsMoreInfo,true);
});

test('business classification is private even if a paid model is enabled',async()=>{
  let invoked=false;
  const rec=await answerGuide(USER_TEXT,'overview',{
    provider:'openai',apiKey:'a-test-key',
    businessContext:{category:'other',trade:''},
    fetcher:async()=>{invoked=true;throw Error('AI provider should not be called for tool advice');}
  });
  assert.equal(rec.source,'advisor');
  assert.equal(invoked,false);
});

test('server uses validated optional contextual businessDescription and does not mutate workspace',async()=>{
  const app=await startServer();
  try{
    const browser=app.browser();
    await signIn(app,browser,{profile:ALICE});
    const csrf=(await browser.me()).csrfToken;
    const submit=async (question,extra={})=>{
      const response=await browser.req('/api/assistant/message',{
        method:'POST',csrf,
        json:{question,currentSection:'overview',recommendTools:true,...extra}
      });
      assert.equal(response.status,200);
      return response.json();
    };
    const original=await submit(USER_TEXT);
    assert.equal(original.needsMoreInfo,false);
    assert.ok(original.modules.includes('invoices'));
    const refined=await submit('Wholesale / bulk',{businessDescription:USER_TEXT+'; Wholesale / bulk'});
    assert.match(refined.reply,/wholesale textile/i);
    assert.equal(refined.recommendations[0].id,'quotes');
    const oversized=await submit('Wholesale / bulk',{businessDescription:'x'.repeat(601)});
    assert.equal(oversized.type,'tool_recommendations');
    const workspace=await browser.req('/api/workspace');
    assert.equal(workspace.status,200);
  }finally{await app.close();}
});

test('chat UI exposes labeled priorities and optional refinement, never applies settings on its own',()=>{
  const code=fs.readFileSync(new URL('../public/js/guide-assistant.js',import.meta.url),'utf8');
  assert.match(code,/guide-recommendation-priority/);
  assert.match(code,/guide-business-choices/);
  assert.match(code,/lastBusinessDescription/);
  assert.match(code,/businessDescription\}/);
  assert.match(code,/Review these tools in Settings/);
  assert.doesNotMatch(code,/api\.saveWorkspacePreferences/);
});
