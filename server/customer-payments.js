import {businessLocalDate} from '../public/js/us-market.js';
import {randomUUID,createHash} from 'node:crypto';
const fail=(message,status=400)=>Object.assign(new Error(message),{status,code:'invalid_customer_payment'});
const scale=10000; // Preserve existing invoice precision without floating point sums.
const units=value=>{
  if(!['string','number'].includes(typeof value)||!/^\d+(?:\.\d{1,4})?$/.test(String(value))||!Number.isFinite(Number(value))||Number(value)<=0||Number(value)>1e11)throw fail('Enter a positive amount with at most four decimal places.');
  return Math.round(Number(value)*scale);
};
const text=(value,max=200)=>{if(value!==undefined&&(typeof value!=='string'||value.length>max))throw fail('Check the payment text fields.');return (value||'').trim();};
const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
export function createCustomerPaymentStore(db){
  db.exec(`CREATE TABLE IF NOT EXISTS customer_receipts(
    id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    customer_name TEXT NOT NULL,amount_units INTEGER NOT NULL,currency TEXT NOT NULL,paid_at TEXT NOT NULL,
    reference TEXT NOT NULL,notes TEXT NOT NULL,request_key TEXT NOT NULL,payload_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,voided_at TEXT,void_reason TEXT NOT NULL DEFAULT '',UNIQUE(user_id,request_key));
    CREATE TABLE IF NOT EXISTS invoice_allocations(
    id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receipt_id TEXT NOT NULL REFERENCES customer_receipts(id) ON DELETE CASCADE,
    invoice_id TEXT NOT NULL REFERENCES invoices(id),amount_units INTEGER NOT NULL,created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS allocation_invoice ON invoice_allocations(user_id,invoice_id);
    CREATE TABLE IF NOT EXISTS allocation_requests(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,receipt_id TEXT NOT NULL REFERENCES customer_receipts(id) ON DELETE CASCADE,request_key TEXT NOT NULL,payload_hash TEXT NOT NULL,PRIMARY KEY(user_id,receipt_id,request_key));
    CREATE INDEX IF NOT EXISTS allocation_receipt ON invoice_allocations(user_id,receipt_id);`);
  const sum=(userId,invoiceId)=>Number(db.prepare(`SELECT COALESCE(SUM(a.amount_units),0) AS n FROM invoice_allocations a JOIN customer_receipts r ON r.id=a.receipt_id WHERE a.user_id=? AND a.invoice_id=? AND r.voided_at IS NULL`).get(userId,String(invoiceId)).n);
  const hasHistory=(userId,invoiceId)=>Boolean(db.prepare('SELECT 1 FROM invoice_allocations WHERE user_id=? AND invoice_id=?').get(userId,String(invoiceId)));
  const receipt=(userId,id)=>{const row=db.prepare('SELECT * FROM customer_receipts WHERE user_id=? AND id=?').get(userId,id);if(!row)throw fail('Payment not found.',404);return row;};
  const allocatedReceipt=(userId,id)=>Number(db.prepare('SELECT COALESCE(SUM(amount_units),0) AS n FROM invoice_allocations WHERE user_id=? AND receipt_id=?').get(userId,id).n);
  const recompute=(userId,invoiceId)=>{
    const invoice=db.prepare('SELECT total FROM invoices WHERE user_id=? AND id=?').get(userId,invoiceId),paid=sum(userId,invoiceId),full=paid>=Math.round(invoice.total*scale);
    const latest=db.prepare('SELECT MAX(r.paid_at) AS day FROM invoice_allocations a JOIN customer_receipts r ON r.id=a.receipt_id WHERE a.user_id=? AND a.invoice_id=? AND r.voided_at IS NULL').get(userId,invoiceId).day;
    db.prepare('UPDATE invoices SET status=?,paid_at=? WHERE user_id=? AND id=?').run(full?'Paid':'Sent',full?latest:null,userId,invoiceId);
  };
  const allocate=(userId,r,allocations)=>{
    if(r.voided_at)throw fail('A voided payment cannot be allocated.',409);
    if(!Array.isArray(allocations)||allocations.length>50)throw fail('Provide up to 50 invoice allocations.');
    let available=r.amount_units-allocatedReceipt(userId,r.id);const seen=new Set();
    for(const a of allocations){
      if(typeof a?.invoiceId!=='string'||seen.has(a.invoiceId))throw fail('Choose each invoice only once.');seen.add(a.invoiceId);
      const amount=units(a.amount),i=db.prepare('SELECT * FROM invoices WHERE user_id=? AND id=?').get(userId,a.invoiceId);
      if(!i)throw fail('Choose an invoice from your workspace.');
      if(!['Sent','Overdue'].includes(i.status))throw fail('Allocate only to issued, unpaid invoices.',409);
      if(i.invoice_currency!==r.currency)throw fail('Payment and invoice currencies must match.');
      if(i.supplier_gstin&&(!i.hsn_sac||!i.place_of_supply))throw fail('Review GST invoice details first.',409);
      const outstanding=Math.round(i.total*scale)-sum(userId,i.id);
      if(amount>available||amount>outstanding)throw fail('Allocation exceeds the available payment or invoice balance.',409);
      if(r.paid_at<i.issue_date)throw fail('Payment date must be on or after the invoice issue date.');
      db.prepare('INSERT INTO invoice_allocations VALUES(?,?,?,?,?,?)').run(randomUUID(),userId,r.id,i.id,amount,new Date().toISOString());
      available-=amount;recompute(userId,i.id);
    }
  };
  return {
    paymentAllocationAmount:(userId,id)=>sum(userId,id)/scale,
    protectAllocatedInvoice(userId,invoice,total,status){
      if(!hasHistory(userId,invoice.id))return;
      const allocated=sum(userId,invoice.id),expected=allocated>=Math.round(invoice.total*scale)?'Paid':null;
      if(Math.round(total*scale)!==Math.round(invoice.total*scale)||allocated&&(expected?status!=='Paid':!['Sent','Overdue'].includes(status)))throw fail('This invoice has payment allocations. Keep its total and payment status consistent with the ledger.',409);
    },
    hasInvoiceAllocations:hasHistory,
    listCustomerPayments(userId){return db.prepare('SELECT * FROM customer_receipts WHERE user_id=? ORDER BY paid_at DESC,created_at DESC').all(userId).map(r=>({
      id:r.id,customerName:r.customer_name,amount:r.amount_units/scale,currency:r.currency,paidAt:r.paid_at,reference:r.reference,notes:r.notes,
      createdAt:r.created_at,voidedAt:r.voided_at,voidReason:r.void_reason,unallocated:r.voided_at?0:(r.amount_units-allocatedReceipt(userId,r.id))/scale,
      allocations:db.prepare('SELECT invoice_id,amount_units FROM invoice_allocations WHERE user_id=? AND receipt_id=?').all(userId,r.id).map(a=>({invoiceId:a.invoice_id,amount:a.amount_units/scale}))
    }));},
    recordCustomerPayment(userId,p){return db.transaction(()=>{
      if(!p||p.confirmed!==true)throw fail('Confirm that you verified receipt of this payment.');
      const key=text(p.requestKey,100);if(!/^[a-zA-Z0-9_-]{16,100}$/.test(key))throw fail('Provide a valid payment request key.');
      const hash=createHash('sha256').update(JSON.stringify(p)).digest('hex'),existing=db.prepare('SELECT * FROM customer_receipts WHERE user_id=? AND request_key=?').get(userId,key);
      if(existing){if(existing.payload_hash!==hash)throw fail('This request key was already used for a different payment.',409);return {id:existing.id};}
      const amount=units(p.amount),name=text(p.customerName,120),reference=text(p.reference),notes=text(p.notes,1000),owner=db.prepare('SELECT currency,country,time_zone FROM users WHERE id=?').get(userId);
      if(!name||!validDate(p.paidAt)||p.paidAt>businessLocalDate(owner.country==='IN'?'Asia/Kolkata':owner.time_zone))throw fail('Enter a customer and a valid payment date that is not in the future.');
      if(p.currency!==owner.currency)throw fail('Payment currency must match the workspace.');
      if(reference&&db.prepare('SELECT 1 FROM customer_receipts WHERE user_id=? AND reference=? AND voided_at IS NULL').get(userId,reference))throw fail('This payment reference is already recorded.',409);
      const id=randomUUID();db.prepare('INSERT INTO customer_receipts(id,user_id,customer_name,amount_units,currency,paid_at,reference,notes,request_key,payload_hash,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,userId,name,amount,p.currency,p.paidAt,reference,notes,key,hash,new Date().toISOString());
      allocate(userId,receipt(userId,id),p.allocations||[]);return {id};
    })();},
    allocateCustomerPayment(userId,id,p){return db.transaction(()=>{if(p?.confirmed!==true||!p.allocations?.length)throw fail('Confirm the selected allocation.');const key=text(p.requestKey,100);if(!/^[a-zA-Z0-9_-]{16,100}$/.test(key))throw fail('Provide an allocation request key.');
      const hash=createHash('sha256').update(JSON.stringify(p)).digest('hex'),prior=db.prepare('SELECT payload_hash FROM allocation_requests WHERE user_id=? AND receipt_id=? AND request_key=?').get(userId,id,key);
      if(prior){if(prior.payload_hash!==hash)throw fail('Request key already used.',409);return {ok:true};}
      allocate(userId,receipt(userId,id),p.allocations);
      db.prepare('INSERT INTO allocation_requests VALUES(?,?,?,?)').run(userId,id,key,hash);return {ok:true};})();},
    voidCustomerPayment(userId,id,p){return db.transaction(()=>{
      const r=receipt(userId,id),reason=text(p?.reason,500);if(!reason||p?.confirmed!==true)throw fail('Confirm the reversal and enter a reason.');
      if(r.voided_at)return {ok:true};
      db.prepare('UPDATE customer_receipts SET voided_at=?,void_reason=? WHERE user_id=? AND id=?').run(new Date().toISOString(),reason,userId,id);
      for(const a of db.prepare('SELECT DISTINCT invoice_id FROM invoice_allocations WHERE user_id=? AND receipt_id=?').all(userId,id))recompute(userId,a.invoice_id);
      return {ok:true};
    })();},
    clearCustomerPayments(userId){db.prepare('DELETE FROM invoice_allocations WHERE user_id=?').run(userId);db.prepare('DELETE FROM customer_receipts WHERE user_id=?').run(userId);},
  };
}
