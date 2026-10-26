import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {WORKSPACE_MODULES} from '../public/js/industry-workspaces.js';
import {isToolRecommendationRequest,recommendBusinessTools} from '../public/js/business-tool-advisor.js';
import {answerGuide} from '../server/guide-assistant.js';
import {startServer,signIn,ALICE} from './helpers.js';

test('business advisory intent is distinct from ordinary feature navigation',()=>{
  for(const q of ['Which Cerium tools should I use for my business?',
    'Recommend tools for my photography studio',
    'Set up my business workspace',
    'I run a small boutique. What tools do I need?'])
    assert.equal(isToolRecommendationRequest(q),true,q);
  for(const q of ['How do I create an invoice?',
    'Where can I upload Excel?',
    'How do I customize my tools?',
    'What time is it?'])
    assert.equal(isToolRecommendationRequest(q),false,q);
});

test('custom mobile pet grooming gets reasoned appointments and billing suggestions',()=>{
  const rec=recommendBusinessTools({
    description:'I run a mobile dog grooming service and book appointments, invoice customers, and request reviews',
    category:'other'
  });
  assert.equal(rec.type,'tool_recommendations');
  assert.equal(rec.source,'advisor');
  assert.equal(rec.needsMoreInfo,false);
  for(const id of ['jobs','invoices','reviews'])assert.ok(rec.modules.includes(id),id);
  for(const item of rec.recommendations){
    assert.ok(item.label);
    assert.ok(item.reason.length>12);
  }
  assert.match(rec.reply,/Nothing has been changed/);
});

test('retail shop recommendations never fabricate POS, orders or inventory modules',()=>{
  const rec=recommendBusinessTools({trade:'Clothing boutique and walk-in retail shop'});
  assert.ok(rec.modules.includes('invoices'));
  assert.ok(rec.modules.includes('payments'));
  assert.ok(!rec.modules.includes('jobs'),'Retail should not have contractor dispatch by default');
  assert.ok(rec.limitations.some(x=>/point-of-sale/.test(x)));
  const allowed=new Set(WORKSPACE_MODULES.map(x=>x.id));
  assert.ok(rec.recommendations.every(x=>allowed.has(x.id)));
});

test('independent service examples receive relevant distinct module priorities',()=>{
  const agent=recommendBusinessTools({trade:'Marketing agency',description:'We send client proposals and follow up with prospects'});
  for(const id of ['quotes','followups','leads'])assert.ok(agent.modules.includes(id));
  const construction=recommendBusinessTools({category:'construction',description:'We bid on renovations and schedule our crew'});
  assert.ok(construction.modules.includes('quotes'));
  assert.ok(construction.modules.includes('jobs'));
  assert.ok(construction.modules.length<=6);
  assert.ok(construction.recommendations.some(x=>x.reason.includes('described')));
});

test('custom business without workflows requests more detail rather than suggesting everything',()=>{
  const rec=recommendBusinessTools({category:'other',description:'Which tools should I use for my business?'});
  assert.equal(rec.needsMoreInfo,true);
  assert.deepEqual(rec.modules,[]);
  assert.deepEqual(rec.recommendations,[]);
  assert.match(rec.reply,/what kind of business/i);
});

test('recommendations use saved category and trade without auto-applying preferences',()=>{
  const rec=recommendBusinessTools({category:'other',trade:'Tutor offering weekly music lessons',
    description:'I schedule clients and take payments',enabledModules:['payments']});
  assert.ok(rec.modules.includes('jobs'));
  assert.ok(rec.recommendations.find(x=>x.id==='payments')?.currentlyEnabled);
  assert.equal(rec.category,'other');
});

test('recommendations are computed privately and bypass paid providers',async()=>{
  let externalCalled=false;
  const advice=await answerGuide('Which tools suit my small bakery?', 'overview',{
    provider:'openai',apiKey:'test-key',
    businessContext:{category:'other',trade:'Bakery'},
    fetcher:async()=>{externalCalled=true;throw Error('Must never call a remote model');}
  });
  assert.equal(advice.source,'advisor');
  assert.equal(externalCalled,false);
  assert.ok(advice.modules.includes('payments'));
});

test('assistant tool recommendation endpoint retains CSRF and authentication protections',async()=>{
  const app=await startServer();
  try{
    const payload={method:'POST',json:{
      question:'Which tools are ideal for my custom bakery and its walk-in customers?',
      currentSection:'overview',recommendTools:true
    }};
    assert.equal((await app.browser().req('/api/assistant/message',payload)).status,401);
    const user=app.browser();
    await signIn(app,user,{profile:ALICE});
    assert.equal((await user.req('/api/assistant/message',payload)).status,403);
    const csrf=(await user.me()).csrfToken;
    const result=await user.req('/api/assistant/message',{...payload,csrf});
    assert.equal(result.status,200);
    const response=await result.json();
    assert.equal(response.type,'tool_recommendations');
    assert.ok(response.modules.includes('payments'));
    assert.ok(response.recommendations.every(item=>WORKSPACE_MODULES.some(x=>x.id===item.id)));
    assert.ok(response.recommendations.length<=6);
  }finally{await app.close();}
});

test('UI displays safe labels and requires an explicit save action',()=>{
  const assistant=fs.readFileSync(new URL('../public/js/guide-assistant.js',import.meta.url),'utf8');
  const customizer=fs.readFileSync(new URL('../public/js/workspace-customizer.js',import.meta.url),'utf8');
  assert.match(assistant,/renderToolRecommendations/);
  assert.match(assistant,/name\.textContent=known\.get\(item\.id\)\.label/);
  assert.match(assistant,/new CustomEvent\('cerium:review-tools'/);
  assert.match(customizer,/requested\.some\(id=>!allowed\.has\(id\)\)/);
  assert.match(customizer,/Save my workspace to apply them/);
  assert.match(customizer,/api\.saveWorkspacePreferences/);
  assert.doesNotMatch(assistant,/api\.saveWorkspacePreferences/);
});
