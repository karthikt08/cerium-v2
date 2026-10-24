import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startServer,signIn,ALICE,BOB} from './helpers.js';

async function signAndPhone(t,b,phone,country) {
  const csrf=(await b.me()).csrfToken;
  const start=await b.req('/api/billing/identity/start',{method:'POST',csrf,json:{
    phone,confirmCountry:true,declaredCountry:country
  }});
  assert.equal(start.status,200,await start.text());
  const checked=await b.req('/api/billing/identity/verify',{method:'POST',csrf,json:{code:'000000'}});
  assert.equal(checked.status,200,await checked.text());
}
test('new Indian phone selects India/INR only after successful OTP; workspace and APIs are blocked before it',async()=>{
  const t=await startServer({env:{WORKSPACE_ACCESS_MODE:'phone'}});
  try {
    const b=t.browser();
    assert.equal((await b.req('/verify.html')).status,200);
    await signIn(t,b,{profile:ALICE});
    const raw=await b.req('/app.html');
    assert.equal(raw.status,303);assert.equal(raw.headers.get('location'),'/verify.html');
    const denied=await b.req('/api/workspace');
    assert.equal(denied.status,403);
    assert.equal((await denied.json()).error,'onboarding_required');
    assert.equal((await b.req('/api/leads')).status,403);
    assert.equal((await b.req('/api/me')).status,200);
    const before=t.db.getUserByEmail(ALICE.email);
    assert.equal(before.currency,'USD');
    await signAndPhone(t,b,'+91 98765 43210','IN');
    const ws=(await (await b.req('/api/workspace')).json()).account;
    assert.equal(ws.country,'IN');
    assert.equal(ws.currency,'INR');
    assert.equal(ws.timeZone,'Asia/Kolkata');
    assert.equal(ws.regionLocked,true);
    assert.equal((await b.req('/app.html')).status,200);
    const csrf=(await b.me()).csrfToken;
    const switchEdition=await b.req('/api/me',{method:'PATCH',csrf,json:{country:'US'}});
    assert.equal(switchEdition.status,403);
    assert.equal((await switchEdition.json()).error,'region_locked');
  }finally{await t.close();}
});

test('US +1 verification unlocks only US/USD; unconfirmed phone does not allow access',async()=>{
  const t=await startServer({env:{WORKSPACE_ACCESS_MODE:'phone'}});
  try{
    const b=t.browser();
    await signIn(t,b,{profile:ALICE});
    const csrf=(await b.me()).csrfToken;
    const started=await b.req('/api/billing/identity/start',{method:'POST',csrf,json:{
      phone:'+14155550123',confirmCountry:true,declaredCountry:'US'
    }});
    assert.equal(started.status,200);
    assert.equal((await b.req('/api/workspace')).status,403);
    const wrong=await b.req('/api/billing/identity/verify',{method:'POST',csrf,json:{code:'123456'}});
    assert.equal(wrong.status,400);
    assert.equal((await b.req('/api/workspace')).status,403);
    const ok=await b.req('/api/billing/identity/verify',{method:'POST',csrf,json:{code:'000000'}});
    assert.equal(ok.status,200);
    const account=(await (await b.req('/api/workspace')).json()).account;
    assert.equal(account.country,'US');
    assert.equal(account.currency,'USD');
  }finally{await t.close();}
});

test('phone and Razorpay mandate requirement keeps workspace locked until provider confirms auth',async()=>{
  const t=await startServer({env:{WORKSPACE_ACCESS_MODE:'phone_and_mandate'}});
  try {
    const b=t.browser();
    await signIn(t,b,{profile:ALICE});
    await signAndPhone(t,b,'+14155550123','US');
    assert.equal((await b.req('/app.html')).status,303);
    assert.equal((await b.req('/api/workspace')).status,403);
    const id=t.db.getUserByEmail(ALICE.email).id;
    t.db.createSubscription(id,'sub_test123',Math.floor(Date.now()/1000)+15*86400);
    assert.equal((await b.req('/api/workspace')).status,403);
    t.db.updateSubscription('sub_test123','authenticated');
    assert.equal((await b.req('/app.html')).status,200);
    assert.equal((await b.req('/api/workspace')).status,200);
    t.db.updateSubscription('sub_test123','cancelled');
    assert.equal((await b.req('/api/workspace')).status,200,'cancelling a future mandate does not end earned trial access');
  }finally{await t.close();}
});

test('travelling owner can join provisionally and gets India edition only after +91 OTP, not IP',async()=>{
  const t=await startServer({
    env:{WORKSPACE_ACCESS_MODE:'phone',REGION_ACCESS_MODE:'enforce',GEOIP_API_KEY:'regtoken-1234567890abcdef'},
    regionLookup:async()=>({location:{country_code:'FR'},is_vpn:false,is_proxy:false,is_tor:false})
  });
  try{
    const b=t.browser();
    const login=await signIn(t,b,{profile:ALICE});
    assert.equal(login.cb.status,303);
    assert.equal((await b.req('/api/workspace')).status,403);
    await signAndPhone(t,b,'+919876543210','IN');
    const account=(await (await b.req('/api/workspace')).json()).account;
    assert.equal(account.country,'IN');
    assert.equal(account.currency,'INR');
    assert.equal((await b.req('/app.html')).status,200);
  }finally{await t.close();}
});

test('a second Google account cannot unlock another trial using the same verified phone',async()=>{
  const t=await startServer({env:{WORKSPACE_ACCESS_MODE:'phone'}});
  try{
    const first=t.browser();await signIn(t,first,{profile:ALICE});
    await signAndPhone(t,first,'+14155550123','US');
    assert.equal((await first.req('/api/workspace')).status,200);
    const second=t.browser();await signIn(t,second,{profile:BOB});
    const csrf=(await second.me()).csrfToken;
    const begun=await second.req('/api/billing/identity/start',{method:'POST',csrf,json:{
      phone:'+14155550123',confirmCountry:true,declaredCountry:'US'
    }});
    assert.equal(begun.status,200);
    const verify=await second.req('/api/billing/identity/verify',{method:'POST',csrf,json:{code:'000000'}});
    assert.equal(verify.status,409);
    assert.equal((await second.req('/api/workspace')).status,403);
  }finally{await t.close();}
});

test('Razorpay pending checkout never reports authorization or starts the trial',async()=>{
  let providerStatus='pending';
  const fakeRazorpay={
    verifySubscription:({subscriptionId,paymentId,signature})=>
      subscriptionId==='sub_pending123'&&paymentId==='pay_test'&&signature==='signed-test',
    getSubscription:async id=>{
      assert.equal(id,'sub_pending123');
      return {status:providerStatus};
    }
  };
  const t=await startServer({
    env:{WORKSPACE_ACCESS_MODE:'phone_and_mandate'},
    razorpay:fakeRazorpay
  });
  try{
    const b=t.browser();
    await signIn(t,b,{profile:ALICE});
    await signAndPhone(t,b,'+14155550123','US');
    const id=t.db.getUserByEmail(ALICE.email).id;
    t.db.createSubscription(id,'sub_pending123',Math.floor(Date.now()/1000)+15*86400);
    const csrf=(await b.me()).csrfToken;
    const verify=()=>b.req('/api/billing/subscription/verify',{method:'POST',csrf,json:{
      razorpay_subscription_id:'sub_pending123',
      razorpay_payment_id:'pay_test',
      razorpay_signature:'signed-test'
    }});
    const pending=await verify();
    assert.equal(pending.status,409);
    assert.deepEqual((({verified,status})=>({verified,status}))(await pending.json()),
      {verified:false,status:'pending'});
    assert.equal(t.db.getUserSubscription(id).status,'pending');
    assert.equal(t.db.getUserById(id).onboarding_completed_at,0);
    assert.equal((await b.req('/api/workspace')).status,403);
    const state=(await (await b.req('/api/billing/identity')).json());
    assert.equal(state.paymentAuthorized,false);
    assert.equal(state.workspaceUnlocked,false);
    providerStatus='authenticated';
    const approved=await verify();
    assert.equal(approved.status,200);
    assert.deepEqual(await approved.json(),{verified:true,status:'authenticated'});
    assert.ok(t.db.getUserById(id).onboarding_completed_at>0);
    assert.equal((await b.req('/api/workspace')).status,200);
  }finally{await t.close();}
});
