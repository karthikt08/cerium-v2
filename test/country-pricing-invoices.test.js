import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {openDb} from '../server/db.js';
import {startServer,signIn,ALICE} from './helpers.js';
import {businessDetails,prepareBusiness} from './business-fixtures.js';
import {billingPlan,COUNTRY_OPTIONS} from '../public/js/countries.js';
import {INCOME_GROUPS} from '../public/js/country-income.js';
import {invoiceCountry,invoiceMoney,invoiceDate} from '../public/js/invoice-country.js';

const fixture=(db,country,currency)=>{
  const user=db.createUser({email:country.toLowerCase()+'@example.test',name:'Original Owner'});
  db.updateUser(user.id,{country,currency,businessName:'Original Business',location:'12 Example Street'});
  return user.id;
};
const invoice={customerName:'Customer',customerAddress:'42 Client Road',jobTitle:'Service',amount:100,status:'Draft',supplyDate:'2026-10-21'};

test('pinned FY2027 groups are disjoint and every phone country has an explicit price',()=>{
  assert.deepEqual(Object.values(INCOME_GROUPS).map(x=>x.length),[25,47,59,88]); // Channel Islands maps to both GG and JE.
  const all=Object.values(INCOME_GROUPS).flat();assert.equal(new Set(all).size,all.length);
  const expected={US:20,GB:20,IN:500,BR:16,CN:16,ZA:16,PH:16,NG:12,NP:12,VE:12,UG:8,ET:8};
  for(const [country,amount] of Object.entries(expected))assert.equal(billingPlan(country).monthlyPrice,amount,country);
  for(const {value} of COUNTRY_OPTIONS){const p=billingPlan(value);assert.ok([800,1200,1600,2000,50000].includes(p.minorUnits));assert.equal(p.version,'world-bank-fy2027');}
  assert.equal(billingPlan('AC').tier,'unclassified');assert.equal(billingPlan('AC').monthlyPrice,20);
  for(const value of ['XX','us','__proto__',null,{}])assert.equal(billingPlan(value),null);
});

test('discount checkout fails closed if its plan is absent or has a wrong price',async()=>{
  for(const mismatch of [false,true]){
    let created=0;
    const t=await startServer({env:{RAZORPAY_KEY_ID:'rzp_test_discount',RAZORPAY_KEY_SECRET:'discount-test-secret',RAZORPAY_WEBHOOK_SECRET:'discount-test-webhook',RAZORPAY_PLAN_ID:'plan_standard',...(mismatch?{RAZORPAY_UPPER_MIDDLE_PLAN_ID:'plan_upper'}:{})},
      razorpay:{getPlan:async()=>({period:'monthly',interval:1,item:{amount:2000,currency:'USD'}}),createSubscription:async()=>{created++;return {id:'sub_wrong'};}}});
    try{
      const b=t.browser();await signIn(t,b,{profile:ALICE});const user=t.db.getUserByEmail(ALICE.email);
      t.db.updateUser(user.id,{country:'BR'});t.db.beginBillingPhone(user.id,'+5511961234567','BR');t.db.completeBillingPhone(user.id,'+5511961234567','BR');
      const me=await b.me();const r=await b.req('/api/billing/subscription',{method:'POST',csrf:me.csrfToken,json:{country:'US',amount:2000}});
      assert.equal(r.status,503);assert.equal((await r.json()).error,mismatch?'billing_plan_mismatch':'billing_not_configured');assert.equal(created,0);
    }finally{await t.close();}
  }
});

test('old mandates retain authorized price across migration and new mandates snapshot tier',()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'cerium-price-')),file=path.join(dir,'test.db');let db=openDb(file);
  try{
    const id=fixture(db,'BR','BRL');db.createSubscription(id,'sub_legacy',1800000000);
    db.rawDb.prepare("UPDATE recurring_subscriptions SET price_amount=NULL,price_currency=NULL,price_tier=NULL WHERE subscription_id='sub_legacy'").run();
    db.close();db=openDb(file);
    assert.equal(db.getWorkspace(id).account.billingPrice.monthlyPrice,20);
    assert.equal(db.getWorkspace(id).account.availableBillingPrice.monthlyPrice,16);
    assert.equal(db.getWorkspace(id).account.billingPrice.currency,'USD');
    db.updateSubscription('sub_legacy','cancelled');assert.equal(db.getWorkspace(id).account.billingPrice.monthlyPrice,16);
    db.createSubscription(id,'sub_new',1800000001);assert.equal(db.getSubscription('sub_new').price_amount,1600);
    assert.equal(db.getSubscription('sub_new').price_currency,'USD');assert.equal(db.getWorkspace(id).account.currency,'BRL');
  }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});

for(const [country,currency,label,rates,total] of [
  ['GB','GBP','VAT',[20],120],['DE','EUR','VAT',[19],119],['AU','AUD','GST',[10],110],
  ['CA','CAD','GST',[5,7],112],['NG','NGN','Tax',[7.5],107.5],['US','USD','Sales tax',[8.875],108.88],
  ['JP','JPY','Tax',[10],110],['KW','KWD','Tax',[5],105],
])test(country+' invoices preserve country, currency, supplier, rate breakdown and total',()=>{
  const db=openDb(':memory:');try{
    const id=fixture(db,country,currency);
    const taxLines=rates.map((rate,index)=>({label:index?'PST':label,rate,amount:999999}));
    const created=db.createInvoice(id,{...invoice,supplierTaxId:'EXAMPLE-REGISTRATION',customerTaxId:'CUSTOMER-REG',taxLines,paymentInstructions:'Transfer with invoice reference',taxNote:'Reviewed by the business'});
    let saved=db.getWorkspace(id).invoices[0];assert.equal(saved.total,total);assert.equal(saved.currency,currency);assert.equal(saved.details.country,country);
    assert.equal(saved.details.taxLines.reduce((sum,row)=>sum+row.amount,0),Number((total-100).toFixed(3)));
    assert.equal(saved.details.supplyDate,'2026-10-21');assert.equal(saved.details.paymentInstructions,'Transfer with invoice reference');
    db.updateInvoiceStatus(id,created.id,'Sent');db.updateUser(id,{businessName:'New business name',location:'99 New Street'});
    db.updateInvoice(id,created.id,{notes:'Edited after issue'});saved=db.getWorkspace(id).invoices[0];
    assert.equal(saved.total,total);assert.equal(saved.details.supplier.name,'Original Business');assert.equal(saved.details.supplier.address,'12 Example Street');
    db.updateInvoice(id,created.id,{amount:200});saved=db.getWorkspace(id).invoices[0];
    assert.equal(saved.details.subtotal,200);assert.equal(saved.total,Number((200+saved.details.taxLines.reduce((sum,r)=>sum+r.amount,0)).toFixed(3)));
    assert.throws(()=>db.updateUser(id,{currency:currency==='USD'?'EUR':'USD'}));
  }finally{db.close();}
});

test('generic invoice validation rejects malformed tax, amount spoofing and zero-minor-unit fractions',()=>{
  const db=openDb(':memory:');try{
    const id=fixture(db,'GB','GBP');
    for(const payload of [
      {taxLines:[{label:'VAT',rate:20}]},
      {supplierTaxId:'ID',taxLines:[{label:'VAT',rate:-1}]},
      {supplierTaxId:'ID',taxLines:[{label:'VAT',rate:101}]},
      {supplierTaxId:'ID',taxLines:[{label:'VAT',rate:true}]},
      {taxLines:Array(5).fill({label:'tax',rate:0})},{taxLines:'bad'},{supplyDate:'2026-02-30'},
      {paymentInstructions:{}},{customerTaxId:'x'.repeat(81)}
    ])assert.throws(()=>db.createInvoice(id,{...invoice,...payload}),{code:'invalid_invoice'});
    assert.equal(db.getWorkspace(id).invoices.length,0);
    const safe=db.createInvoice(id,{...invoice,total:0,details:{supplier:{name:'Injected'}},taxLines:[{label:'VAT',rate:0}],taxNote:'Exempt reference'});
    assert.equal(safe.total,100);assert.equal(safe.details.supplier.name,'Original Business');
    const jp=fixture(db,'JP','JPY');assert.throws(()=>db.createInvoice(jp,{...invoice,amount:100.01}),/whole-unit/);
    const kw=fixture(db,'KW','KWD');const tiny=db.createInvoice(kw,{...invoice,amount:0.10,supplierTaxId:'ID',taxLines:[{label:'Tax',rate:5}]});
    assert.equal(tiny.total,0.105);assert.equal(tiny.details.taxLines[0].amount,0.005);
  }finally{db.close();}
});

test('mandatory business wizard saves independent local currency before payment authorization',async()=>{
  const t=await startServer({env:{WORKSPACE_ACCESS_MODE:'phone_and_mandate'}});try{
    const b=t.browser();await signIn(t,b,{profile:ALICE});const user=t.db.getUserByEmail(ALICE.email);
    t.db.beginBillingPhone(user.id,'+447400123456','GB');assert.equal(t.db.completeBillingPhone(user.id,'+447400123456','GB'),true);
    await prepareBusiness(t,b,'GB',{invoiceCurrency:'GBP'});const me=await b.me();
    const r=await b.req('/api/business/setup/complete',{method:'POST',csrf:me.csrfToken,json:{confirmBusinessDetails:true}});assert.equal(r.status,200,await r.clone().text());
    assert.equal(t.db.getUserById(user.id).currency,'GBP');assert.equal(t.db.businessProfileComplete(user.id),true);
    const status=await (await b.req('/api/billing/status')).json();assert.equal(status.currency,'USD');assert.equal(status.monthlyPrice,20);assert.equal((await b.req('/api/workspace')).status,403);
  }finally{await t.close();}
});

test('country print profiles use explicit currency codes and full localized dates',()=>{
  assert.equal(invoiceCountry('US').paper,'Letter');assert.equal(invoiceCountry('GB').paper,'A4');
  assert.equal(invoiceCountry('CA').taxIdLabel,'GST/HST registration number');assert.equal(invoiceCountry('AU').taxIdLabel,'ABN');
  assert.match(invoiceMoney(1234.5,'EUR','DE'),/EUR/);assert.match(invoiceMoney(0.105,'KWD','KW'),/0.105/);
  assert.match(invoiceDate('2026-10-21','GB'),/2026/);assert.equal(invoiceDate('', 'GB'),'—');
});
