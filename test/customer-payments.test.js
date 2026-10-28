import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {startServer,signIn,ALICE,BOB} from './helpers.js';
import {metrics} from '../public/js/workspace-model.js';
import {businessInsights} from '../public/js/workspace-insights.js';
import {processDueReminders} from '../server/reminder-worker.js';
const payment=(amount,allocations=[],extra={})=>({customerName:'Verified customer',amount,currency:'USD',paidAt:'2026-10-20',requestKey:randomUUID(),confirmed:true,allocations,...extra});
const allocation=(invoice,amount)=>({invoiceId:invoice.id,amount});
test('partial and split payments update balances atomically without changing invoice totals',async()=>{
  const t=await startServer();try{
    const a=t.browser(),b=t.browser();await signIn(t,a,{profile:ALICE});await signIn(t,b,{profile:BOB});
    const uid=(await a.me()).user.id,bid=(await b.me()).user.id;
    const invoice=(owner=uid,amount=100)=>t.db.createInvoice(owner,{customerName:'Customer',customerEmail:'client@example.com',jobTitle:'Work',amount,issueDate:'2026-10-01',dueDate:'2026-10-10'});
    const one=invoice(),two=invoice(),foreign=invoice(bid),p=payment(60,[allocation(one,40)]);
    const r=t.db.recordCustomerPayment(uid,p);assert.equal(t.db.recordCustomerPayment(uid,p).id,r.id,'request replay is idempotent');
    assert.throws(()=>t.db.recordCustomerPayment(uid,{...p,amount:70}),/different/);
    let ws=t.db.getWorkspace(uid);assert.equal(ws.invoices.find(i=>i.id===one.id).balance,60);assert.equal(ws.customerPayments[0].unallocated,20);
    assert.equal(metrics(ws).outstanding,160);assert.equal(businessInsights(ws).currencies[0].paid,40);
    assert.throws(()=>t.db.updateInvoiceStatus(uid,one.id,'Paid'),/ledger/);
    assert.throws(()=>t.db.updateInvoice(uid,one.id,{amount:120}),/ledger/);
    assert.throws(()=>t.db.deleteInvoice(uid,one.id),/payment history/);
    const add={confirmed:true,requestKey:randomUUID(),allocations:[allocation(two,20)]};
    t.db.allocateCustomerPayment(uid,r.id,add);t.db.allocateCustomerPayment(uid,r.id,add);
    assert.equal(t.db.getWorkspace(uid).customerPayments[0].unallocated,0);
    assert.throws(()=>t.db.recordCustomerPayment(uid,payment(500,[allocation(one,500)])),/exceeds/);
    assert.throws(()=>t.db.recordCustomerPayment(uid,payment(30,[allocation(two,10),allocation(foreign,20)])),/workspace/);
    assert.equal(t.db.getWorkspace(uid).customerPayments.length,1,'entire failed record is rolled back');
    const final=t.db.recordCustomerPayment(uid,payment(140,[allocation(one,60),allocation(two,80)]));
    ws=t.db.getWorkspace(uid);assert.equal(ws.invoices.filter(i=>i.status==='Paid').length,2);assert.equal(metrics(ws).paid,200);assert.equal(metrics(ws).outstanding,0);
    assert.equal(ws.invoices[0].total,100);assert.equal(ws.invoices[0].paidAt,'2026-10-20');
    t.db.voidCustomerPayment(uid,final.id,{confirmed:true,reason:'Reversed bank transfer'});
    ws=t.db.getWorkspace(uid);assert.equal(metrics(ws).outstanding,140);assert.equal(metrics(ws).paid,60);assert.equal(ws.customerPayments.filter(r=>r.voidedAt).length,1);
    assert.throws(()=>t.db.allocateCustomerPayment(uid,final.id,{confirmed:true,requestKey:randomUUID(),allocations:[allocation(one,10)]}),/voided/);
    assert.equal(t.db.getWorkspace(bid).customerPayments.length,0);
    t.db.clearWorkspaceData(uid);assert.equal(t.db.getWorkspace(uid).customerPayments.length,0);
  }finally{await t.close();}
});
test('payment APIs retain access controls, exact fractions, currency checks and duplicate-reference protection',async()=>{
  const t=await startServer();try{
    const a=t.browser(),b=t.browser();await signIn(t,a,{profile:ALICE});await signIn(t,b,{profile:BOB});const me=await a.me(),bm=await b.me();
    const p=payment('12.3456',[],{reference:'BANK-1'});
    assert.equal((await a.req('/api/customer-payments',{method:'POST',json:p})).status,403);
    assert.equal((await a.req('/api/customer-payments',{method:'POST',csrf:me.csrfToken,json:p})).status,201);
    const r=t.db.getWorkspace(me.user.id).customerPayments[0];assert.equal(r.amount,12.3456);
    assert.equal((await b.req('/api/customer-payments/'+r.id+'/void',{method:'POST',csrf:bm.csrfToken,json:{confirmed:true,reason:'Wrong owner'}})).status,404);
    assert.throws(()=>t.db.recordCustomerPayment(me.user.id,payment(12,[],{reference:'BANK-1'})),/already recorded/);
    assert.throws(()=>t.db.recordCustomerPayment(me.user.id,payment(12,[],{currency:'EUR'})),/currency/);
    assert.throws(()=>t.db.recordCustomerPayment(me.user.id,payment('1.12345')),/four decimal/);
    assert.throws(()=>t.db.recordCustomerPayment(me.user.id,payment(1,[],{paidAt:'2026-02-30'})),/valid payment date/);
    const exported=await (await a.req('/api/me/export')).json();assert.equal(exported.workspace.customerPayments.length,1);
    t.db.setUserPlan(me.user.id,{plan:'expired',planStatus:'expired'});
    assert.equal((await a.req('/api/customer-payments',{method:'POST',csrf:me.csrfToken,json:payment(1)})).status,403);
  }finally{await t.close();}
});
test('approved reminders use the remaining invoice balance after partial payment',async()=>{
  const t=await startServer();try{
    const a=t.browser();await signIn(t,a,{profile:ALICE});const uid=(await a.me()).user.id;
    const i=t.db.createInvoice(uid,{customerName:'Customer',customerEmail:'client@example.com',jobTitle:'Work',amount:100,issueDate:'2026-10-01',dueDate:'2026-10-10'});
    const dueAt=new Date(Date.now()+600000).toISOString();
    t.db.createReminder(uid,{invoiceId:i.id,dueAt,approved:true,consentConfirmed:true});
    t.db.recordCustomerPayment(uid,payment(40,[allocation(i,40)]));
    const sent=[];await processDueReminders({db:t.db,send:async m=>sent.push(m),secret:t.config.sessionSecret,baseUrl:'https://cerium.example',now:Date.parse(dueAt)+1000});
    assert.equal(sent.length,1);assert.match(sent[0].body,/60\.00/);assert.doesNotMatch(sent[0].body,/100\.00/);
  }finally{await t.close();}
});
