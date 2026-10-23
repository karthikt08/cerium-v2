import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openDb} from '../server/db.js';
import {businessLocalDate,businessLocalToInstant} from '../public/js/us-market.js';
import {gstBreakdown,validGSTIN,validUpiVpa,validIndianState} from '../public/js/india-market.js';
import {startServer,signIn,ALICE} from './helpers.js';

const taxId='33ABCDE1234F1Z5'; // Format-only fixture, never asserted as a registered GSTIN.

test('India helpers calculate intra-state CGST/SGST vs interstate IGST in rupees',()=>{
  assert.equal(validIndianState('33'),true);
  assert.equal(validIndianState('ZZ'),false);
  assert.equal(validGSTIN(taxId),true);
  assert.equal(validGSTIN('not a GSTIN'),false);
  assert.equal(businessLocalDate('Asia/Kolkata',new Date('2026-10-23T20:00:00.000Z')),'2026-10-24');
  assert.equal(businessLocalToInstant('2026-10-24T09:30','Asia/Kolkata'),'2026-10-24T04:00:00.000Z');
  assert.equal(validUpiVpa('merchant@okaxis'),true);
  assert.equal(validUpiVpa('https://evil.invalid'),false);
  assert.deepEqual(gstBreakdown(1000,18,'33','33'),{
    taxable:1000,gstRate:18,cgst:90,sgst:90,utgst:0,igst:0,total:1180
  });
  assert.deepEqual(gstBreakdown(1000,18,'33','29'),{
    taxable:1000,gstRate:18,cgst:0,sgst:0,utgst:0,igst:180,total:1180
  });
  const ut=gstBreakdown(1000,18,'34','34');
  assert.equal(ut.utgst,90);
  assert.equal(ut.sgst,0);
  assert.throws(()=>gstBreakdown(1000,18,'ZZ','33'));
});

test('fresh workspace can opt into India without converting existing USD monetary records',()=>{
  const db=openDb(':memory:');
  try{
    const u=db.createUser({email:'india-demo@example.test',name:'India User'});
    const changed=db.updateUser(u.id,{country:'IN',indiaState:'33',gstin:taxId,upiVpa:'merchant@okaxis'});
    assert.equal(changed.country,'IN');
    assert.equal(changed.currency,'INR');
    assert.equal(changed.time_zone,'Asia/Kolkata');
    assert.equal(changed.gstin,taxId);
    assert.equal(db.getWorkspace(u.id).account.monthlyPrice,500);
    const inv=db.createInvoice(u.id,{customerName:'Customer One',jobTitle:'Repair',amount:1000,status:'Draft',
      gstRate:18,hsnSac:'998314',placeOfSupply:'33'});
    const saved=db.getWorkspace(u.id).invoices.find(x=>x.id===inv.id);
    assert.equal(saved.currency,'INR');
    assert.equal(saved.taxable,1000);
    assert.equal(saved.cgst,90);
    assert.equal(saved.sgst,90);
    assert.equal(saved.total,1180);
    assert.equal(saved.supplierGstin,taxId);
    db.rawDb.prepare("UPDATE invoices SET supplier_gstin='' WHERE id=?").run(inv.id);
    assert.throws(()=>db.updateInvoiceStatus(u.id,inv.id,'Sent'),{code:'gst_review_required'});
    db.updateInvoice(u.id,inv.id,{amount:'1000',gstRate:'18',hsnSac:'998314',placeOfSupply:'33'});
    db.updateInvoice(u.id,inv.id,{amount:'2000',gstRate:'18',hsnSac:'998314',placeOfSupply:'29'});
    const second=db.getWorkspace(u.id).invoices.find(x=>x.id===inv.id);
    assert.equal(second.igst,360);
    assert.equal(second.total,2360);
    assert.throws(()=>db.updateUser(u.id,{country:'US'}),/empty workspace/);
    assert.throws(()=>db.updateUser(u.id,{currency:'USD'}),/Currency must match/);
  }finally{db.close();}
});

test('GST cannot be charged before a supplier GSTIN is configured',()=>{
  const db=openDb(':memory:');
  try{
    const user=db.createUser({email:'unregistered@example.test',name:'No GST'});
    db.updateUser(user.id,{country:'IN',indiaState:'29'});
    assert.throws(()=>db.createInvoice(user.id,{customerName:'A',jobTitle:'Service',amount:100,gstRate:18,
      hsnSac:'998314',placeOfSupply:'29'}),{code:'invalid_gst_invoice'});
    const normal=db.createInvoice(user.id,{customerName:'A',jobTitle:'Service',amount:100});
    assert.equal(normal.total,100);
    assert.equal(db.getWorkspace(user.id).invoices[0].currency,'INR');
  }finally{db.close();}
});

test('India workspaces can write and US workspaces retain USD-only semantics via API',async()=>{
  const t=await startServer();
  try{
    const browser=t.browser();await signIn(t,browser,{profile:ALICE});
    const csrf=(await browser.me()).csrfToken;
    const req=async(path,method='GET',json)=>{const r=await browser.req(path,{method,json,csrf});return {status:r.status,data:await r.json()};};
    const change=await req('/api/me','PATCH',{country:'IN',indiaState:'33',gstin:taxId});
    assert.equal(change.status,200,JSON.stringify(change.data));
    const made=await req('/api/invoices','POST',{customerName:'Customer A',jobTitle:'Repairs',amount:1000,
      status:'Draft',gstRate:18,placeOfSupply:'33',hsnSac:'998314'});
    assert.equal(made.status,201,JSON.stringify(made.data));
    const ws=(await req('/api/workspace')).data;
    assert.equal(ws.account.currency,'INR');
    assert.equal(ws.invoices[0].total,1180);
    const switchBack=await req('/api/me','PATCH',{country:'US'});
    assert.equal(switchBack.status,400);
  }finally{await t.close();}
});
