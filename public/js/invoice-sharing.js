/**
 * Client-side invoice handoff only: no message is sent, and no payment is collected.
 * The UPI URI is derived from an invoice's frozen payment snapshot, not a live
 * Settings value that could change after issue.
 */
import {validUpiVpa} from './india-market.js';

export function invoiceUpiUri({country,currency,upiVpa,amount,merchantName,invoiceId,status} = {}) {
  const value=String(upiVpa||'').trim();
  const numericAmount=Number(amount);
  if(country!=='IN'||currency!=='INR'||status==='Paid'||!value||!validUpiVpa(value)||
    !Number.isFinite(numericAmount)||numericAmount<=0||numericAmount>1e11) return '';
  const params=new URLSearchParams({
    pa:value,
    pn:String(merchantName||'Merchant').trim().slice(0,60)||'Merchant',
    am:numericAmount.toFixed(2),
    cu:'INR',
    tn:('Invoice '+String(invoiceId??'')).slice(0,80)
  });
  return 'upi://pay?'+params.toString();
}

/**
 * Channel deep links open a draft in the user's own app; no WhatsApp Business
 * API, SMS gateway, email provider, or paid invoice-hosting service is needed.
 * These drafts contain invoice details, NOT a PDF attachment.
 */
export function invoiceShareLinks({invoice,merchantName,upiUri=''} = {}) {
  if(!invoice) throw new TypeError('Invoice is required.');
  const number=String(invoice.id??'').slice(0,80);
  const customer=String(invoice.customerName||'Customer').trim().slice(0,120);
  const business=String(merchantName||'Your business').trim().slice(0,120);
  const currency=String(invoice.currency||'USD');
  const total=Number(invoice.total);
  const amount=Number.isFinite(total)&&total>=0
    ?new Intl.NumberFormat('en',{style:'currency',currency}).format(total)
    :currency+' '+String(invoice.total??'');
  const date=String(invoice.dueDate||'').slice(0,20);
  const draft=invoice.status==='Draft'?'DRAFT ':'';
  const subject=draft+'Invoice #'+number+' from '+business;
  const body=[
    'Hi '+customer+',',
    '',
    'Here are the details for '+draft.toLowerCase()+'invoice #'+number+' from '+business+'.',
    'Work: '+String(invoice.jobTitle||'Services').slice(0,160),
    'Invoice total: '+amount,
    ...(invoice.allocatedAmount>0?['Recorded allocations: '+currency+' '+invoice.allocatedAmount,'Remaining balance: '+currency+' '+invoice.balance]:[]),
    ...(date?['Due: '+date]:[]),
    ...(upiUri?['Pay with a UPI app: '+upiUri]:[]),
    '',
    'Please contact us if you need the full invoice PDF.'
  ].join('\n');
  const email=String(invoice.customerEmail||'').trim();
  const validEmail=/^[^\s@?&#:;]+@[^\s@?&#:;]+\.[^\s@?&#:;]+$/.test(email)&&email.length<=254;
  return {
    whatsapp:'https://wa.me/?text='+encodeURIComponent(body),
    sms:'sms:?body='+encodeURIComponent(body),
    email:'mailto:'+(validEmail?encodeURIComponent(email):'')+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body),
    body,subject
  };
}

/** Generate a true offline SVG QR, including the standard 4-module quiet zone. */
export function invoiceUpiQrSvg(uri,encoder=globalThis.qrgen) {
  if(typeof uri!=='string'||!uri.startsWith('upi://pay?')||uri.length>1024||!encoder?.QrCode) return '';
  try {
    const qr=encoder.QrCode.encodeText(uri,encoder.QrCode.Ecc.MEDIUM);
    const dots=[];
    for(let y=0;y<qr.size;y++)for(let x=0;x<qr.size;x++){
      if(qr.getModule(x,y))dots.push('M'+(x+4)+' '+(y+4)+'h1v1h-1z');
    }
    const extent=qr.size+8;
    return '<svg class="invoice-upi-qr" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Scan with any compatible UPI app to pay this invoice" viewBox="0 0 '+extent+' '+extent+'"><rect width="'+extent+'" height="'+extent+'" fill="#fff"/><path fill="#14233e" d="'+dots.join('')+'"/></svg>';
  } catch { return ''; }
}
