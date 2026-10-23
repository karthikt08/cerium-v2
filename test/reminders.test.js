import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startServer,signIn,ALICE,BOB} from './helpers.js';
import {signOptOut,verifyOptOut} from '../server/reminders.js';
import {processDueReminders,makeSmtpSender} from '../server/reminder-worker.js';

async function setup(run){
  const t=await startServer();
  try{
    const a=t.browser(),b=t.browser();
    await signIn(t,a,{profile:ALICE});await signIn(t,b,{profile:BOB});
    const ac=(await a.me()).csrfToken,bc=(await b.me()).csrfToken;
    const call=async(browser,csrf,url,method='GET',json)=>{
      const r=await browser.req(url,{method,json,csrf});
      return {status:r.status,data:await r.json()};
    };
    await run({t,a,b,A:(u,m,j)=>call(a,ac,u,m,j),B:(u,m,j)=>call(b,bc,u,m,j)});
  }finally{await t.close();}
}
const sentInvoice={customerName:'Sam Client',customerEmail:'sam@example.net',jobTitle:'Service visit',status:'Sent',amount:120};
const daysFromNow=(days=1)=>new Date(Date.now()+days*86400000).toISOString();

test('only explicit, consented reminders can be scheduled; queue survives reads and stays tenant-scoped',()=>setup(async({A,B})=>{
  const inv=await A('/api/invoices','POST',sentInvoice);
  assert.equal(inv.status,201);
  const id=inv.data.id;
  const base={invoiceId:id,dueAt:daysFromNow(),approved:true,consentConfirmed:true};
  assert.equal((await A('/api/reminders','POST',{...base,approved:false})).status,400);
  assert.equal((await A('/api/reminders','POST',{...base,consentConfirmed:false})).status,400);
  assert.equal((await B('/api/reminders','POST',base)).status,404);
  const made=await A('/api/reminders','POST',base);
  assert.equal(made.status,201);assert.equal(made.data.status,'scheduled');
  assert.equal((await B('/api/workspace')).data.reminders.length,0);
  assert.equal((await A('/api/reminders','POST',base)).status,409);
  assert.equal((await B('/api/reminders/'+made.data.id,'DELETE')).status,404);
  assert.equal((await A('/api/workspace')).data.reminders.length,1);
  assert.equal((await A('/api/me/export')).data.workspace.reminders.length,1);
  assert.equal((await A('/api/reminders/'+made.data.id,'DELETE')).status,200);
  assert.equal((await A('/api/workspace')).data.reminders[0].status,'cancelled');
}));

test('worker sends only due, unpaid reminders through the injected sender',()=>setup(async({t,A})=>{
  const inv=(await A('/api/invoices','POST',sentInvoice)).data;
  const due=daysFromNow(.2);
  await A('/api/reminders','POST',{invoiceId:inv.id,dueAt:due,approved:true,consentConfirmed:true});
  const messages=[];
  const opts={db:t.db,send:async mail=>{messages.push(mail);},secret:t.config.sessionSecret,baseUrl:'https://cerium.example'};
  let result=await processDueReminders({...opts,now:Date.now()+1000});
  assert.equal(result.sent,0);assert.equal(messages.length,0);
  result=await processDueReminders({...opts,now:Date.parse(due)+1000});
  assert.equal(result.sent,1);
  assert.equal(messages.length,1);
  assert.ok(messages[0].body.includes('unsubscribe?token='));
  assert.equal((await A('/api/workspace')).data.reminders[0].status,'sent');
  result=await processDueReminders({...opts,now:Date.parse(due)+10000});
  assert.equal(result.claimed,0);
}));

test('paid or draft invoices are skipped rather than emailed',()=>setup(async({t,A})=>{
  const inv=(await A('/api/invoices','POST',sentInvoice)).data;
  const due=daysFromNow(.1);
  await A('/api/reminders','POST',{invoiceId:inv.id,dueAt:due,approved:true,consentConfirmed:true});
  await A('/api/invoices/'+inv.id+'/status','PATCH',{status:'Paid'});
  let calls=0;
  const summary=await processDueReminders({db:t.db,send:async()=>{calls++},secret:t.config.sessionSecret,baseUrl:'https://cerium.example',now:Date.parse(due)+1000});
  assert.equal(summary.skipped,1);assert.equal(calls,0);
  assert.equal((await A('/api/workspace')).data.reminders[0].status,'skipped');
  const draft=(await A('/api/invoices','POST',{...sentInvoice,status:'Draft'})).data;
  assert.equal((await A('/api/reminders','POST',{invoiceId:draft.id,dueAt:daysFromNow(),approved:true,consentConfirmed:true})).status,409);
}));

test('unsubscribe requires a signed bearer token and cancels future sends',()=>setup(async({t,a,A})=>{
  const inv=(await A('/api/invoices','POST',sentInvoice)).data;
  await A('/api/reminders','POST',{invoiceId:inv.id,dueAt:daysFromNow(),approved:true,consentConfirmed:true});
  const me=await a.me();
  const token=signOptOut({userId:me.user.id,email:'sam@example.net'},t.config.sessionSecret);
  assert.deepEqual(verifyOptOut(token,t.config.sessionSecret),{userId:me.user.id,email:'sam@example.net'});
  assert.equal(verifyOptOut(token+'modified',t.config.sessionSecret),null);
  const r=await a.req('/unsubscribe?token='+encodeURIComponent(token));
  assert.equal(r.status,200);
  const post=await a.req('/unsubscribe',{method:'POST',form:{token}});
  assert.equal(post.status,200);
  assert.equal((await A('/api/workspace')).data.reminders[0].status,'cancelled');
  assert.equal((await A('/api/workspace')).data.reminderOptouts.length,1);
  const another=(await A('/api/invoices','POST',{...sentInvoice,jobTitle:'Another job'})).data;
  assert.equal((await A('/api/reminders','POST',{invoiceId:another.id,dueAt:daysFromNow(),approved:true,consentConfirmed:true})).status,409);
}));

test('interrupted or ambiguous deliveries never automatically retry',()=>setup(async({t,A})=>{
  const inv=(await A('/api/invoices','POST',sentInvoice)).data;
  const due=daysFromNow(.1);
  await A('/api/reminders','POST',{invoiceId:inv.id,dueAt:due,approved:true,consentConfirmed:true});
  const at=Date.parse(due)+100;
  const claimed=t.db.claimDueReminders(at,2);
  assert.equal(claimed.length,1);
  assert.equal(t.db.claimDueReminders(at,2).length,0);
  assert.equal(t.db.recoverInterruptedReminders(at+16*60000),1);
  const sent=[];
  const summary=await processDueReminders({db:t.db,send:async m=>sent.push(m),secret:t.config.sessionSecret,baseUrl:'https://cerium.example',now:at+16*60000});
  assert.equal(summary.claimed,0);assert.equal(sent.length,0);
  assert.equal((await A('/api/workspace')).data.reminders[0].status,'review');
}));

test('account expiry blocks scheduling, and queued messages are skipped if trial expires',()=>setup(async({t,a,A})=>{
  const inv=(await A('/api/invoices','POST',sentInvoice)).data;
  const due=daysFromNow(.1);
  await A('/api/reminders','POST',{invoiceId:inv.id,dueAt:due,approved:true,consentConfirmed:true});
  const user=(await a.me()).user;
  t.db.setUserPlan(user.id,{plan:'expired',planStatus:'expired'});
  assert.equal((await A('/api/reminders','POST',{invoiceId:inv.id,dueAt:due,approved:true,consentConfirmed:true})).status,403);
  assert.equal((await A('/api/reminders/'+(await A('/api/workspace')).data.reminders[0].id,'DELETE')).status,403);
  let sent=0;
  const result=await processDueReminders({db:t.db,send:async()=>sent++,secret:t.config.sessionSecret,baseUrl:'https://cerium.example',now:Date.parse(due)+100});
  assert.equal(result.skipped,1);assert.equal(sent,0);
}));

test('clear workspace removes reminder records and optouts',()=>setup(async({t,a,A})=>{
  const inv=(await A('/api/invoices','POST',sentInvoice)).data;
  await A('/api/reminders','POST',{invoiceId:inv.id,dueAt:daysFromNow(),approved:true,consentConfirmed:true});
  t.db.optOut((await a.me()).user.id,'block@example.net');
  assert.equal((await A('/api/me/data','DELETE')).status,200);
  const ws=(await A('/api/workspace')).data;
  assert.equal(ws.reminders.length,0);assert.equal(ws.reminderOptouts.length,0);
}));
test('delivery cannot run accidentally without a configured sender',()=>{
  assert.equal(makeSmtpSender({}),null);
  assert.equal(makeSmtpSender({REMINDER_DELIVERY_MODE:'disabled'}),null);
});


test('unknown SMTP delivery outcome remains review-only, not retried',()=>setup(async({t,A})=>{
  const inv=(await A('/api/invoices','POST',sentInvoice)).data;
  const due=daysFromNow(.1);
  await A('/api/reminders','POST',{invoiceId:inv.id,dueAt:due,approved:true,consentConfirmed:true});
  let count=0;
  const opts={db:t.db,secret:t.config.sessionSecret,baseUrl:'https://cerium.example',now:Date.parse(due)+1000,
    send:async()=>{count++;throw new Error('connection lost after DATA');},log:{error(){}}};
  const first=await processDueReminders(opts);
  const second=await processDueReminders({...opts,now:opts.now+1000});
  assert.equal(first.review,1);
  assert.equal(second.claimed,0);
  assert.equal(count,1);
  assert.equal((await A('/api/workspace')).data.reminders[0].status,'review');
}));

test('new reminder endpoints still require CSRF and same origin',()=>setup(async({a,A})=>{
  const inv=(await A('/api/invoices','POST',sentInvoice)).data;
  const body={invoiceId:inv.id,dueAt:daysFromNow(),approved:true,consentConfirmed:true};
  const noCsrf=await a.req('/api/reminders',{method:'POST',json:body});
  assert.equal(noCsrf.status,403);
  const badOrigin=await a.req('/api/reminders',{method:'POST',json:body,
    origin:'https://untrusted.invalid',csrf:(await a.me()).csrfToken});
  assert.equal(badOrigin.status,403);
  assert.equal((await A('/api/workspace')).data.reminders.length,0);
}));
