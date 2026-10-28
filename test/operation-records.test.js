import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startServer,signIn,ALICE,BOB} from './helpers.js';
import {buildReminderEmail} from '../server/reminder-smtp.js';

test('operations: isolated records, availability conflicts, attendance, editing, expiry and export',async()=>{
  const t=await startServer();
  try{
    const a=t.browser(),b=t.browser();await signIn(t,a,{profile:ALICE});await signIn(t,b,{profile:BOB});
    const ac=(await a.me()).csrfToken,bc=(await b.me()).csrfToken;
    const call=async(path,method='GET',json,other=false)=>{const r=await (other?b:a).req(path,{method,json,csrf:other?bc:ac});return {status:r.status,data:await r.json()};};
    const worker=(await call('/api/crew','POST',{name:'Operator'})).data;
    assert.equal((await call('/api/crew/'+worker.id,'PATCH',{name:'Updated Operator'})).data.name,'Updated Operator');
    assert.equal((await call('/api/crew/'+worker.id,'PATCH',{name:'Intruder'},true)).status,404);
    const interval={workerId:worker.id,startAt:'2026-11-02T09:00',endAt:'2026-11-02T17:00',type:'Available'};
    assert.equal((await call('/api/operations/availability','POST',interval)).status,201);
    assert.equal((await call('/api/operations/availability','POST',interval,true)).status,400);
    assert.equal((await call('/api/operations/availability','GET',undefined,true)).data.length,0);
    const job={title:'Service',customerName:'Customer',startAt:'2026-11-02T10:00',endAt:'2026-11-02T11:00'};
    const made=(await call('/api/jobs','POST',job)).data;
    assert.equal((await call('/api/operations/dispatch/'+made.id)).data[0].available,true);
    assert.equal((await call('/api/jobs/'+made.id,'PATCH',{workerId:worker.id})).status,200);
    assert.equal((await call('/api/jobs','POST',{...job,workerId:worker.id,startAt:'2026-11-02T18:00',endAt:'2026-11-02T19:00'})).status,409);
    assert.equal((await call('/api/operations/availability','POST',{...interval,type:'Unavailable'})).status,409);
    const shift=(await call('/api/operations/timesheets','POST',{workerId:worker.id,jobId:made.id,startAt:'2026-11-02T09:00',breakMinutes:0})).data;
    assert.ok(shift.id);
    assert.equal((await call('/api/operations/timesheets','POST',{workerId:worker.id,startAt:'2026-11-02T10:00'})).status,409);
    assert.equal((await call('/api/operations/timesheets/'+shift.id,'PATCH',{endAt:'2026-11-02T17:00',breakMinutes:30})).status,200);
    assert.equal((await call('/api/operations/timesheets/'+shift.id,'DELETE',undefined,true)).status,404);
    const exported=(await call('/api/me/export')).data;
    assert.equal(exported.workspace.operations.timesheets[0].breakMinutes,30);
    const user=(await a.me()).user;t.db.setUserPlan(user.id,{plan:'expired',planStatus:'expired'});
    assert.equal((await call('/api/operations/timesheets/'+shift.id,'PATCH',{notes:'Blocked'})).status,403);
    assert.equal((await call('/api/operations/timesheets')).data.length,1);
    assert.equal((await call('/api/me/data','DELETE')).status,200);
    assert.equal((await call('/api/operations/timesheets')).data.length,0);
  }finally{await t.close();}
});

test('approved reminders snapshot owned templates and retain unsubscribe instructions',async()=>{
  const t=await startServer();try{
    const a=t.browser();await signIn(t,a,{profile:ALICE});const me=await a.me(),uid=me.user.id;
    const template=t.db.saveOperationRecord(uid,'templates',null,{name:'Polite',subject:'Invoice {invoice}',body:'Hello {customer}, please review {amount} due {dueDate}.'});
    const invoice=t.db.createInvoice(uid,{customerName:'Person',customerEmail:'person@example.com',jobTitle:'Service',amount:20,status:'Sent'});
    const reminder=t.db.createReminder(uid,{invoiceId:invoice.id,templateId:template.id,dueAt:new Date(Date.now()+86400000).toISOString(),approved:true,consentConfirmed:true});
    t.db.saveOperationRecord(uid,'templates',template.id,{body:'Changed afterwards'});
    const snapshot=JSON.parse(t.db.rawDb.prepare('SELECT template_json FROM email_reminders WHERE id=?').get(reminder.id).template_json);
    assert.match(snapshot.body,/Hello/);
    const email=buildReminderEmail({businessName:'Business',recipient:'person@example.com',invoice:{id:invoice.id,customer_name:'Person',total:20,invoice_currency:'USD',due_date:'2026-11-02'},template:snapshot,unsubscribeUrl:'https://example.com/unsubscribe'});
    assert.match(email.body,/Person/);assert.match(email.body,/\$20\.00/);assert.match(email.body,/https:\/\/example.com\/unsubscribe/);
    assert.throws(()=>t.db.saveOperationRecord(uid,'templates',null,{name:'Invalid',subject:'Injected\nHeader',body:'text'}));
  }finally{await t.close();}
});
