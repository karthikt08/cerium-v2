import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startServer,signIn,ALICE,BOB} from './helpers.js';

const history=Array.from({length:8},(_,i)=>({
  role:i%2?'assistant':'user',
  content:'漢'.repeat(i%2?650:420)
}));
const conversation={
  question:'How is my business performing this month?',
  currentSection:'overview',lastSection:null,lastQuestion:null,
  history,recommendTools:false,businessDescription:'A small service business'
};
const due={
  customerName:'漢'.repeat(120),description:'作'.repeat(180),
  amount:'1250.50',dueDate:'2026-11-15',reference:'参'.repeat(100),
  notes:'備'.repeat(1200)
};

test('Copilot accepts the full browser history while retaining authentication and tenant scope',async()=>{
  assert.ok(Buffer.byteLength(JSON.stringify(conversation))>2048);
  const t=await startServer();
  try{
    const a=t.browser(),b=t.browser();
    await signIn(t,a,{profile:ALICE});
    await signIn(t,b,{profile:BOB});
    const am=await a.me(),bm=await b.me();
    t.db.createLead(am.user.id,{name:'First synthetic lead'});
    t.db.createLead(am.user.id,{name:'Second synthetic lead'});
    t.db.createLead(bm.user.id,{name:'Other tenant synthetic lead'});
    const request=csrf=>({method:'POST',csrf,json:conversation});
    for(const [browser,csrf,count] of [[a,am.csrfToken,2],[b,bm.csrfToken,1]]){
      const response=await browser.req('/api/assistant/message',request(csrf));
      assert.equal(response.status,200);
      const answer=await response.json();
      assert.equal(answer.source,'copilot');
      assert.match(answer.reply,new RegExp(count+' leads? created this month'));
    }
    assert.equal((await t.browser().req('/api/assistant/message',request())).status,401);
    assert.equal((await a.req('/api/assistant/message',request())).status,403);
    assert.equal((await a.req('/api/assistant/message',{
      ...request(am.csrfToken),origin:'https://untrusted.example'
    })).status,403);
  }finally{await t.close();}
});

test('custom dues accept valid maximum-length Unicode fields on create and edit',async()=>{
  assert.ok(Buffer.byteLength(JSON.stringify(due))>2048);
  const t=await startServer();
  try{
    const a=t.browser(),b=t.browser();
    await signIn(t,a,{profile:ALICE});
    await signIn(t,b,{profile:BOB});
    const am=await a.me(),bm=await b.me();
    const created=await a.req('/api/dues',{method:'POST',csrf:am.csrfToken,json:due});
    assert.equal(created.status,201);
    const first=await created.json();
    assert.equal(first.notes,due.notes);
    assert.equal(first.customerName,due.customerName);
    assert.equal(first.description,due.description);
    assert.equal(first.reference,due.reference);
    assert.equal((await t.browser().req('/api/dues',{method:'POST',json:due})).status,401);
    assert.equal((await a.req('/api/dues',{method:'POST',json:due})).status,403);
    const revised={...due,notes:'更'.repeat(1200)};
    const updated=await a.req('/api/dues/'+first.id,{method:'PATCH',csrf:am.csrfToken,json:revised});
    assert.equal(updated.status,200);
    assert.equal((await updated.json()).notes,revised.notes);
    const foreign=await b.req('/api/dues/'+first.id,{method:'PATCH',csrf:bm.csrfToken,json:due});
    assert.equal(foreign.status,404);
    const invalid=await a.req('/api/dues/'+first.id,{
      method:'PATCH',csrf:am.csrfToken,json:{...due,notes:'備'.repeat(1201)}
    });
    assert.equal(invalid.status,400);
    assert.equal((await invalid.json()).error,'invalid_payment_due');
    assert.equal(t.db.getWorkspace(am.user.id).paymentDues[0].notes,revised.notes);
    assert.equal(t.db.getWorkspace(bm.user.id).paymentDues.length,0);
  }finally{await t.close();}
});

test('larger route limits remain bounded and do not widen authentication request limits',async()=>{
  const t=await startServer();
  try{
    const browser=t.browser();
    await signIn(t,browser,{profile:ALICE});
    const me=await browser.me();
    for(const [route,json] of [
      ['/api/assistant/message',{...conversation,history:[{role:'user',content:'x'.repeat(32*1024)}]}],
      ['/api/dues',{...due,notes:'x'.repeat(64*1024)}],
      ['/auth/login',{email:'synthetic@example.test',password:'x'.repeat(2048)}]
    ]){
      const response=await browser.req(route,{method:'POST',csrf:me.csrfToken,json});
      assert.equal(response.status,413,route);
    }
    assert.equal(t.db.getWorkspace(me.user.id).paymentDues.length,0);
  }finally{await t.close();}
});
