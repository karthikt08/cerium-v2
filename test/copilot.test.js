import {test} from 'node:test';
import assert from 'node:assert/strict';
import {copilotIntent,answerCopilot} from '../server/copilot.js';
import {guideNavigationLinks,trustedGuideLink} from '../public/js/guide-links.js';
import {startServer,signIn,ALICE,BOB} from './helpers.js';

test('Copilot recognizes concrete business-data questions but not ordinary how-to guidance',()=>{
  const queries=[
    ['What should I focus on today?','priorities'],
    ['Which invoices are overdue?','overdue'],
    ['Which customers need follow-ups?','followups'],
    ['Which leads have stalled?','stalled'],
    ['How is my business performing this month?','monthly'],
    ['How much money is overdue?','overdue']
  ];
  for(const [question,intent] of queries)assert.equal(copilotIntent(question),intent,question);
  for(const question of ['How do I create an invoice?','How can I import Excel?','Hello','What tools should a bakery use?'])
    assert.equal(copilotIntent(question),null,question);
});

const business={
  account:{currency:'INR',timeZone:'Asia/Kolkata'},
  invoices:[
    {status:'Sent',customerName:'Asha',dueDate:'2026-10-20',issueDate:'2026-10-01',total:1250.50,currency:'INR'},
    {status:'Paid',customerName:'Paid client',dueDate:'2026-10-20',issueDate:'2026-10-02',total:900,currency:'INR'},
    {status:'Draft',customerName:'Draft client',dueDate:'2026-10-19',issueDate:'2026-10-03',total:600,currency:'INR'},
    {status:'Sent',customerName:'Future client',dueDate:'2026-11-03',issueDate:'2026-10-04',total:300,currency:'INR'}
  ],
  followUps:[
    {contactName:'Asha',task:'Confirm visit',dueDate:'2026-10-28',done:false},
    {contactName:'Done client',task:'Already done',dueDate:'2026-10-20',done:true},
    {contactName:'Future client',task:'Later',dueDate:'2026-10-30',done:false}
  ],
  leads:[
    {name:'Old Prospect',stage:'New',createdAt:'2026-10-10'},
    {name:'Completed Prospect',stage:'Done',createdAt:'2026-10-10'},
    {name:'Fresh Prospect',stage:'Quoted',createdAt:'2026-10-26'}
  ],
  jobs:[
    {status:'Scheduled',startAt:'2026-10-28T09:00'},
    {status:'Cancelled',startAt:'2026-10-28T12:00'}
  ]
};

test('Copilot computes deterministic, read-only overdue and priority summaries',()=>{
  const overdue=answerCopilot('overdue',business,{today:'2026-10-28'});
  assert.equal(overdue.type,'copilot');
  assert.equal(overdue.section,null);
  assert.match(overdue.reply,/1 invoice overdue/);
  assert.match(overdue.reply,/1,250\.50/);
  assert.match(overdue.reply,/Asha/);
  assert.doesNotMatch(overdue.reply,/Paid client|Draft client/);
  const priorities=answerCopilot('priorities',business,{today:'2026-10-28'});
  assert.match(priorities.reply,/1 task due or past due/);
  assert.match(priorities.reply,/1 active job scheduled for today/);
  assert.match(priorities.reply,/1 lead still New or Quoted/);
  assert.deepEqual(guideNavigationLinks(priorities).map(link=>link.href),priorities.destinations.map(href=>trustedGuideLink(href)?.href).filter((href,i,arr)=>href&&arr.indexOf(href)===i).slice(0,5));
});

test('Copilot uses due tasks, lead age and month-issued invoice data without inventing revenue',()=>{
  const followups=answerCopilot('followups',business,{today:'2026-10-28'});
  assert.match(followups.reply,/Asha: Confirm visit/);
  assert.doesNotMatch(followups.reply,/Already done|Later/);
  const stalled=answerCopilot('stalled',business,{today:'2026-10-28'});
  assert.match(stalled.reply,/Old Prospect/);
  assert.doesNotMatch(stalled.reply,/Completed Prospect|Fresh Prospect/);
  assert.match(stalled.reply,/not proof of inactivity/);
  const monthly=answerCopilot('monthly',business,{today:'2026-10-28'});
  assert.match(monthly.reply,/4 invoices issued/);
  assert.match(monthly.reply,/1 invoice issued this month currently marked Paid/);
  assert.match(monthly.reply,/not revenue or cash received/);
});

test('Empty workspaces produce truthful zero summaries',()=>{
  const empty={account:{currency:'USD',timeZone:'UTC'},invoices:[],leads:[],followUps:[],jobs:[]};
  assert.match(answerCopilot('priorities',empty,{today:'2026-10-28'}).reply,/No overdue invoices/);
  assert.match(answerCopilot('overdue',empty,{today:'2026-10-28'}).reply,/0 invoices overdue/);
  assert.match(answerCopilot('monthly',empty,{today:'2026-10-28'}).reply,/0 leads created/);
});

test('Authenticated Copilot endpoint keeps account data isolated and old guide working',async()=>{
  const t=await startServer();
  try{
    const guest=t.browser();
    const post=(question,csrf)=>({method:'POST',csrf,json:{question,currentSection:'overview'}});
    assert.equal((await guest.req('/api/assistant/message',post('What should I focus on today?'))).status,401);
    const a=t.browser(),b=t.browser();
    await signIn(t,a,{profile:ALICE});
    await signIn(t,b,{profile:BOB});
    const alice=t.db.getUserByEmail(ALICE.email), bob=t.db.getUserByEmail(BOB.email);
    t.db.createLead(alice.id,{name:'Alice Customer 1'});
    t.db.createLead(alice.id,{name:'Alice Customer 2'});
    t.db.createLead(bob.id,{name:'Bob Customer'});
    const csrfA=(await a.me()).csrfToken,csrfB=(await b.me()).csrfToken;
    const withoutCsrf=await a.req('/api/assistant/message',post('How is my business performing this month?'));
    assert.equal(withoutCsrf.status,403);
    const forAlice=await a.req('/api/assistant/message',post('How is my business performing this month?',csrfA));
    const forBob=await b.req('/api/assistant/message',post('How is my business performing this month?',csrfB));
    assert.equal(forAlice.status,200);
    assert.equal(forBob.status,200);
    const aliceAnswer=await forAlice.json(),bobAnswer=await forBob.json();
    assert.equal(aliceAnswer.source,'copilot');
    assert.match(aliceAnswer.reply,/2 leads created this month/);
    assert.match(bobAnswer.reply,/1 lead created this month/);
    assert.doesNotMatch(aliceAnswer.reply,/Bob Customer|bob@example.com/);
    const guide=await a.req('/api/assistant/message',post('Where can I find invoices?',csrfA));
    assert.equal(guide.status,200);
    assert.equal((await guide.json()).section,'invoices');
  }finally{await t.close();}
});
