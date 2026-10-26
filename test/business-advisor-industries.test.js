import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {INDUSTRY_PROFILES,WORKSPACE_MODULES} from '../public/js/industry-workspaces.js';
import {CERIUM_INDUSTRY_PLAYBOOKS,SUPPORTED_INDUSTRY_IDS,identifyCeriumIndustry,recommendIndustryTools}
  from '../public/js/industry-advisor-playbooks.js';
import {isToolRecommendationRequest,recommendBusinessTools} from '../public/js/business-tool-advisor.js';
import {answerGuide} from '../server/guide-assistant.js';

const ALLOWED=new Set(WORKSPACE_MODULES.map(x=>x.id));
const cases=[
  ['construction','I run a construction renovation company',['quotes','jobs','invoices','payments']],
  ['plumbing','I run a plumbing service for home water heater repairs',['jobs','quotes','invoices','payments']],
  ['electrical','I run an electrical services company doing wiring',['jobs','quotes','invoices','payments']],
  ['hvac','I run an HVAC refrigeration service',['jobs','quotes','invoices','payments']],
  ['cleaning','I run a cleaning and property maintenance business',['jobs','invoices','payments','reviews']],
  ['landscaping','I run a landscaping and gardening business',['jobs','quotes','invoices','payments']],
  ['roofing','I run a roofing company',['leads','quotes','jobs','invoices']],
  ['painting','I run a house painting service',['quotes','jobs','invoices','payments']],
  ['handyman','I run a handyman home repair company',['jobs','invoices','quotes','payments']],
  ['consulting','I run a consulting and freelance business',['leads','quotes','followups','invoices']]
];

test('all and only the ten actual Cerium industry presets have detailed playbooks',()=>{
  const official=INDUSTRY_PROFILES.map(x=>x.id).sort();
  assert.equal(official.length,10);
  assert.deepEqual([...SUPPORTED_INDUSTRY_IDS].sort(),official);
  assert.deepEqual(Object.keys(CERIUM_INDUSTRY_PLAYBOOKS).sort(),official);
  for(const industry of official){
    const profile=CERIUM_INDUSTRY_PLAYBOOKS[industry];
    assert.ok(profile.title.length>12);
    assert.ok(profile.workflow.includes('→'),industry);
    assert.ok(profile.followUp.endsWith('?'),industry);
    assert.ok(profile.followUpOptions.length>=3,industry);
    assert.ok(profile.limitations.length,industry);
  }
});

test('every supported industry has distinct core tools and concrete reasons',()=>{
  const signatures=new Set();
  for(const [industry,question,essentials] of cases){
    assert.equal(isToolRecommendationRequest(question),true,question);
    const result=recommendBusinessTools({category:'other',description:question});
    assert.equal(result.industry,industry,question);
    assert.equal(result.type,'tool_recommendations');
    assert.equal(result.needsMoreInfo,false);
    assert.ok(result.reply.includes('your '),industry);
    assert.ok(result.workflow.length>40,industry);
    assert.match(result.reply,/Review the selection/);
    assert.deepEqual(result.recommendations.filter(x=>x.priority==='core').map(x=>x.id),essentials,industry);
    assert.ok(result.recommendations.some(x=>x.priority==='optional'),industry);
    assert.ok(result.modules.length<=6);
    assert.equal(result.recommendations.length,result.modules.length);
    assert.equal(new Set(result.modules).size,result.modules.length);
    for(const item of result.recommendations){
      assert.ok(ALLOWED.has(item.id),industry+': '+item.id);
      assert.ok(item.reason.length>=40,industry+': '+item.id+' '+item.reason);
      assert.ok(['core','optional'].includes(item.priority));
      assert.equal(typeof item.currentlyEnabled,'boolean');
    }
    signatures.add(essentials.join('|'));
  }
  // Construction, field repairs etc. may share tools but must not all use the same preset.
  assert.ok(signatures.size>=5);
});

test('selecting an official category generates useful advice even without a free-text description',()=>{
  for(const [id] of cases){
    const rec=recommendBusinessTools({category:id,description:'Which Cerium tools should I use for my business?'});
    assert.equal(rec.industry,id);
    assert.ok(rec.modules.length>=4);
    assert.equal(rec.needsMoreInfo,false);
  }
  const rec=recommendBusinessTools({category:'other',description:'Which tools should I use for my business?'});
  assert.equal(rec.needsMoreInfo,true);
});

test('a user-described new industry overrides saved industry, and unknown businesses stay cautious',()=>{
  const rec=recommendBusinessTools({
    category:'construction',trade:'Roofing',description:'I own a cleaning and maintenance company'
  });
  assert.equal(rec.industry,'cleaning');
  assert.ok(rec.modules.includes('reviews'));
  const unknown=recommendBusinessTools({description:'I run an unusual handmade candle business',category:'other'});
  assert.equal(unknown.needsMoreInfo,false);
  assert.ok(unknown.modules.includes('invoices'));
  const textile=recommendBusinessTools({description:'i run a typical textile shop. recommend whats useful for me'});
  assert.match(textile.reply,/textile shop/i);
  assert.ok(!textile.modules.includes('jobs'));
});

test('workflow modifiers promote the relevant tool, without inventing features',()=>{
  const hvac=recommendBusinessTools({
    category:'hvac',description:'We work on HVAC installations and chase overdue payments'
  });
  const reminders=hvac.recommendations.find(x=>x.id==='reminders');
  assert.ok(reminders);
  assert.equal(reminders.priority,'core');
  assert.match(reminders.reason,/overdue/i);
  const roofer=recommendBusinessTools({
    description:'I run a roofing company and follow up pending quotes'
  });
  assert.equal(roofer.industry,'roofing');
  assert.equal(roofer.recommendations.find(x=>x.id==='followups')?.priority,'core');
  const cleaner=recommendBusinessTools({
    description:'I run a cleaning company and want more new customer leads'
  });
  assert.equal(cleaner.industry,'cleaning');
  assert.equal(cleaner.recommendations.find(x=>x.id==='leads')?.priority,'core');
  for(const result of [hvac,roofer,cleaner]){
    assert.ok(result.modules.every(id=>ALLOWED.has(id)));
    assert.ok(result.modules.length<=6);
  }
});

test('industry detection handles natural phrasings outside exact dropdown names',()=>{
  for(const [id,phrase] of [
    ['construction','building and renovation'],
    ['plumbing','drain cleaning and pipe repairs'],
    ['electrical','rewiring electrical panels'],
    ['hvac','air conditioning and refrigeration'],
    ['cleaning','housekeeping and cleaning'],
    ['landscaping','lawn care and garden work'],
    ['roofing','roof replacement and gutters'],
    ['painting','exterior wall painting'],
    ['handyman','carpentry and furniture repair'],
    ['consulting','freelance design agency']
  ]){
    assert.equal(identifyCeriumIndustry({description:phrase}),id,phrase);
  }
});

test('assistant returns personalized industry advice without any external model calls',async()=>{
  let contacted=false;
  for(const [industry,question] of cases){
    const answer=await answerGuide(question,'overview',{
      provider:'openai',apiKey:'dummy-secret',businessContext:{category:'other'},
      fetcher:async()=>{contacted=true;throw Error('External inference was attempted');}
    });
    assert.equal(answer.industry,industry);
    assert.ok(answer.workflow);
  }
  assert.equal(contacted,false);
});

test('recommendation UI only shows allowlisted modules and keeps save explicit',()=>{
  const ui=fs.readFileSync(new URL('../public/js/guide-assistant.js',import.meta.url),'utf8');
  const prefs=fs.readFileSync(new URL('../public/js/workspace-customizer.js',import.meta.url),'utf8');
  assert.match(ui,/guide-business-workflow/);
  assert.match(ui,/guide-recommendation-priority/);
  assert.match(ui,/known\.has\(item\.id\)/);
  assert.match(ui,/cerium:review-tools/);
  assert.doesNotMatch(ui,/saveWorkspacePreferences/);
  assert.match(prefs,/api\.saveWorkspacePreferences/);
});
