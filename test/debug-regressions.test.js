import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startServer,signIn,ALICE,BOB} from './helpers.js';

async function setup(run) {
  const t=await startServer();
  try {
    const a=t.browser(),b=t.browser();
    await signIn(t,a,{profile:ALICE});await signIn(t,b,{profile:BOB});
    const am=await a.me(),bm=await b.me();
    const call=async(browser,csrf,path,method='GET',json)=>{
      const r=await browser.req(path,{method,json,csrf});
      return {status:r.status,data:await r.json()};
    };
    await run({t,uid:am.user.id,bid:bm.user.id,a,
      A:(p,m,j)=>call(a,am.csrfToken,p,m,j),B:(p,m,j)=>call(b,bm.csrfToken,p,m,j)});
  } finally {await t.close();}
}
const invoice={customerName:'Customer',jobTitle:'Repair',amount:10};
const job={title:'Repair',customerName:'Customer',startAt:'2026-11-03T09:00',endAt:'2026-11-03T10:00'};

test('invoice creation rejects malformed lines without persisting an invoice',()=>setup(async({A})=>{
  for(const items of [[],{},[null],[{description:'Work',qty:0,rate:10}],
    [{description:'Work',qty:1,rate:-1}],[{description:'Work',qty:true,rate:10}],
    [{description:'Work',qty:1,rate:null}],[{description:'Work',qty:1,rate:1.234}]]) {
    const r=await A('/api/invoices','POST',{...invoice,items});
    assert.equal(r.status,400,JSON.stringify(items));
    assert.equal(r.data.error,'invalid_invoice_items');
  }
  assert.equal((await A('/api/workspace')).data.invoices.length,0);
}));

test('invoice amounts use exact cents on creation, editing and job completion',()=>setup(async({A})=>{
  const items=[{description:'Labor',qty:1.5,rate:2.01}];
  const created=await A('/api/invoices','POST',{...invoice,items});
  assert.equal(created.status,201);assert.equal(created.data.total,3.02);
  assert.equal((await A('/api/invoices/'+created.data.id,'PATCH',{notes:'Updated'})).status,200);
  assert.equal((await A('/api/workspace')).data.invoices[0].total,3.02);
  assert.equal((await A('/api/jobs','POST',{...job,status:'Completed',billableItems:items})).status,201);
  assert.equal((await A('/api/workspace')).data.invoices.find(i=>i.jobId).total,3.02);
}));

test('full-sized invoices, quotes and job notes fit the request limit',()=>setup(async({A})=>{
  const items=Array.from({length:20},()=>({description:'Service '.repeat(20),qty:1,rate:10}));
  assert.equal((await A('/api/invoices','POST',{...invoice,items,notes:'N'.repeat(1500)})).status,201);
  assert.equal((await A('/api/quotes','POST',{customerName:'Customer',title:'Repair',items,notes:'N'.repeat(1200)})).status,201);
  assert.equal((await A('/api/jobs','POST',{...job,billableItems:items,notes:'N'.repeat(1500)})).status,201);
  assert.equal((await A('/api/invoices','POST',{...invoice,notes:'N'.repeat(70000)})).status,413);
}));

test('mobile datetime-local seconds normalize without accepting impossible dates',()=>setup(async({A})=>{
  const r=await A('/api/jobs','POST',{...job,startAt:job.startAt+':00',endAt:job.endAt+':00.000'});
  assert.equal(r.status,201);assert.equal(r.data.startAt,job.startAt);assert.equal(r.data.endAt,job.endAt);
  assert.equal((await A('/api/jobs','POST',{...job,startAt:'2026-02-30T09:00:00'})).status,400);
}));

test('invoices reject invalid statuses, dates and text types as client errors',()=>setup(async({A})=>{
  for(const patch of [{status:'Anything'},{issueDate:'2026-02-30'},{dueDate:'bad'},{customerName:{}},{amount:-10},{amount:'NaN'}])
    assert.equal((await A('/api/invoices','POST',{...invoice,...patch})).status,400,JSON.stringify(patch));
  const r=await A('/api/invoices','POST',invoice);
  assert.equal((await A('/api/invoices/'+r.data.id+'/status','PATCH',{status:'Anything'})).status,400);
  assert.equal((await A('/api/invoices/missing','PATCH',{notes:'No'})).status,404);
}));

test('nonexistent or foreign bank transactions cannot mark an invoice paid',()=>setup(async({t,A,B,uid,bid})=>{
  const r=await A('/api/invoices','POST',invoice);
  const targetInvoiceId=r.data.id;
  assert.equal((await A('/api/bank/match','POST',{txId:'missing',action:'confirm',targetInvoiceId})).status,404);
  t.db.rawDb.prepare('INSERT INTO bank_transactions(id,user_id,date,description,amount,created_at) VALUES(?,?,?,?,?,?)')
    .run('foreign',bid,'2026-10-25','Deposit',10,'2026-10-25');
  assert.equal((await A('/api/bank/match','POST',{txId:'foreign',action:'confirm',targetInvoiceId})).status,404);
  assert.equal((await A('/api/workspace')).data.invoices[0].status,'Sent');
}));

test('deleting an invoice clears all bank references within its workspace',()=>setup(async({t,A,uid})=>{
  const r=await A('/api/invoices','POST',invoice);
  t.db.rawDb.prepare('INSERT INTO bank_transactions(id,user_id,date,description,amount,status,suggested_invoice_id,matched_invoice_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
    .run('tx',uid,'2026-10-25','Deposit',10,'matched',r.data.id,r.data.id,'2026-10-25');
  assert.equal((await A('/api/invoices/'+r.data.id,'DELETE')).status,200);
  const tx=t.db.rawDb.prepare('SELECT * FROM bank_transactions WHERE id=?').get('tx');
  assert.equal(tx.matched_invoice_id,null);assert.equal(tx.suggested_invoice_id,null);assert.equal(tx.status,'unmatched');
}));

test('one deposit cannot settle two invoices and one invoice cannot consume two deposits',()=>setup(async({t,A,uid})=>{
  const first=await A('/api/invoices','POST',invoice),second=await A('/api/invoices','POST',invoice);
  const insert=t.db.rawDb.prepare('INSERT INTO bank_transactions(id,user_id,date,description,amount,type,created_at) VALUES(?,?,?,?,?,?,?)');
  for(const id of ['deposit1','deposit2'])insert.run(id,uid,'2026-10-25','Deposit',10,'Deposit','2026-10-25');
  const match=(txId,targetInvoiceId)=>A('/api/bank/match','POST',{txId,action:'confirm',targetInvoiceId});
  assert.equal((await match('deposit1',first.data.id)).status,200);
  assert.equal((await match('deposit1',first.data.id)).status,200);
  assert.equal((await match('deposit1',second.data.id)).status,409);
  assert.equal((await match('deposit2',first.data.id)).status,409);
  assert.equal((await A('/api/workspace')).data.invoices.find(i=>i.id===second.data.id).status,'Sent');
}));

test('invoice writes roll back when persisting the currency snapshot fails',()=>setup(async({t,uid})=>{
  const existing=t.db.createInvoice(uid,invoice);
  t.db.rawDb.exec("CREATE TEMP TRIGGER reject_currency BEFORE UPDATE OF invoice_currency ON invoices BEGIN SELECT RAISE(ABORT, 'simulated storage failure'); END");
  assert.throws(()=>t.db.createInvoice(uid,invoice),/simulated storage failure/);
  assert.throws(()=>t.db.updateInvoice(uid,existing.id,{amount:25,notes:'Should roll back'}),/simulated storage failure/);
  const invoices=t.db.getWorkspace(uid).invoices;
  assert.equal(invoices.length,1);assert.equal(invoices[0].total,10);
  assert.notEqual(invoices[0].notes,'Should roll back');
}));

test('deleted job invoices can be replaced explicitly once with ownership and plan checks',()=>setup(async({t,A,B,uid})=>{
  const created=await A('/api/jobs','POST',{...job,status:'Completed',billableItems:[{description:'Repair',qty:1,rate:10}]});
  const inv=(await A('/api/workspace')).data.invoices[0];
  await A('/api/invoices/'+inv.id,'DELETE');
  await A('/api/jobs/'+created.data.id,'PATCH',{notes:'No automatic replacement'});
  assert.equal((await A('/api/workspace')).data.invoices.length,0);
  const path='/api/jobs/'+created.data.id+'/invoice';
  assert.equal((await B(path,'POST')).status,404);
  assert.equal((await A(path,'POST')).status,201);
  assert.equal((await A(path,'POST')).status,201);
  const ws=(await A('/api/workspace')).data;
  assert.equal(ws.invoices.length,1);assert.notEqual(ws.invoices[0].id,inv.id);
  assert.equal(ws.invoices[0].status,'Draft');
  t.db.setUserPlan(uid,{plan:'expired',planStatus:'expired'});
  assert.equal((await A(path,'POST')).status,403);
}));

test('expired subscription events and repeated workspace reads cannot extend paid access',()=>setup(async({t,uid})=>{
  const past=Date.now()-86400000;
  t.db.createSubscription(uid,'sub_expired',Math.floor(past/1000)-100);
  t.db.updateSubscription('sub_expired','active',past);
  t.db.setUserPlan(uid,{plan:'expired',planStatus:'expired',subscriptionId:'sub_expired',expiresAt:past});
  for(let n=0;n<3;n++)assert.equal(t.db.getWorkspace(uid).account.planStatus,'expired');
  t.db.updateSubscription('sub_expired','active');
  assert.equal(t.db.getWorkspace(uid).account.planStatus,'expired');
}));

test('legacy captured payments validate amounts and are replay-safe',()=>setup(async({t,uid})=>{
  t.db.insertPayment({userId:uid,orderId:'order_regression',amount:2000,currency:'USD'});
  const payment={orderId:'order_regression',paymentId:'pay_regression',amount:2000,currency:'USD'};
  for(const bad of [{amount:1},{currency:'INR'},{paymentId:''}]) {
    assert.equal(t.db.markPaid({...payment,...bad}),false);
    assert.equal(t.db.getPaymentByOrder(payment.orderId).status,'created');
  }
  assert.equal(t.db.markPaid(payment),true);
  const expiry=t.db.getUserById(uid).subscription_expires_at;
  t.db.markPaymentFailed(payment.orderId);
  assert.equal(t.db.getPaymentByOrder(payment.orderId).status,'paid');
  assert.equal(t.db.markPaid(payment),true);
  assert.equal(t.db.getUserById(uid).subscription_expires_at,expiry);
}));

test('explicit line edits take precedence over the form summary amount',()=>setup(async({A})=>{
  const r=await A('/api/invoices','POST',invoice);
  assert.equal((await A('/api/invoices/'+r.data.id,'PATCH',{amount:10,items:[{description:'Revised work',qty:2,rate:20}]})).status,200);
  const saved=(await A('/api/workspace')).data.invoices[0];
  assert.equal(saved.total,40);assert.equal(saved.items[0].qty,2);
}));

test('reminder eligibility uses the same exact trial deadline as workspace access',()=>setup(async({t,A,uid})=>{
  const r=await A('/api/invoices','POST',{...invoice,customerEmail:'customer@example.com'});
  const at=Date.now();
  t.db.rawDb.prepare("UPDATE users SET trial_started_at='2020-01-01',trial_ends_at=? WHERE id=?").run(at+1000,uid);
  const reminder={user_id:uid,invoice_id:r.data.id,email:'customer@example.com'};
  assert.equal(t.db.assessReminder(reminder,at).eligible,true);
  assert.equal(t.db.assessReminder(reminder,at+1000).eligible,false);
}));

test('delayed subscription events cannot resurrect cancellations or override a newer subscription',()=>setup(async({t,uid})=>{
  const at=Date.now(),start=Math.floor(at/1000)-100;
  t.db.createSubscription(uid,'sub_old',start);
  t.db.updateSubscription('sub_old','active',at+86400000,at);
  t.db.updateSubscription('sub_old','cancelled',null,at+100);
  assert.equal(t.db.updateSubscription('sub_old','active',at+86400000,at-100),false);
  assert.equal(t.db.updateSubscription('sub_old','active',at+86400000,at+200),false);
  t.db.createSubscription(uid,'sub_new',start);
  t.db.updateSubscription('sub_new','active',at+86400000);
  t.db.updateSubscription('sub_old','cancelled');
  assert.equal(t.db.getWorkspace(uid).account.planStatus,'active');
  assert.equal(t.db.getUserById(uid).subscription_id,'sub_new');
}));

test('malformed business fields produce 400 responses without saving records',()=>setup(async({A})=>{
  for(const [path,body] of [['/api/leads',{name:{}}],['/api/leads',{name:'Client',value:-1}],
    ['/api/leads',{name:'Client',stage:'Unknown'}],['/api/followups',{contactName:'Client',task:42}],
    ['/api/reviews',{customerName:[],jobTitle:'Repair'}],['/api/messages',{subject:'Help',body:{}}]])
    assert.equal((await A(path,'POST',body)).status,400,path);
}));

test('deleting a lead detaches its jobs and followups without losing those records',()=>setup(async({A,B})=>{
  const lead=await A('/api/leads','POST',{name:'Client'});
  assert.equal((await B('/api/followups','POST',{leadId:lead.data.id,contactName:'Client',task:'Call'})).status,400);
  const j=await A('/api/jobs','POST',{...job,leadId:lead.data.id});
  await A('/api/leads/'+lead.data.id,'DELETE');
  assert.equal((await A('/api/jobs/'+j.data.id,'PATCH',{notes:'Still editable'})).status,200);
  const ws=(await A('/api/workspace')).data;
  assert.equal(ws.jobs[0].leadId,null);assert.equal(ws.followUps.length,1);assert.ok(!ws.followUps[0].leadId);
}));
