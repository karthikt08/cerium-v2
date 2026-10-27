import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openDb} from '../server/db.js';
import {startServer,signIn,ALICE,BOB} from './helpers.js';
import {renderPaymentDuesPage} from '../public/js/payment-dues-page.js';
import {WORKSPACE_FEATURES,resolveWorkspaceRoute} from '../public/js/workspace-registry.js';
import {featureRecordCount} from '../public/js/workspace-counts.js';

const sample={customerName:'Acme Textiles',description:'Second installment',amount:'1250.50',dueDate:'2026-11-15',reference:'EXT-221',notes:'Imported balance reviewed manually'};
test('Custom dues persist without changing invoice balances or recording bank settlement',()=>{
  const db=openDb(':memory:');
  try{
    const user=db.createUser({email:'due-test@example.test',name:'Owner'});
    const first=db.createPaymentDue(user.id,sample);
    assert.equal(first.amount,1250.50);
    assert.equal(first.currency,'USD');
    assert.equal(first.status,'Open');
    assert.equal(db.getWorkspace(user.id).paymentDues.length,1);
    assert.equal(db.getWorkspace(user.id).invoices.length,0);
    assert.equal(db.getWorkspace(user.id).bankTransactions.length,0);
    const changed=db.updatePaymentDue(user.id,first.id,{...sample,amount:'1350.75',dueDate:'2026-12-01'});
    assert.equal(changed.amount,1350.75);
    assert.equal(changed.dueDate,'2026-12-01');
    assert.throws(()=>db.setPaymentDueStatus(user.id,first.id,{status:'Settled'}),{code:'invalid_payment_due'});
    const settled=db.setPaymentDueStatus(user.id,first.id,{status:'Settled',confirmed:true});
    assert.equal(settled.status,'Settled');
    assert.ok(settled.settledAt);
    assert.equal(db.getWorkspace(user.id).invoices.length,0);
    const reopened=db.setPaymentDueStatus(user.id,first.id,{status:'Open',confirmed:true});
    assert.equal(reopened.status,'Open');
    assert.equal(reopened.settledAt,null);
    db.deletePaymentDue(user.id,first.id);
    assert.equal(db.getWorkspace(user.id).paymentDues.length,0);
  }finally{db.close();}
});

test('Validate amounts, calendar dates and dangerous/unsupported fields',()=>{
  const db=openDb(':memory:');
  try{
    const user=db.createUser({email:'due-errors@example.test',name:'Owner'});
    for(const bad of [{amount:-20},{amount:0},{amount:'3.999'},{amount:'Infinity'},{dueDate:'2026-02-30'},
      {dueDate:'01/11/2026'},{customerName:''},{description:''},{customerName:'A'.repeat(121)}]){
      assert.throws(()=>db.createPaymentDue(user.id,{...sample,...bad}),{code:'invalid_payment_due'});
    }
    const entry=db.createPaymentDue(user.id,{...sample,status:'Settled',currency:'INR',settledAt:'2025-01-01'});
    assert.equal(entry.status,'Open','Clients cannot forge settlement at creation');
    assert.equal(entry.currency,'USD','Business currency cannot be overridden by the browser');
    assert.equal(entry.settledAt,null);
    assert.equal(db.getWorkspace(user.id).paymentDues.length,1);
  }finally{db.close();}
});

test('Dues are tenant isolated, exported and fully removed by Clear workspace',()=>{
  const db=openDb(':memory:');
  try{
    const a=db.createUser({email:'dues-a@example.test',name:'A'});
    const b=db.createUser({email:'dues-b@example.test',name:'B'});
    const one=db.createPaymentDue(a.id,sample);
    assert.equal(db.getWorkspace(b.id).paymentDues.length,0);
    assert.throws(()=>db.updatePaymentDue(b.id,one.id,sample),{status:404});
    assert.throws(()=>db.setPaymentDueStatus(b.id,one.id,{status:'Settled',confirmed:true}),{status:404});
    assert.throws(()=>db.deletePaymentDue(b.id,one.id),{status:404});
    assert.equal(db.getWorkspace(a.id).paymentDues.length,1);
    db.clearWorkspaceData(a.id);
    assert.equal(db.getWorkspace(a.id).paymentDues.length,0);
  }finally{db.close();}
});

test('Authenticated due REST endpoints require CSRF, honor plan guards and never move money',async()=>{
  const t=await startServer();
  try{
    const a=t.browser(),b=t.browser();
    await signIn(t,a,{profile:ALICE});
    await signIn(t,b,{profile:BOB});
    const csrf=(await a.me()).csrfToken;
    const bc=(await b.me()).csrfToken;
    const unauth=t.browser();
    assert.equal((await unauth.req('/api/dues',{method:'POST',json:sample})).status,401);
    assert.notEqual((await a.req('/api/dues',{method:'POST',json:sample})).status,201,'Cannot bypass CSRF');
    const created=await a.req('/api/dues',{method:'POST',csrf,json:sample});
    assert.equal(created.status,201);
    // The workspace snapshot provides the persisted ID.
    const ws=await a.req('/api/workspace');
    const data=await ws.json();
    assert.equal(data.paymentDues.length,1);
    const id=data.paymentDues[0].id;
    assert.equal(data.invoices.length,0);
    assert.equal((await b.req('/api/dues/'+id,{method:'PATCH',csrf:bc,json:sample})).status,404);
    assert.equal((await a.req('/api/dues/'+id+'/status',{method:'PATCH',csrf,json:{status:'Settled'}})).status,400);
    assert.equal((await a.req('/api/dues/'+id+'/status',{method:'PATCH',csrf,json:{status:'Settled',confirmed:true}})).status,200);
    const exported=await a.req('/api/me/export');
    assert.equal(exported.status,200);
    const exportData=await exported.json();
    assert.equal(exportData.workspace.paymentDues.length,1);
    assert.equal(exportData.workspace.paymentDues[0].status,'Settled');
    const owner=(await a.me()).user;
    t.db.setUserPlan(owner.id,{plan:'expired',planStatus:'expired'});
    assert.equal((await a.req('/api/dues',{method:'POST',csrf,json:sample})).status,403);
    assert.equal((await a.req('/api/dues/'+id,{method:'DELETE',csrf})).status,403);
    assert.equal((await a.req('/api/workspace')).status,200);
  }finally{await t.close();}
});

test('Custom dues appear in Billing as a record-backed tab and use safe Cerium controls',()=>{
  const dues=WORKSPACE_FEATURES.find(f=>f.id==='dues');
  assert.ok(dues);
  assert.equal(dues.category,'billing');
  assert.equal(dues.section,'dues');
  assert.equal(resolveWorkspaceRoute('#billing/dues').id,'dues');
  assert.deepEqual(featureRecordCount(dues,{paymentDues:[{id:'1'},{id:'2'}]}),{count:2,label:'2 custom dues'});
  const ws={account:{currency:'USD',timeZone:'America/New_York'},paymentDues:[{id:'a',customerName:'<script>unsafe</script>',description:'Advance',amount:100,
      currency:'USD',dueDate:'2026-11-02',reference:'A',notes:'',status:'Open'}]};
  const html=renderPaymentDuesPage(ws,false);
  assert.match(html,/Add a payment due/);
  assert.match(html,/Mark settled/);
  assert.match(html,/name="dueDate"/);
  assert.match(html,/type="date"/);
  assert.match(html,/No.*invoice|invoice totals/);
  assert.doesNotMatch(html,/<script>unsafe<\/script>/);
  assert.match(html,/&lt;script&gt;unsafe/);
  assert.match(renderPaymentDuesPage(ws,true),/read-only/);
  assert.doesNotMatch(renderPaymentDuesPage(ws,true),/id="custom-due-form"/);
  const css=readFileSync(new URL('../public/css/payment-dues.css',import.meta.url),'utf8');
  assert.match(css,/@media\(max-width:620px\)/);
});
