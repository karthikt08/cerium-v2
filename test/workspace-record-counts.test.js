import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {WORKSPACE_FEATURES,resolveWorkspaceRoute} from '../public/js/workspace-registry.js';
import {featureRecordCount} from '../public/js/workspace-counts.js';
import {renderCategoryNavigation,renderFeatureWorkspace,updateCategoryNavigation} from '../public/js/workspace-navigation.js';
import {filteredRows,metrics} from '../public/js/workspace-model.js';

const feature=id=>WORKSPACE_FEATURES.find(f=>f.id===id);
const sample=()=>{
  const leads=Array.from({length:14},(_,i)=>({
    id:String(i+1),name:'Lead '+(i+1),stage:i<9?'New':'Done',source:'Direct'
  }));
  return {
    account:{country:'IN',currency:'INR',timeZone:'Asia/Kolkata'},
    leads,
    followUps:[{id:'f1',contactName:'Client',task:'Call',dueDate:'2026-10-25',done:false},
      {id:'f2',contactName:'Client',task:'Renewal',dueDate:'2026-11-10',done:false}],
    quotes:[{id:'q1'},{id:'q2'},{id:'q3'}],
    jobs:[{id:'j1'},{id:'j2'}],
    crew:[{id:'c1'},{id:'c2',active:false}],
    invoices:[{id:'i1',status:'Paid'},{id:'i2',status:'Sent'},{id:'i3',status:'Overdue'}],
    reminders:[{id:'r1',status:'scheduled'}],
    reviews:[{id:'v1',status:'Not Asked'},{id:'v2',status:'Reviewed'}],
    bankTransactions:[{id:'b1',status:'pending_match'},{id:'b2',status:'matched'}]
  };
};
const fakeSidebar=()=>{
  const all=[];
  for(const cat of ['overview','customers','field','billing','marketing','team','insights']){
    const badge={textContent:'',hidden:true,title:'',setAttribute(k,v){this[k]=v;}};
    const link={dataset:{category:cat},hidden:false,href:'',title:'',badge,
      attributes:{},setAttribute(k,v){this.attributes[k]=v;},removeAttribute(k){delete this.attributes[k];},
      querySelector(q){return q==='[data-category-count]'?badge:null;}};
    all.push(link);
  }
  return {all,root:{querySelectorAll:()=>all},get:id=>all.find(x=>x.dataset.category===id)};
};

test('a CRM badge means total lead records, not active leads plus due follow-ups',()=>{
  const ws=sample();
  assert.equal(metrics(ws,'2026-10-27').leads,9);
  assert.equal(metrics(ws,'2026-10-27').due,1);
  assert.equal(ws.leads.length,14);
  assert.deepEqual(featureRecordCount(feature('leads'),ws),{count:14,label:'14 leads'});
  assert.equal(filteredRows('leads',ws,{query:'',status:'All',source:'All'}).length,14);
  assert.equal(filteredRows('leads',ws,{query:'',status:'New',source:'All'}).length,9);
  const nav=fakeSidebar();
  updateCategoryNavigation(nav.root,{workspace:ws,route:feature('leads'),modules:['leads','followups','quotes'],lastUsed:{}});
  const crm=nav.get('customers');
  assert.equal(crm.badge.textContent,'14');
  assert.equal(crm.badge.hidden,false);
  assert.equal(crm.badge['aria-hidden'],'true');
  assert.equal(crm.href,'#customers/leads');
  assert.match(crm.attributes['aria-label'],/14 leads in Leads/);
  assert.doesNotMatch(crm.attributes['aria-label'],/active|due/i);
});

test('category count always refers to the actual tab linked by its sidebar entry',()=>{
  const ws=sample(),modules=['leads','followups','quotes','invoices','payments','reminders','reviews','jobs'];
  const nav=fakeSidebar(),update=(route,lastUsed={})=>{
    updateCategoryNavigation(nav.root,{workspace:ws,route,modules,lastUsed});
  };
  update(feature('leads'));
  assert.equal(nav.get('billing').href,'#billing/invoices');
  assert.equal(nav.get('billing').badge.textContent,'3');
  assert.match(nav.get('billing').title,/3 invoices in Invoices/);
  assert.equal(nav.get('marketing').badge.textContent,'');
  assert.equal(nav.get('marketing').badge.hidden,true);
  assert.equal(nav.get('field').badge.hidden,true);
  assert.equal(nav.get('insights').badge.hidden,true);
  update(feature('followups'),{billing:'payments',marketing:'reviews'});
  assert.equal(nav.get('customers').badge.textContent,'2');
  assert.equal(nav.get('customers').href,'#customers/followups');
  assert.equal(nav.get('billing').badge.textContent,'1');
  assert.equal(nav.get('billing').href,'#billing/payments');
  assert.equal(nav.get('marketing').badge.textContent,'2');
  assert.equal(nav.get('marketing').href,'#marketing/reviews');
  update(feature('invoices'),{customers:'quotes',billing:'invoices'});
  assert.equal(nav.get('customers').badge.textContent,'3');
  assert.equal(nav.get('customers').href,'#customers/quotes');
  assert.equal(nav.get('billing').badge.textContent,'3');
});

test('every list-based feature uses precisely the same underlying record definition',()=>{
  const ws=sample();
  const expected={
    leads:[14,'14 leads'],followups:[2,'2 follow-ups'],quotes:[3,'3 estimates'],
    invoices:[3,'3 invoices'],payments:[1,'1 paid invoice'],
    reminders:[1,'1 reminder'],bank:[1,'1 unmatched deposit'],
    reviews:[2,'2 review requests'],crew:[2,'2 crew members']
  };
  for(const [id,[count,label]] of Object.entries(expected)){
    assert.deepEqual(featureRecordCount(feature(id),ws),{count,label},id);
  }
  for(const id of ['overview','schedule','dispatch','crew-assignments','assignments','visibility','reengage','performance','business','sales','revenue']){
    assert.equal(featureRecordCount(feature(id),ws),null,id+' must not imply a fabricated record total');
  }
});

test('tab badges share their totals with sidebar badge and have a descriptive accessible label',()=>{
  const ws=sample(),route=resolveWorkspaceRoute('#customers/leads');
  const html=renderFeatureWorkspace(route,['leads','followups','quotes'],'<div>Real leads table</div>',ws);
  assert.match(html,/role="tablist"/);
  assert.match(html,/workspace-feature-count" aria-hidden="true">14<\/span>/);
  assert.match(html,/aria-label="Leads · 14 leads"/);
  assert.match(html,/aria-label="Follow-ups · 2 follow-ups"/);
  assert.match(html,/aria-label="Estimates &amp; Quotes · 3 estimates"/);
  assert.match(html,/Real leads table/);
  const source=fs.readFileSync(new URL('../public/js/app.js',import.meta.url),'utf8');
  assert.match(source,/workspace:state\.ws/);
  assert.match(source,/renderFeatureWorkspace\(state\.route,state\.ws\.account\.workspacePreferences\?\.modules,content,state\.ws\)/);
  assert.doesNotMatch(source,/customers:m\.leads\+m\.due/);
});

test('zero-count records do not show confusing empty badges; no workspace data is safe',()=>{
  const ws={account:{},leads:[],followUps:[],quotes:[],invoices:[],reviews:[],reminders:[],crew:[],bankTransactions:[]};
  assert.deepEqual(featureRecordCount(feature('leads'),ws),{count:0,label:'0 leads'});
  assert.equal(featureRecordCount(feature('leads'),null),null);
  const nav=fakeSidebar();
  updateCategoryNavigation(nav.root,{workspace:ws,route:feature('leads'),modules:['leads'],lastUsed:{}});
  assert.equal(nav.get('customers').badge.hidden,true);
  assert.equal(nav.get('customers').badge.textContent,'');
  const html=renderFeatureWorkspace(feature('leads'),['leads'],'empty workspace',ws);
  assert.doesNotMatch(html,/workspace-feature-count/);
});

test('filtered result footers explain shown versus total records rather than imply data loss',()=>{
  const app=fs.readFileSync(new URL('../public/js/app.js',import.meta.url),'utf8');
  assert.match(app,/const total=state\.ws\[kindKey\[singular\[kind\]\]\]\?\.length\|\|0/);
  assert.match(app,/rows\.length\} of \$\{total\} records shown/);
  assert.match(app,/Filters never delete saved records/);
  assert.match(app,/const recordLabel=rows\.length===total/);
  assert.match(app,/insertAdjacentHTML\('beforeend',\x60<div class="result-footer"><span>\$\{recordLabel\}/);
  const css=fs.readFileSync(new URL('../public/css/workspace-navigation.css',import.meta.url),'utf8');
  assert.match(css,/\.workspace-feature-count/);
  assert.match(css,/font-variant-numeric:tabular-nums/);
  const nav=renderCategoryNavigation();
  assert.match(nav,/data-category-count="customers"/);
});
