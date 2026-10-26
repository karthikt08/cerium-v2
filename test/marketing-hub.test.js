import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {marketingInsights,draftMarketingCopy,marketingFollowUp} from '../public/js/marketing-model.js';
import {renderMarketingPage} from '../public/js/marketing-page.js';
import {routeFromHash,SECTIONS} from '../public/js/workspace-model.js';
import {answerGuide} from '../server/guide-assistant.js';
import {guideNavigationLinks,trustedGuideLink} from '../public/js/guide-links.js';

const today='2026-10-26';
const sample={
  account:{businessName:'Bright Services',trade:'garden care',timeZone:'UTC'},
  leads:[
    {id:'l1',name:'Alice',source:'Google Search',stage:'Booked'},
    {id:'l2',name:'Bobby',source:'Direct',stage:'New'},
    {id:'l3',name:'Cara',source:'Google Search',stage:'Done'}
  ],
  reviews:[
    {id:'r1',status:'Not Asked'}, {id:'r2',status:'Sent'},
    {id:'r3',status:'Reviewed'}, {id:'r4',status:'Reviewed'}
  ],
  invoices:[
    {id:'1',customerName:'Alice May',status:'Paid',paidAt:'2026-06-01',total:250},
    {id:'2',customerName:' alice   MAY ',status:'Paid',paidAt:'2026-07-02',total:75},
    {id:'3',customerName:'Blake',status:'Paid',paidAt:'2026-10-23',total:120},
    {id:'4',customerName:'Cora',status:'Overdue',issueDate:'2026-05-01',total:2500},
    {id:'5',customerName:'Drew',status:'Paid',paidAt:'2026-08-01',total:50}
  ],
  followUps:[
    {id:'f1',contactName:'Drew',done:false,dueDate:'2026-10-21'},
    {id:'f2',contactName:'Bobby',done:false,dueDate:'2026-10-29'},
    {id:'f3',contactName:'Cara',done:true,dueDate:'2026-10-21'}
  ]
};

test('Marketing is navigable through Cerium and supports three deep links',()=>{
  for(const segment of ['#marketing','#marketing/visibility','#marketing/reengage','#marketing/performance'])
    assert.equal(routeFromHash(segment),'marketing');
  assert.ok(SECTIONS.marketing);
  const html=fs.readFileSync(new URL('../public/app.html',import.meta.url),'utf8');
  assert.match(html,/data-nav="marketing"/);
  assert.match(html,/css\/marketing.css/);
  const customizer=fs.readFileSync(new URL('../public/js/workspace-customizer.js',import.meta.url),'utf8');
  assert.match(customizer,/key==='marketing'/);
  const app=fs.readFileSync(new URL('../public/js/app.js',import.meta.url),'utf8');
  assert.match(app,/s==='marketing'\?renderMarketingPage/);
  assert.match(app,/initializeMarketingUI/);
});

test('Marketing derives actual lead and review counts without inventing attribution',()=>{
  const r=marketingInsights(sample,today);
  assert.equal(r.totalLeads,3);
  assert.equal(r.bookedLeads,2);
  assert.deepEqual(r.sources,[{source:'Google Search',count:2},{source:'Direct',count:1}]);
  assert.equal(r.reviewRequests,3);
  assert.equal(r.reviewsReceived,2);
  assert.equal(r.reviewsNotAsked,1);
  assert.equal(r.pastPaidCustomers,3);
  assert.equal(r.repeatCustomers,1);
  assert.equal(r.dueFollowUps,1);
  assert.equal(r.attributionAvailable,false);
  assert.equal(r.candidates.length,1);
  assert.equal(r.candidates[0].name,'alice   MAY');
  assert.equal(r.candidates[0].paidInvoices,2);
  assert.ok(!r.candidates.some(x=>x.name==='Drew'));
  assert.ok(!r.candidates.some(x=>x.name==='Blake'));
});
test('Empty workspaces have zero metrics and no outreach candidates',()=>{
  const r=marketingInsights({account:{},leads:[],invoices:[],reviews:[],followUps:[]},today);
  assert.equal(r.totalLeads,0);
  assert.equal(r.reviewRequests,0);
  assert.equal(r.reviewsReceived,0);
  assert.deepEqual(r.sources,[]);
  assert.deepEqual(r.candidates,[]);
  assert.ok(r.priorities.length);
});
test('Rendering escapes customer data and only uses workspace count metrics',()=>{
  const malicious={...sample,leads:[{source:'<img src=x onerror=alert(1)>',stage:'New'}]};
  const html=renderMarketingPage(malicious);
  for(const label of ['Get found and chosen','Re-book and re-engage','Track performance','Marketing']){
    assert.ok(html.includes(label),label);
  }
  assert.ok(!html.includes('<img src=x onerror=alert(1)>'));
  assert.ok(html.includes('&lt;img'));
  assert.match(html,/No messages are sent automatically/);
  assert.match(html,/do not measure yet/);
  assert.doesNotMatch(html,/campaign ROI: [0-9]/);
});
test('Drafts are optional, editable, and do not promise unauthorized publishing',()=>{
  for(const kind of ['post','update','review','rebook']){
    const draft=draftMarketingCopy({kind,businessName:'Bright Services',service:'roof inspections'});
    assert.ok(draft.length>30);
    assert.match(draft,/Bright Services/);
    assert.doesNotMatch(draft,/guaranteed|automatically sent|5 stars/i);
  }
  const safe=draftMarketingCopy({kind:'review',businessName:'BRIGHT\nServices'});
  assert.ok(!safe.includes('BRIGHT\nServices'));
  assert.equal(draftMarketingCopy({kind:'unknown'}),'');
});
test('User-initiated marketing check-in produces normal follow-up task, not a message send',()=>{
  const task=marketingFollowUp({name:'Alice May'},{today});
  assert.equal(task.contactName,'Alice May');
  assert.equal(task.dueDate,today);
  assert.equal(task.channel,'Call');
  assert.match(task.task,/Confirm contact preferences/);
  assert.equal(task.email,undefined);
  assert.equal(task.send,undefined);
  assert.throws(()=>marketingFollowUp({name:''},{today}));
});
test('Assistant supplies verified clickable Marketing deep links and ordinary page links',async()=>{
  for(const [question,expected] of [
    ['Where can I re-book my old customers?','#marketing/reengage'],
    ['Show marketing performance and lead sources','#marketing/performance'],
    ['Where can I draft a social media post?','#marketing/visibility'],
    ['Where do I import Excel customers?','#leads'],
    ['How do I save an invoice PDF?','#invoices']
  ]){
    const answer=await answerGuide(question,'overview',{provider:'guide'});
    assert.ok(answer.links.some(l=>l.href===expected),question+' '+JSON.stringify(answer.links));
  }
});
test('Cross-tool workflows include several verified page links',async()=>{
  const answer=await answerGuide('How do I turn a lead into an invoice?','overview',{provider:'navlm'});
  assert.equal(answer.type,'workflow');
  assert.deepEqual(answer.links.map(x=>x.href),['#leads','#quotes','#jobs','#invoices','#payments']);
});
test('AI output, malformed links and unsupported prompts cannot create external URLs',async()=>{
  for(const href of ['javascript:alert(1)','https://evil.example','#admin','#marketing/../../admin','#marketing/unknown','//evil.example']){
    assert.equal(trustedGuideLink(href),null);
  }
  const malicious={type:'workflow',reply:'test',actions:[
    {section:'../../admin',href:'https://evil.example'},
    {section:'invoices',href:'javascript:alert(1)'}
  ]};
  assert.deepEqual(guideNavigationLinks(malicious,'test'),[{href:'#invoices',label:'Invoices'}]);
  const greeting=await answerGuide('hi','settings',{provider:'navlm'});
  assert.deepEqual(greeting.links,[]);
  const unknown=await answerGuide('frobnicate the platypus','settings',{provider:'guide'});
  assert.deepEqual(unknown.links,[]);
});
test('Assistant renders actual trusted same-app anchors instead of arbitrary AI text',()=>{
  const ui=fs.readFileSync(new URL('../public/js/guide-assistant.js',import.meta.url),'utf8');
  assert.match(ui,/document\.createElement\('a'\)/);
  assert.match(ui,/anchor\.href=trusted\.href/);
  assert.match(ui,/guideNavigationLinks/);
  assert.match(ui,/trustedGuideLink/);
  assert.doesNotMatch(ui,/anchor\.href=link\.href/);
});
