import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startServer,signIn,ALICE,BOB} from './helpers.js';

async function setup(run){
  const t=await startServer();
  try{
    const alice=t.browser(),bob=t.browser();
    await signIn(t,alice,{profile:ALICE});await signIn(t,bob,{profile:BOB});
    const aToken=(await alice.me()).csrfToken,bToken=(await bob.me()).csrfToken;
    const call=async(browser,csrf,path,method='GET',json)=>{
      const res=await browser.req(path,{method,json,csrf});
      return {status:res.status,data:await res.json()};
    };
    await run({t,alice,bob,A:(p,m,j)=>call(alice,aToken,p,m,j),B:(p,m,j)=>call(bob,bToken,p,m,j)});
  }finally{await t.close();}
}

const quote={
  title:'AC repair and compressor parts',
  customerName:'Test Customer',
  customerEmail:'test@example.net',
  customerPhone:'555-0100',
  address:'123 Service Lane',
  notes:'Labor and parts, subject to site conditions.',
  items:[{description:'AC diagnosis',qty:1,rate:50},
    {description:'Compressor labor',qty:2,rate:75},
    {description:'Replacement part',qty:1,rate:40}],
};
const schedule={startAt:'2026-11-12T09:00',endAt:'2026-11-12T11:00'};

test('quote lifecycle: linked lead → shareable estimate → customer approves → scheduled job → one draft invoice',()=>setup(async({t,alice,bob,A,B})=>{
  const lead=await A('/api/leads','POST',{name:'Test Customer',email:'test@example.net'});
  assert.equal(lead.status,201);
  const created=await A('/api/quotes','POST',{...quote,leadId:lead.data.id});
  assert.equal(created.status,201);
  assert.equal(created.data.status,'Draft');
  assert.equal(created.data.total,240);
  assert.equal((await A('/api/workspace')).data.quotes.length,1);
  assert.equal((await B('/api/workspace')).data.quotes.length,0);
  assert.equal((await B('/api/quotes/'+created.data.id+'/link')).status,404);

  const share=await A('/api/quotes/'+created.data.id+'/send','POST');
  assert.equal(share.status,200);
  assert.equal(share.data.quote.status,'Sent');
  assert.match(share.data.url,/\/quote\/.+\?token=/);
  const address=new URL(share.data.url);
  const path=address.pathname+address.search;
  const token=address.searchParams.get('token');
  const visitor=t.browser(); // no customer account or login required
  const publicResponse=await visitor.req(path);
  assert.equal(publicResponse.status,200);
  const html=await publicResponse.text();
  assert.match(html,/AC repair and compressor parts/);
  assert.match(html,/Accept estimate/);
  assert.match(html,/240/);
  assert.match(publicResponse.headers.get('x-robots-tag'),/noindex/);

  const accept=await visitor.req('/quote/'+created.data.id+'/respond',{method:'POST',form:{token,decision:'Accepted'}});
  assert.equal(accept.status,200);
  assert.match(await accept.text(),/Estimate accepted/);
  assert.equal((await A('/api/workspace')).data.quotes[0].status,'Accepted');
  assert.equal((await B('/api/quotes/'+created.data.id+'/convert','POST',schedule)).status,404);
  const jobResult=await A('/api/quotes/'+created.data.id+'/convert','POST',schedule);
  assert.equal(jobResult.status,201);
  assert.equal(jobResult.data.job.status,'Scheduled');
  assert.equal(jobResult.data.job.customerName,'Test Customer');
  assert.equal(jobResult.data.job.leadId,lead.data.id);
  assert.deepEqual(jobResult.data.job.billableItems,quote.items);
  assert.equal(jobResult.data.quote.status,'Converted');
  const jobId=jobResult.data.job.id;
  assert.equal((await A('/api/quotes/'+created.data.id+'/convert','POST',schedule)).status,409);
  assert.equal((await A('/api/workspace')).data.invoices.length,0);

  const completed=await A('/api/jobs/'+jobId,'PATCH',{status:'Completed'});
  assert.equal(completed.status,200);
  const ws=(await A('/api/workspace')).data;
  assert.equal(ws.invoices.length,1);
  assert.equal(ws.invoices[0].status,'Draft');
  assert.equal(ws.invoices[0].jobId,jobId);
  assert.equal(ws.invoices[0].total,240);
  assert.deepEqual(ws.invoices[0].items,quote.items);
  assert.equal(ws.quotes[0].jobId,jobId);
  assert.equal((await A('/api/jobs/'+jobId,'PATCH',{status:'Completed'})).status,200);
  assert.equal((await A('/api/workspace')).data.invoices.length,1);
}));

test('quote edits are draft-only and share links do not silently send mail',()=>setup(async({A})=>{
  const created=await A('/api/quotes','POST',quote);
  assert.equal(created.status,201);
  const id=created.data.id;
  const changed=await A('/api/quotes/'+id,'PATCH',{
    ...quote,items:[{description:'Inspection',qty:2.5,rate:89.95}],
  });
  assert.equal(changed.status,200);
  assert.equal(changed.data.total,224.88);
  assert.equal((await A('/api/quotes/'+id+'/link')).status,409);
  const sent=await A('/api/quotes/'+id+'/send','POST');
  assert.equal(sent.status,200);
  assert.equal((await A('/api/quotes/'+id+'/send','POST')).status,409);
  assert.equal((await A('/api/quotes/'+id,'PATCH',quote)).status,409);
  assert.equal((await A('/api/workspace')).data.jobs.length,0);
  assert.equal((await A('/api/workspace')).data.invoices.length,0);
  assert.equal((await A('/api/quotes/'+id+'/link')).data.url,sent.data.url);
}));

test('public approval links resist tampering, duplicate answers, and cross-origin writes',()=>setup(async({t,alice,A})=>{
  const id=(await A('/api/quotes','POST',quote)).data.id;
  const draftPage=await alice.req('/quote/'+id+'?token=x');
  assert.equal(draftPage.status,404);
  const sent=(await A('/api/quotes/'+id+'/send','POST')).data;
  const parsed=new URL(sent.url),token=parsed.searchParams.get('token');
  assert.equal((await alice.req('/quote/'+id+'?token='+encodeURIComponent(token+'x'))).status,404);
  const badOrigin=await alice.req('/quote/'+id+'/respond',{method:'POST',
    form:{token,decision:'Accepted'},origin:'https://thirdparty.invalid'});
  assert.equal(badOrigin.status,403);
  assert.equal((await alice.req('/quote/'+id+'/respond',{method:'POST',form:{token,decision:'Accepted'}})).status,200);
  assert.equal((await alice.req('/quote/'+id+'/respond',{method:'POST',form:{token,decision:'Declined'}})).status,409);
  const page=await alice.req(parsed.pathname+parsed.search);
  assert.equal(page.status,200);
  assert.doesNotMatch(await page.text(),/Accept estimate/);
  assert.throws(()=>t.db.getPublicQuote(id,token,t.config.sessionSecret,Date.now()+31*86400000),{code:'link_expired'});
}));

test('decline is terminal and no job can be created from a declined estimate',()=>setup(async({alice,A})=>{
  const id=(await A('/api/quotes','POST',quote)).data.id;
  const share=(await A('/api/quotes/'+id+'/send','POST')).data;
  const token=new URL(share.url).searchParams.get('token');
  assert.equal((await alice.req('/quote/'+id+'/respond',{method:'POST',form:{token,decision:'Declined'}})).status,200);
  assert.equal((await A('/api/quotes/'+id+'/convert','POST',schedule)).status,409);
  assert.equal((await A('/api/workspace')).data.jobs.length,0);
  assert.equal((await A('/api/workspace')).data.quotes[0].status,'Declined');
}));

test('reject invalid estimate line items and malformed amounts without persisting data',()=>setup(async({A})=>{
  for(const item of [
    {description:'Labor',qty:0,rate:100},
    {description:'Labor',qty:1,rate:-2},
    {description:'Labor',qty:1,rate:3.123},
    {description:' ',qty:1,rate:40},
    {description:'Labor',qty:'1',rate:100},
    {description:'Labor',qty:1,rate:0},
    {description:'x'.repeat(181),qty:1,rate:100},
  ]){
    const r=await A('/api/quotes','POST',{...quote,items:[item]});
    assert.equal(r.status,400,JSON.stringify(item));
    assert.ok(['invalid_items','invalid_total'].includes(r.data.error));
  }
  assert.equal((await A('/api/quotes','POST',{...quote,leadId:'outside-lead'})).status,400);
  assert.equal((await A('/api/quotes','POST',{...quote,customerEmail:'not-an-email'})).status,400);
  assert.equal((await A('/api/workspace')).data.quotes.length,0);
}));

test('quote job conversion rolls back cleanly on conflicting crew assignment',()=>setup(async({alice,A})=>{
  const crew=(await A('/api/crew','POST',{name:'HVAC Installer'})).data;
  const existing=await A('/api/jobs','POST',{title:'Reserved',customerName:'Elsewhere',workerId:crew.id,
    startAt:schedule.startAt,endAt:schedule.endAt});
  assert.equal(existing.status,201);
  const id=(await A('/api/quotes','POST',quote)).data.id;
  const url=(await A('/api/quotes/'+id+'/send','POST')).data.url;
  const token=new URL(url).searchParams.get('token');
  assert.equal((await alice.req('/quote/'+id+'/respond',
    {method:'POST',form:{token,decision:'Accepted'}})).status,200);
  const conflict=await A('/api/quotes/'+id+'/convert','POST',{...schedule,workerId:crew.id});
  assert.equal(conflict.status,409);
  let ws=(await A('/api/workspace')).data;
  assert.equal(ws.quotes[0].status,'Accepted','conversion must roll back on crew conflict');
  assert.equal(ws.quotes[0].jobId,null);
  assert.equal(ws.jobs.length,1,'no extra job should survive the failed conversion');
  const success=await A('/api/quotes/'+id+'/convert','POST',{...schedule,workerId:null});
  assert.equal(success.status,201);
  ws=(await A('/api/workspace')).data;
  assert.equal(ws.jobs.length,2);
  assert.equal(ws.quotes[0].status,'Converted');
}));

test('workspace exports and deletion include quotes; deleting linked job preserves accepted quote record',()=>setup(async({t,alice,A})=>{
  const id=(await A('/api/quotes','POST',quote)).data.id;
  const sent=(await A('/api/quotes/'+id+'/send','POST')).data;
  const token=new URL(sent.url).searchParams.get('token');
  assert.equal((await alice.req('/quote/'+id+'/respond',{method:'POST',form:{token,decision:'Accepted'}})).status,200);
  const converted=await A('/api/quotes/'+id+'/convert','POST',schedule);
  assert.equal(converted.status,201);
  assert.equal((await A('/api/me/export')).data.workspace.quotes.length,1);
  assert.equal((await A('/api/jobs/'+converted.data.job.id,'DELETE')).status,200);
  const q=(await A('/api/workspace')).data.quotes[0];
  assert.equal(q.status,'Converted');
  assert.equal(q.jobId,null);
  assert.equal((await A('/api/me/data','DELETE')).status,200);
  const ws=(await A('/api/workspace')).data;
  assert.equal(ws.quotes.length,0);
  assert.equal(ws.jobs.length,0);
}));

test('trial-expired owners can read quotes but cannot publish or convert',()=>setup(async({t,alice,A})=>{
  const id=(await A('/api/quotes','POST',quote)).data.id;
  const user=(await alice.me()).user;
  t.db.setUserPlan(user.id,{plan:'expired',planStatus:'expired'});
  assert.equal((await A('/api/workspace')).data.quotes.length,1);
  assert.equal((await A('/api/quotes','POST',quote)).status,403);
  assert.equal((await A('/api/quotes/'+id+'/send','POST')).status,403);
  assert.equal((await A('/api/quotes/'+id,'PATCH',quote)).status,403);
  assert.equal((await A('/api/quotes/'+id,'DELETE')).status,403);
}));

test('quote mutations require same-origin and a CSRF token',()=>setup(async({alice,A})=>{
  const raw=await alice.req('/api/quotes',{method:'POST',json:quote});
  assert.equal(raw.status,403);
  const token=(await alice.me()).csrfToken;
  const foreign=await alice.req('/api/quotes',{method:'POST',json:quote,
    csrf:token,origin:'https://attacker.invalid'});
  assert.equal(foreign.status,403);
  assert.equal((await A('/api/workspace')).data.quotes.length,0);
}));
