import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startServer,signIn,ALICE} from './helpers.js';
import {gstBreakdown,safeGSTrate} from '../public/js/india-market.js';
import {signOptOut} from '../server/reminders.js';

async function setup(run,options={}){
  const t=await startServer(options);
  try{
    const b=t.browser();await signIn(t,b,{profile:ALICE});
    const me=await b.me(),uid=me.user.id;
    const A=async(path,method='GET',json)=>{
      const r=await b.req(path,{method,json,csrf:me.csrfToken});
      return {status:r.status,data:await r.json()};
    };
    await run({t,b,A,uid});
  }finally{await t.close();}
}
const invoice={customerName:'Customer',jobTitle:'Service',amount:100,status:'Sent'};
const schedule={title:'Service',customerName:'Customer',startAt:'2026-11-12T09:00',endAt:'2026-11-12T10:00'};

test('profile fields reject malformed types and lengths without a server error',()=>setup(async({A})=>{
  for(const patch of [{name:null},{businessName:{}},{trade:true},{location:[]},{googlePlaceUrl:{}},{name:''},{name:'A'.repeat(121)}])
    assert.equal((await A('/api/me','PATCH',patch)).status,400,JSON.stringify(patch));
}));

test('jobs reject coerced boolean, null and array billing values',()=>setup(async({A})=>{
  for(const item of [{qty:true,rate:10},{qty:1,rate:null},{qty:[],rate:10},{qty:1,rate:[10]}])
    assert.equal((await A('/api/jobs','POST',{...schedule,billableItems:[{description:'Labor',...item}]})).status,400,JSON.stringify(item));
}));

test('unchanged invoice summary amounts preserve fractional quantity and rate',()=>setup(async({A})=>{
  const items=[{description:'Special labor',qty:1.5,rate:2.01}];
  const made=await A('/api/invoices','POST',{...invoice,items});
  assert.equal((await A('/api/invoices/'+made.data.id,'PATCH',{amount:3.02,notes:'Updated note'})).status,200);
  assert.deepEqual((await A('/api/workspace')).data.invoices[0].items,items);
}));

test('public quote displays the adjustment between rounded rows and the document total',()=>setup(async({t,uid})=>{
  const items=[{description:'Half unit A',qty:0.5,rate:0.01},{description:'Half unit B',qty:0.5,rate:0.01}];
  const quote=t.db.createQuote(uid,{title:'Rounding example',customerName:'Customer',items});
  assert.equal(quote.total,0.01);
  const shared=t.db.sendQuote(uid,quote.id,t.base,t.config.sessionSecret);
  const url=new URL(shared.url),response=await t.browser().req(url.pathname+url.search);
  const html=await response.text();
  assert.match(html,/Rounding adjustment/);assert.ok(html.includes('-$0.01'));assert.ok(html.includes('Total $0.01'));
}));

test('resubmitting unchanged payment terms preserves an explicit due date',()=>setup(async({A})=>{
  const made=await A('/api/invoices','POST',{...invoice,issueDate:'2026-11-01',terms:'Net 15',dueDate:'2026-12-01'});
  assert.equal((await A('/api/invoices/'+made.data.id,'PATCH',{terms:'Net 15',notes:'Updated note'})).status,200);
  assert.equal((await A('/api/workspace')).data.invoices[0].dueDate,'2026-12-01');
}));

test('an accepted invoice issue-date edit persists and recalculates its terms',()=>setup(async({A})=>{
  const made=await A('/api/invoices','POST',{...invoice,issueDate:'2026-11-01',terms:'Net 15'});
  assert.equal((await A('/api/invoices/'+made.data.id,'PATCH',{issueDate:'2026-11-03'})).status,200);
  const saved=(await A('/api/workspace')).data.invoices[0];
  assert.equal(saved.issueDate,'2026-11-03');assert.equal(saved.dueDate,'2026-11-18');
}));

test('editing issued invoice notes preserves the saved supplier GST and payment instructions',()=>setup(async({t,uid})=>{
  t.db.updateUser(uid,{country:'IN',indiaState:'33',gstin:'33ABCDE1234F1Z5',upiVpa:'original@bank'});
  const made=t.db.createInvoice(uid,{...invoice,gstRate:18,hsnSac:'998314',placeOfSupply:'33'});
  t.db.updateUser(uid,{indiaState:'29',gstin:'29ABCDE1234F1Z5',upiVpa:'changed@bank'});
  t.db.updateInvoice(uid,made.id,{notes:'Contact details reviewed'});
  const saved=t.db.getWorkspace(uid).invoices[0];
  assert.equal(saved.supplierGstin,'33ABCDE1234F1Z5');assert.equal(saved.supplierState,'33');
  assert.equal(saved.cgst,9);assert.equal(saved.sgst,9);assert.equal(saved.igst,0);
  assert.equal(saved.upiVpa,'original@bank');
}));

test('metadata edits do not retroactively recalculate legacy issued invoice rounding',()=>setup(async({t,uid})=>{
  t.db.updateUser(uid,{country:'IN',indiaState:'33',gstin:'33ABCDE1234F1Z5'});
  const made=t.db.createInvoice(uid,{...invoice,amount:4.52,gstRate:37.5,hsnSac:'998314',placeOfSupply:'29'});
  // Snapshot produced by the former floating-point tax calculation.
  t.db.rawDb.prepare('UPDATE invoices SET igst=1.69,total=6.21 WHERE id=?').run(made.id);
  t.db.updateInvoice(uid,made.id,{notes:'Receipt reference added'});
  let saved=t.db.getWorkspace(uid).invoices[0];
  assert.equal(saved.total,6.21);assert.equal(saved.igst,1.69);
  t.db.updateInvoice(uid,made.id,{amount:5.8});
  saved=t.db.getWorkspace(uid).invoices[0];assert.equal(saved.total,7.98);assert.equal(saved.igst,2.18);
}));

test('a bank-matched invoice cannot silently change its paid total or status',()=>setup(async({t,A,uid})=>{
  const made=await A('/api/invoices','POST',invoice);
  t.db.rawDb.prepare('INSERT INTO bank_transactions(id,user_id,date,description,amount,type,created_at) VALUES(?,?,?,?,?,?,?)')
    .run('matched_deposit',uid,'2026-10-25','Deposit',100,'Deposit','2026-10-25');
  assert.equal((await A('/api/bank/match','POST',{txId:'matched_deposit',action:'confirm',targetInvoiceId:made.data.id})).status,200);
  assert.equal((await A('/api/invoices/'+made.data.id,'PATCH',{amount:200})).status,409);
  assert.equal((await A('/api/invoices/'+made.data.id+'/status','PATCH',{status:'Sent'})).status,409);
  assert.equal((await A('/api/invoices/'+made.data.id,'PATCH',{notes:'Payment received'})).status,200);
  const saved=(await A('/api/workspace')).data.invoices[0];
  assert.equal(saved.total,100);assert.equal(saved.status,'Paid');
}));

test('quote customer email survives conversion and quote deletion before job completion',()=>setup(async({t,uid})=>{
  const quote=t.db.createQuote(uid,{title:'Repair',customerName:'Quoted customer',customerEmail:'quoted@example.com',items:[{description:'Repair',qty:1,rate:100}]});
  const shared=t.db.sendQuote(uid,quote.id,t.base,t.config.sessionSecret);
  const token=new URL(shared.url).searchParams.get('token');
  t.db.respondQuote(quote.id,token,t.config.sessionSecret,'Accepted');
  const converted=t.db.convertQuote(uid,quote.id,schedule);
  t.db.deleteQuote(uid,quote.id);
  t.db.updateJob(uid,converted.job.id,{status:'Completed'});
  assert.equal(t.db.getWorkspace(uid).invoices[0].customerEmail,'quoted@example.com');
}));

test('case and trailing-slash signup aliases cannot skip enforced region checks',async()=>{
  const t=await startServer({env:{REGION_ACCESS_MODE:'enforce',GEOIP_API_KEY:'test-geo-key-123456'},
    regionLookup:async()=>({location:{country_code:'FR'},is_vpn:false,is_proxy:false,is_tor:false})});
  try{
    for(const path of ['/auth/register/','/auth/REGISTER','/AUTH/register']){
      const r=await t.browser().req(path,{method:'POST',json:{name:'Visitor',email:'visitor@example.com',password:'Password123'}});
      assert.equal(r.status,403,path);
    }
    assert.equal(t.db.getUserByEmail('visitor@example.com'),null);
  }finally{await t.close();}
});

test('encoded workspace shell aliases require login before static delivery',async()=>{
  const t=await startServer();
  try{
    for(const path of ['/app%2ehtml','/%61pp.html','/app%2Ehtml']){
      const r=await t.browser().req(path);assert.equal(r.status,303,path);
      assert.match(r.headers.get('location'),/^\/login\.html\?/);
    }
  }finally{await t.close();}
});

test('encoded workspace shell aliases still require phone and mandate onboarding',()=>setup(async({b})=>{
  const r=await b.req('/app%2ehtml');
  assert.equal(r.status,303);assert.equal(r.headers.get('location'),'/verify.html');
},{env:{WORKSPACE_ACCESS_MODE:'phone_and_mandate'}}));

test('cancelling renewal preserves an already paid period without extending it',()=>setup(async({t,A,uid})=>{
  const end=Date.now()+86400000;
  t.db.createSubscription(uid,'sub_paid_period',Math.floor(Date.now()/1000)-86400);
  t.db.updateSubscription('sub_paid_period','active',end);
  t.db.updateSubscription('sub_paid_period','cancelled');
  assert.equal(t.db.getWorkspace(uid).account.planStatus,'active');
  assert.equal(t.db.getUserById(uid).subscription_expires_at,end);
  assert.equal((await A('/api/invoices','POST',invoice)).status,201);
  t.db.rawDb.prepare('UPDATE users SET subscription_expires_at=? WHERE id=?').run(Date.now()-1,uid);
  assert.equal(t.db.getWorkspace(uid).account.planStatus,'expired');
}));

test('a provider response that still says active is not reported as a confirmed cancellation',()=>setup(async({t,A,uid})=>{
  t.db.createSubscription(uid,'sub_not_cancelled',Math.floor(Date.now()/1000)-86400);
  t.db.updateSubscription('sub_not_cancelled','active',Date.now()+86400000);
  const r=await A('/api/billing/subscription/cancel','POST');
  assert.equal(r.status,409);assert.equal(r.data.error,'cancellation_unconfirmed');
  assert.equal(t.db.getSubscription('sub_not_cancelled').status,'active');
},{razorpay:{cancelSubscription:async()=>({status:'active'})}}));

test('malformed checkout identifiers are rejected before querying SQLite',()=>setup(async({A})=>{
  for(const id of [undefined,{},[],true,123])
    assert.equal((await A('/api/billing/subscription/verify','POST',{razorpay_subscription_id:id})).status,400,String(id));
}));

test('reminder scheduling rejects normalized impossible calendar dates',()=>setup(async({t,uid})=>{
  const made=t.db.createInvoice(uid,{...invoice,customerEmail:'customer@example.com'});
  assert.throws(()=>t.db.createReminder(uid,{invoiceId:made.id,dueAt:'2027-02-30T09:00:00Z',consentConfirmed:true,approved:true},Date.UTC(2027,1,1)),{code:'invalid_schedule'});
}));

test('unsubscribe rejects signature padding followed by HTML markup',()=>setup(async({t,uid})=>{
  const token=signOptOut({userId:uid,email:'recipient@example.com'},t.config.sessionSecret);
  const injected=token+'=\"><strong id="injected">Injected</strong>';
  const r=await t.browser().req('/unsubscribe?token='+encodeURIComponent(injected));
  assert.equal(r.status,400);
  assert.ok(!(await r.text()).includes('<strong id="injected">'));
}));

test('GST decimal validation and half-paisa rounding use integer arithmetic',()=>{
  assert.equal(safeGSTrate(0.29),true);
  for(const value of [null,true,[],{},'',0.291,-1,41])assert.equal(safeGSTrate(value),false);
  assert.equal(gstBreakdown(4.52,37.5,'33','29').igst,1.70);
  assert.equal(gstBreakdown(5.8,37.5,'33','33').total,7.98);
});

test('malformed business request bodies fail as client errors without creating records',()=>setup(async({A})=>{
  for(const route of ['invoices','jobs','quotes','leads','followups','reviews','messages','reminders','crew'])
    for(const body of [null,[],true,17,'invalid',{unexpected:'value'}]){
      const r=await A('/api/'+route,'POST',body);
      assert.ok(r.status>=400&&r.status<500,route+' '+JSON.stringify(body)+' '+r.status);
    }
  const ws=(await A('/api/workspace')).data;
  for(const key of ['invoices','jobs','quotes','leads','followUps','reviews','messages','reminders','crew'])
    assert.equal(ws[key].length,0,key);
}));

test('previously issued non-GST invoices remain payable after the business registers for GST',()=>setup(async({t,uid})=>{
  t.db.updateUser(uid,{country:'IN',indiaState:'33'});
  const made=t.db.createInvoice(uid,invoice);
  t.db.updateUser(uid,{gstin:'33ABCDE1234F1Z5'});
  t.db.updateInvoice(uid,made.id,{notes:'Old invoice'});
  t.db.updateInvoiceStatus(uid,made.id,'Paid');
  const saved=t.db.getWorkspace(uid).invoices[0];
  assert.equal(saved.status,'Paid');assert.equal(saved.total,100);assert.equal(saved.supplierGstin,'');
}));

test('expired trial reactivation uses the existing trial deadline instead of another 15-day wait',async()=>{
  let sent;
  const t=await startServer({env:{WORKSPACE_ACCESS_MODE:'phone_and_mandate',RAZORPAY_KEY_ID:'rzp_test_reactivation',
    RAZORPAY_KEY_SECRET:'test-secret-reactivation',RAZORPAY_WEBHOOK_SECRET:'test-webhook-reactivation',RAZORPAY_PLAN_ID:'plan_returning'},razorpay:{
    getPlan:async()=>({period:'monthly',interval:1,item:{amount:2000,currency:'USD'}}),
    createSubscription:async p=>{sent=p;return {id:'sub_returning',status:'created',start_at:p.startAt,expire_by:p.expireBy};}
  }});
  try{
    const b=t.browser();await signIn(t,b,{profile:ALICE});const me=await b.me(),uid=me.user.id;
    t.db.beginBillingPhone(uid,'+14155550123','US');t.db.completeBillingPhone(uid,'+14155550123','US');
    t.db.createSubscription(uid,'sub_first_trial',Math.floor(Date.now()/1000)-20*86400);
    t.db.updateSubscription('sub_first_trial','authenticated');
    t.db.beginTrialOnEntry(uid,Date.now()-20*86400000);
    t.db.updateSubscription('sub_first_trial','cancelled');
    const oldDeadline=t.db.getUserById(uid).trial_ends_at;
    const response=await b.req('/api/billing/subscription',{method:'POST',csrf:me.csrfToken});
    assert.equal(response.status,200,await response.clone().text());
    assert.ok(sent.startAt*1000<Date.now()+3600000,'returning customer should not wait another 15 days');
    assert.equal((await response.json()).trialEligible,false);
    assert.equal(t.db.getUserById(uid).trial_ends_at,oldDeadline);
  }finally{await t.close();}
});

test('reactivation never charges ahead of remaining trial or paid access',async()=>{
  for(const kind of ['trial','paid']){
    let schedule;
    await setup(async({t,A,uid})=>{
      t.db.beginBillingPhone(uid,'+14155550123','US');t.db.completeBillingPhone(uid,'+14155550123','US');
      const at=Date.now(),trialEnd=at+5*86400000,paidEnd=at+8*86400000;
      t.db.beginTrialOnEntry(uid,at-10*86400000,trialEnd);
      t.db.createSubscription(uid,'sub_previous',Math.floor(at/1000)-86400);
      t.db.updateSubscription('sub_previous','authenticated');
      if(kind==='paid')t.db.updateSubscription('sub_previous','active',paidEnd);
      t.db.updateSubscription('sub_previous','cancelled');
      const r=await A('/api/billing/subscription','POST');
      assert.equal(r.status,200,JSON.stringify(r.data));
      assert.equal(schedule.startAt,Math.ceil((kind==='trial'?trialEnd:paidEnd)/1000));
      assert.equal(r.data.trialEligible,false);assert.equal(t.db.getUserById(uid).trial_ends_at,trialEnd);
    },{env:{WORKSPACE_ACCESS_MODE:'phone_and_mandate',RAZORPAY_KEY_ID:'rzp_test_remaining',
      RAZORPAY_KEY_SECRET:'test-secret-remaining',RAZORPAY_WEBHOOK_SECRET:'test-webhook-remaining',RAZORPAY_PLAN_ID:'plan_remaining'},
      razorpay:{getPlan:async()=>({period:'monthly',interval:1,item:{amount:2000,currency:'USD'}}),
        createSubscription:async p=>{schedule=p;return {id:'sub_reactivated',status:'created',start_at:p.startAt};}}});
  }
});
