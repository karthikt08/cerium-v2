import test from 'node:test';
import assert from 'node:assert/strict';
import {invoiceUpiUri,invoiceShareLinks,invoiceUpiQrSvg} from '../public/js/invoice-sharing.js';

const base={country:'IN',currency:'INR',upiVpa:'merchant@bank',amount:1542.50,merchantName:'Test & Co',invoiceId:'INV 17',status:'Sent'};
const invoice={id:'INV 17',customerName:'Asha',customerEmail:'asha@example.com',jobTitle:'Painting',dueDate:'2026-11-05',currency:'INR',total:1542.5,status:'Sent'};

test('UPI is INR/India only, uses invoice-specific amount and safe escaped parameters',()=>{
  const link=invoiceUpiUri(base);
  assert.equal(link.split('?')[0],'upi://pay');
  const params=new URLSearchParams(link.split('?')[1]);
  assert.equal(params.get('pa'),'merchant@bank');
  assert.equal(params.get('pn'),'Test & Co');
  assert.equal(params.get('am'),'1542.50');
  assert.equal(params.get('cu'),'INR');
  assert.equal(params.get('tn'),'Invoice INV 17');
  for(const change of [{country:'US'},{currency:'USD'},{status:'Paid'},{upiVpa:'oops'},{upiVpa:''},{amount:0},{amount:Infinity}]) {
    assert.equal(invoiceUpiUri({...base,...change}),'');
  }
});

test('WhatsApp, SMS and email open prefilled drafts without a paid API or invoice URL',()=>{
  const uri=invoiceUpiUri(base);
  const links=invoiceShareLinks({invoice,merchantName:'Test & Co',upiUri:uri});
  assert.match(links.whatsapp,/^https:\/\/wa\.me\/\?text=/);
  assert.match(links.sms,/^sms:\?body=/);
  assert.match(links.email,/^mailto:asha%40example.com\?subject=/);
  assert.match(decodeURIComponent(links.whatsapp.split('text=')[1]),/upi:\/\/pay\?/);
  assert.match(links.body,/INR|₹/);
  assert.ok(!links.body.includes('https://cerium'));
  const noEmail=invoiceShareLinks({invoice:{...invoice,customerEmail:'bad?bcc=evil'},merchantName:'T'});
  assert.ok(noEmail.email.startsWith('mailto:?subject='));
  assert.match(invoiceShareLinks({invoice:{...invoice,status:'Draft'}}).subject,/^DRAFT/);
});

test('offline SVG QR uses a quiet zone and escapes no user input into markup',()=>{
  const stub={QrCode:{Ecc:{MEDIUM:1},encodeText:()=>({size:2,getModule:(x,y)=>x===y})}};
  const svg=invoiceUpiQrSvg('upi://pay?pa=merchant',stub);
  assert.match(svg,/viewBox="0 0 10 10"/);
  assert.match(svg,/M4 4h1v1h-1z/);
  assert.match(svg,/M5 5h1v1h-1z/);
  assert.equal(invoiceUpiQrSvg('javascript:alert(1)',stub),'');
});
