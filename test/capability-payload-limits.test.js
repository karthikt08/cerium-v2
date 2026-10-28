import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {startServer,signIn,ALICE} from './helpers.js';

test('migration, templates and split-payment payloads fit their bounded API parsers',async()=>{
  const t=await startServer();try{
    const browser=t.browser();await signIn(t,browser,{profile:ALICE});const me=await browser.me();
    const post=(path,json)=>browser.req(path,{method:'POST',csrf:me.csrfToken,json});
    const csv='Description,Date,Amount,Notes\n'+Array.from({length:30},(_,i)=>`Expense ${i},2026-10-01,10,${'Detail '.repeat(30)}`).join('\n');
    const upload={target:'expenses',filename:'history.csv',content:Buffer.from(csv).toString('base64')};
    assert.ok(JSON.stringify(upload).length>2048);
    const preview=await post('/api/migration/preview',upload);
    assert.equal(preview.status,200,await preview.clone().text());assert.equal((await preview.json()).ready,30);
    assert.equal(t.db.getWorkspace(me.user.id).operations.expenses.length,0,'preview remains read-only');
    const template=await post('/api/operations/templates',{name:'Long approved draft',subject:'Invoice {invoice}',body:'A'.repeat(2500)});
    assert.equal(template.status,201,await template.clone().text());
    const allocations=Array.from({length:40},()=>({invoiceId:t.db.createInvoice(me.user.id,{customerName:'Same customer',jobTitle:'Work',amount:1,status:'Sent',issueDate:'2026-10-01',dueDate:'2026-10-10'}).id,amount:1}));
    const payload={customerName:'Same customer',amount:40,currency:'USD',paidAt:'2026-10-20',notes:'N'.repeat(1000),confirmed:true,requestKey:randomUUID(),allocations};
    assert.ok(JSON.stringify(payload).length>2048);
    const payment=await post('/api/customer-payments',payload);
    assert.equal(payment.status,201,await payment.clone().text());
    assert.equal(t.db.getWorkspace(me.user.id).invoices.filter(i=>i.status==='Paid').length,40);
  }finally{await t.close();}
});
