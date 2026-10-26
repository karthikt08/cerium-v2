import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {openDb} from '../server/db.js';
import {indiaInvoiceMode,prepareIndiaInvoicePayload} from '../public/js/india-invoice-mode.js';
import {startServer,signIn,ALICE} from './helpers.js';

const gstin='33ABCDE1234F1Z5'; // Valid format fixture, not a verified registration.

test('Only Indian GST-registered businesses need the GST invoice controls',()=>{
  assert.equal(indiaInvoiceMode({country:'IN',gstin:''}),'commercial');
  assert.equal(indiaInvoiceMode({country:'IN',gstin:gstin}),'gst');
  assert.equal(indiaInvoiceMode({country:'US',gstin:''}),'international');
  assert.equal(indiaInvoiceMode({country:'IN',gstin:''},{supplierGstin:gstin,status:'Sent'}),'gst');
  assert.equal(indiaInvoiceMode({country:'IN',gstin:''},{supplierGstin:gstin,status:'Paid'}),'gst');
  assert.equal(indiaInvoiceMode({country:'IN',gstin:''},{supplierGstin:gstin,status:'Draft'}),'commercial');
  const cleaned=prepareIndiaInvoicePayload({customerName:'A',gstRate:18,customerGstin:gstin,hsnSac:'998314',placeOfSupply:'33'},'commercial');
  assert.equal(cleaned.customerName,'A');
  assert.deepEqual({gstRate:cleaned.gstRate,customerGstin:cleaned.customerGstin,hsnSac:cleaned.hsnSac,placeOfSupply:cleaned.placeOfSupply},
    {gstRate:0,customerGstin:'',hsnSac:'',placeOfSupply:''});
  const registered=prepareIndiaInvoicePayload({gstRate:18,hsnSac:'998314'},'gst');
  assert.equal(registered.gstRate,18);
  assert.equal(registered.hsnSac,'998314');
});

test('Unregistered India business can issue, update and mark a regular invoice paid',()=>{
  const db=openDb(':memory:');
  try{
    const u=db.createUser({email:'commercial-invoice@example.test',name:'Small Shop'});
    const profile=db.updateUser(u.id,{country:'IN',indiaState:'33',gstin:''});
    assert.equal(profile.gstin,'');
    const inv=db.createInvoice(u.id,{
      customerName:'Walk-in customer',jobTitle:'Fabrics',amount:'1250',status:'Sent',
      ...prepareIndiaInvoicePayload({},'commercial')
    });
    assert.equal(inv.total,1250);
    assert.equal(inv.gstRate,0);
    assert.equal(inv.supplierGstin,'');
    assert.equal(inv.cgst,0);
    assert.equal(inv.sgst,0);
    assert.equal(inv.igst,0);
    db.updateInvoice(u.id,inv.id,{
      customerName:'Walk-in customer',jobTitle:'Fabrics',amount:'1475',status:'Sent',
      ...prepareIndiaInvoicePayload({},'commercial')
    });
    const edited=db.getWorkspace(u.id).invoices.find(x=>x.id===inv.id);
    assert.equal(edited.total,1475);
    assert.equal(edited.supplierGstin,'');
    db.updateInvoiceStatus(u.id,inv.id,'Paid');
    const paid=db.getWorkspace(u.id).invoices.find(x=>x.id===inv.id);
    assert.equal(paid.status,'Paid');
    assert.equal(paid.total,1475);
    assert.equal(paid.gstRate,0);
  }finally{db.close();}
});

test('Unregistered suppliers still cannot add GST amounts or collect GST',()=>{
  const db=openDb(':memory:');
  try{
    const u=db.createUser({email:'no-gst-charge@example.test',name:'No GST'});
    db.updateUser(u.id,{country:'IN',indiaState:'33',gstin:''});
    for(const fields of [
      {gstRate:18,hsnSac:'998314',placeOfSupply:'33'},
      {gstRate:0,hsnSac:'998314'},
      {gstRate:0,customerGstin:gstin}
    ]){
      assert.throws(()=>db.createInvoice(u.id,{customerName:'Customer',jobTitle:'Fabrics',amount:100,...fields}),
        {code:'invalid_gst_invoice'});
    }
  }finally{db.close();}
});

test('Registered businesses still require GST data and historical issued GST details remain preserved',()=>{
  const db=openDb(':memory:');
  try{
    const u=db.createUser({email:'registered-invoice@example.test',name:'Registered Business'});
    db.updateUser(u.id,{country:'IN',indiaState:'33',gstin});
    assert.throws(()=>db.createInvoice(u.id,{customerName:'A',jobTitle:'Service',amount:1000,status:'Sent'}),{code:'invalid_gst_invoice'});
    const inv=db.createInvoice(u.id,{customerName:'A',jobTitle:'Service',amount:1000,status:'Sent',gstRate:18,hsnSac:'998314',placeOfSupply:'33'});
    assert.equal(inv.total,1180);
    db.updateUser(u.id,{gstin:''});
    const old=db.getWorkspace(u.id).invoices.find(x=>x.id===inv.id);
    assert.equal(old.supplierGstin,gstin);
    assert.equal(old.total,1180);
    assert.equal(indiaInvoiceMode({country:'IN',gstin:''},old),'gst');
  }finally{db.close();}
});

test('India unregistered invoice works through the authenticated API in Sent status',async()=>{
  const t=await startServer();
  try{
    const browser=t.browser();
    await signIn(t,browser,{profile:ALICE});
    const csrf=(await browser.me()).csrfToken;
    const profile=await browser.req('/api/me',{method:'PATCH',csrf,json:{country:'IN',indiaState:'33',gstin:''}});
    assert.equal(profile.status,200);
    const saved=await browser.req('/api/invoices',{
      method:'POST',csrf,json:{customerName:'Unregistered supplier sale',jobTitle:'Shop sale',amount:500,status:'Sent',...prepareIndiaInvoicePayload({},'commercial')}
    });
    assert.equal(saved.status,201,await saved.text());
    const workspace=await browser.req('/api/workspace');
    assert.equal(workspace.status,200);
    const data=await workspace.json();
    const invoice=data.invoices.find(i=>i.customerName==='Unregistered supplier sale');
    assert.ok(invoice);
    assert.equal(invoice.status,'Sent');
    assert.equal(invoice.total,500);
    assert.equal(invoice.supplierGstin,'');
    assert.equal(invoice.gstRate,0);
  }finally{await t.close();}
});

test('India invoice dialog differentiates commercial and GST invoices without removing print or other tax flows',()=>{
  const ui=fs.readFileSync(new URL('../public/js/app.js',import.meta.url),'utf8');
  assert.match(ui,/indiaInvoiceMode\(state\.ws\.account,v\)/);
  assert.match(ui,/invoiceMode==='gst'/);
  assert.match(ui,/Commercial invoice · No GST charged/);
  assert.match(ui,/prepareIndiaInvoicePayload\(values,indiaInvoiceMode/);
  assert.match(ui,/This is not a GST tax invoice/);
  assert.match(ui,/gst\?'DRAFT GST TAX INVOICE':'INVOICE'/);
  assert.match(ui,/openInvoicePrint/);
});
