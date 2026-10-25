import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startServer,signIn,ALICE} from './helpers.js';
import {hashPassword} from '../server/passwords.js';
import {createHmac} from 'node:crypto';

test('verified Google ownership revokes unverified signup credentials and sessions',async()=>{
  const t=await startServer();
  try{
    const outsider=t.browser();
    const signed=await outsider.req('/auth/register',{method:'POST',json:{email:ALICE.email,name:'Unverified signup',password:'NotTheOwner123'}});
    assert.equal(signed.status,201);assert.equal((await outsider.me()).signedIn,true);
    const owner=t.browser();assert.equal((await signIn(t,owner,{profile:ALICE})).cb.status,303);
    assert.equal((await owner.me()).signedIn,true);assert.equal((await outsider.me()).signedIn,false);
    const user=t.db.getUserByEmail(ALICE.email);
    assert.equal(user.google_sub,ALICE.sub);assert.equal(user.email_verified,1);assert.equal(user.password_hash,null);
    assert.equal((await outsider.req('/auth/login',{method:'POST',json:{email:ALICE.email,password:'NotTheOwner123'}})).status,401);
  }finally{await t.close();}
});

test('unverified email signup cannot claim administrator access',async()=>{
  const t=await startServer({env:{ADMIN_EMAILS:'admin@example.com'}});
  try{
    const b=t.browser();
    await b.req('/auth/register',{method:'POST',json:{email:'admin@example.com',name:'Unverified',password:'Password123'}});
    assert.equal((await b.req('/admin/waitlist.csv')).status,404);
  }finally{await t.close();}
});

test('a different Google subject cannot take over an already linked email',async()=>{
  const t=await startServer();
  try{
    const a=t.browser();await signIn(t,a,{profile:ALICE});
    const b=t.browser();const r=await signIn(t,b,{profile:{...ALICE,sub:'different-google-subject'}});
    assert.match(r.cb.headers.get('location'),/error=invalid/);
    assert.equal((await b.me()).signedIn,false);assert.equal((await a.me()).signedIn,true);
  }finally{await t.close();}
});

test('password reset delivers through the injected sender and revokes old sessions',async()=>{
  const deliveries=[];
  const t=await startServer({accountEmailSender:async email=>{deliveries.push(email);}});
  try{
    const b=t.browser();
    await b.req('/auth/register',{method:'POST',json:{email:'reset@example.com',name:'Reset user',password:'Original123'}});
    const reset=await b.req('/auth/forgot-password',{method:'POST',json:{email:'reset@example.com'}});
    assert.equal(reset.status,200);assert.equal(deliveries.length,1);assert.equal(deliveries[0].to,'reset@example.com');
    const link=deliveries[0].body.match(/http[^\s]+/)[0];const token=new URL(link).searchParams.get('token');
    assert.equal((await b.req('/auth/reset-password',{method:'POST',json:{token,newPassword:'Replacement123'}})).status,200);
    assert.equal((await b.me()).signedIn,false);
    assert.equal((await b.req('/auth/reset-password',{method:'POST',json:{token,newPassword:'Replacement123'}})).status,400);
  }finally{await t.close();}
});

test('reset delivery failures are reported instead of claiming an email was sent',async()=>{
  const t=await startServer({accountEmailSender:async()=>{throw new Error('Offline');}});
  try{
    t.db.createUser({email:'reset@example.com',name:'Reset user',passwordHash:hashPassword('Original123')});
    const r=await t.browser().req('/auth/forgot-password',{method:'POST',json:{email:'reset@example.com'}});
    assert.equal(r.status,502);assert.equal((await r.json()).error,'email_delivery_failed');
  }finally{await t.close();}
});

test('account deletion cancels every nonterminal mandate, including halted ones',async()=>{
  const cancelled=[];
  const t=await startServer({razorpay:{cancelSubscription:async id=>{cancelled.push(id);return {status:'cancelled'};}}});
  try{
    const b=t.browser();await signIn(t,b,{profile:ALICE});const me=await b.me();
    const start=Math.floor(Date.now()/1000)+86400;
    t.db.createSubscription(me.user.id,'sub_older',start);
    t.db.createSubscription(me.user.id,'sub_halted',start);t.db.updateSubscription('sub_halted','halted');
    const r=await b.req('/api/me',{method:'DELETE',csrf:me.csrfToken});
    assert.equal(r.status,200);assert.deepEqual(cancelled.sort(),['sub_halted','sub_older']);
    assert.equal(t.db.getUserById(me.user.id),null);
  }finally{await t.close();}
});

test('cancelled or superseded checkout verification cannot authorize an account',async()=>{
  let lookups=0;
  const t=await startServer({razorpay:{verifySubscription:()=>true,getSubscription:async()=>{lookups++;return {status:'active'};}}});
  try{
    const b=t.browser();await signIn(t,b,{profile:ALICE});const me=await b.me();
    const start=Math.floor(Date.now()/1000)+20*86400;
    t.db.createSubscription(me.user.id,'sub_cancelled',start);t.db.updateSubscription('sub_cancelled','cancelled');
    t.db.createSubscription(me.user.id,'sub_superseded',start);
    t.db.createSubscription(me.user.id,'sub_current',start);
    for(const id of ['sub_cancelled','sub_superseded']){
      const r=await b.req('/api/billing/subscription/verify',{method:'POST',csrf:me.csrfToken,
        json:{razorpay_subscription_id:id,razorpay_payment_id:'pay_old',razorpay_signature:'old'}});
      assert.equal(r.status,409);assert.equal((await r.json()).error,'subscription_not_current');
    }
    assert.equal(lookups,0);
  }finally{await t.close();}
});

test('overlapping checkout requests create one subscription and release the lock afterwards',async()=>{
  let ready,release;const entered=new Promise(r=>{ready=r;}),gate=new Promise(r=>{release=r;});let creations=0;
  const t=await startServer({env:{RAZORPAY_KEY_ID:'rzp_test_lock',RAZORPAY_KEY_SECRET:'lock-fake-secret',
    RAZORPAY_WEBHOOK_SECRET:'lock-fake-webhook-secret',RAZORPAY_PLAN_ID:'plan_lock'},razorpay:{
    getPlan:async()=>{ready();await gate;return {period:'monthly',interval:1,item:{amount:2000,currency:'USD'}};},
    createSubscription:async()=>{creations++;return {id:'sub_single',status:'created'};},
  }});
  let first;
  try{
    const b=t.browser();await signIn(t,b,{profile:ALICE});const me=await b.me();
    t.db.beginBillingPhone(me.user.id,'+14155550123','US');t.db.completeBillingPhone(me.user.id,'+14155550123','US');
    first=b.req('/api/billing/subscription',{method:'POST',csrf:me.csrfToken,json:{}});
    await entered;
    const duplicate=await b.req('/api/billing/subscription',{method:'POST',csrf:me.csrfToken,json:{}});
    assert.equal(duplicate.status,409);assert.equal((await duplicate.json()).error,'billing_in_progress');
    release();assert.equal((await first).status,200);
    assert.equal((await b.req('/api/billing/subscription',{method:'POST',csrf:me.csrfToken,json:{}})).status,200);
    assert.equal(creations,1);
  }finally{release();if(first)await first;await t.close();}
});

test('real configured webhook verification accepts valid HMAC and rejects altered payloads',async()=>{
  const secret='adapter-webhook-test-secret';
  const t=await startServer({env:{RAZORPAY_WEBHOOK_SECRET:secret}});
  try{
    const b=t.browser();const body=JSON.stringify({event:'unknown.event'});
    const signature=createHmac('sha256',secret).update(body).digest('hex');
    const headers={'content-type':'application/json','x-razorpay-signature':signature};
    assert.equal((await b.req('/webhooks/razorpay',{method:'POST',headers,body})).status,200);
    assert.equal((await b.req('/webhooks/razorpay',{method:'POST',headers,body:body+' '})).status,400);
  }finally{await t.close();}
});
