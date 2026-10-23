import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startServer,signIn,ALICE,BOB} from './helpers.js';

async function setup(run) {
  const t=await startServer();
  try {
    const a=t.browser(),b=t.browser();
    await signIn(t,a,{profile:ALICE});
    await signIn(t,b,{profile:BOB});
    const ac=(await a.me()).csrfToken,bc=(await b.me()).csrfToken;
    const call=async(browser,csrf,url,method='GET',json)=>{
      const r=await browser.req(url,{method,json,csrf});
      return {status:r.status,data:await r.json()};
    };
    await run({t,a,b,A:(u,m,j)=>call(a,ac,u,m,j),B:(u,m,j)=>call(b,bc,u,m,j)});
  } finally {await t.close();}
}

const job={title:'Heating service',customerName:'River Property',customerPhone:'555-0100',
  address:'123 Main St',startAt:'2026-11-03T09:00',endAt:'2026-11-03T11:00'};

test('Completing a job creates one linked Draft invoice, never an external send',()=>setup(async({A})=>{
  const initial=await A('/api/jobs','POST',job);
  assert.equal(initial.status,201);
  assert.equal((await A('/api/workspace')).data.invoices.length,0);
  const completed=await A('/api/jobs/'+initial.data.id,'PATCH',{status:'Completed'});
  assert.equal(completed.status,200);
  const ws=(await A('/api/workspace')).data;
  assert.equal(ws.invoices.length,1);
  assert.equal(ws.invoices[0].status,'Draft');
  assert.equal(ws.invoices[0].total,0);
  assert.equal(ws.invoices[0].jobId,initial.data.id);
  assert.equal(ws.jobs[0].invoiceId,ws.invoices[0].id);
  assert.equal(ws.jobs[0].invoiceGenerated,true);
  assert.equal(ws.invoices[0].items[0].description,job.title);
  assert.equal((await A('/api/invoices/'+ws.invoices[0].id+'/status','PATCH',{status:'Sent'})).status,409);
  assert.equal((await A('/api/jobs/'+initial.data.id,'PATCH',{status:'In progress'})).status,200);
  assert.equal((await A('/api/jobs/'+initial.data.id,'PATCH',{status:'Completed'})).status,200);
  assert.equal((await A('/api/workspace')).data.invoices.length,1);
}));

test('Billable labor/material items become editable invoice lines with accurate totals',()=>setup(async({A})=>{
  const billableItems=[
    {description:'Labor',qty:2,rate:85.25},
    {description:'Capacitor',qty:1,rate:49.99},
  ];
  const created=await A('/api/jobs','POST',{...job,status:'Completed',billableItems});
  assert.equal(created.status,201);
  const ws=(await A('/api/workspace')).data;
  const inv=ws.invoices[0];
  assert.equal(inv.status,'Draft');
  assert.deepEqual(inv.items,billableItems);
  assert.equal(inv.total,220.49);
  assert.equal(created.data.invoiceGenerated,true);
  assert.equal((await A('/api/invoices/'+inv.id,'PATCH',{
    items:[{description:'Labor',qty:2.5,rate:89.95},{description:'Capacitor',qty:1,rate:50}],
    status:'Draft',
  })).status,200);
  const revised=(await A('/api/workspace')).data.invoices[0];
  assert.equal(revised.total,274.88);
  assert.equal(revised.jobId,created.data.id);
  assert.equal((await A('/api/invoices/'+inv.id+'/status','PATCH',{status:'Sent'})).status,200);
  assert.equal((await A('/api/workspace')).data.invoices[0].status,'Sent');
}));

test('Draft generation is stable across edits and deletion is never automatically undone',()=>setup(async({A})=>{
  const result=await A('/api/jobs','POST',{...job,status:'Completed',billableItems:[{description:'Repair',qty:1,rate:75}]});
  assert.equal(result.status,201);
  const inv=(await A('/api/workspace')).data.invoices[0];
  await A('/api/jobs/'+result.data.id,'PATCH',{title:'Updated completed job'});
  assert.equal((await A('/api/workspace')).data.invoices.length,1);
  assert.equal((await A('/api/invoices/'+inv.id,'DELETE')).status,200);
  const changed=await A('/api/jobs/'+result.data.id,'PATCH',{status:'Scheduled'});
  assert.equal(changed.status,200);
  await A('/api/jobs/'+result.data.id,'PATCH',{status:'Completed'});
  const ws=(await A('/api/workspace')).data;
  assert.equal(ws.invoices.length,0,'invoice intentionally deleted must not reappear');
  assert.equal(ws.jobs[0].invoiceGenerated,true);
  assert.equal(ws.jobs[0].invoiceId,null);
}));

test('Deleting completed job keeps invoice and removes the dangling link',()=>setup(async({A})=>{
  const created=await A('/api/jobs','POST',{...job,status:'Completed'});
  assert.equal(created.status,201);
  const id=(await A('/api/workspace')).data.invoices[0].id;
  assert.equal((await A('/api/jobs/'+created.data.id,'DELETE')).status,200);
  const ws=(await A('/api/workspace')).data;
  assert.equal(ws.jobs.length,0);
  assert.equal(ws.invoices.length,1);
  assert.equal(ws.invoices[0].id,id);
  assert.equal(ws.invoices[0].jobId,null);
}));

test('Source linkage is tenant isolated and trial expiry blocks draft generation',()=>setup(async({t,a,A,B})=>{
  const created=await A('/api/jobs','POST',job);
  assert.equal(created.status,201);
  assert.equal((await B('/api/workspace')).data.invoices.length,0);
  assert.notEqual((await B('/api/jobs/'+created.data.id,'PATCH',{status:'Completed'})).status,200);
  const user=(await a.me()).user;
  t.db.setUserPlan(user.id,{plan:'expired',planStatus:'expired'});
  assert.equal((await A('/api/jobs/'+created.data.id,'PATCH',{status:'Completed'})).status,403);
  assert.equal((await A('/api/workspace')).data.invoices.length,0);
}));

test('Job drafts and their provenance are included in exports and clear-workspace',()=>setup(async({A})=>{
  const created=await A('/api/jobs','POST',{...job,status:'Completed'});
  const exported=(await A('/api/me/export')).data.workspace;
  assert.equal(exported.jobs.length,1);
  assert.equal(exported.invoices[0].jobId,created.data.id);
  assert.equal(exported.jobs[0].invoiceId,exported.invoices[0].id);
  assert.equal((await A('/api/me/data','DELETE')).status,200);
  const cleared=(await A('/api/workspace')).data;
  assert.equal(cleared.jobs.length,0);
  assert.equal(cleared.invoices.length,0);
}));

test('Reject malformed billable items rather than recording misleading invoices',()=>setup(async({A})=>{
  for (const item of [
    {description:'Labor',qty:1,rate:-10},
    {description:'Labor',qty:0,rate:10},
    {description:'Labor',qty:1,rate:1.123},
    {description:'',qty:1,rate:99},
  ]) {
    const response=await A('/api/jobs','POST',{...job,billableItems:[item],status:'Completed'});
    assert.equal(response.status,400);
    assert.equal(response.data.error,'invalid_items');
  }
  assert.equal((await A('/api/workspace')).data.invoices.length,0);
}));
