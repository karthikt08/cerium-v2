import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeTrialSchedule,safeTrialSchedule,TRIAL_SECONDS,AUTH_WINDOW_SECONDS} from '../server/trial-timing.js';
import {startServer,signIn,ALICE} from './helpers.js';

const VALID_ENV={
  WORKSPACE_ACCESS_MODE:'phone_and_mandate',
  RAZORPAY_KEY_ID:'rzp_test_cerium_trial',
  RAZORPAY_KEY_SECRET:'safe-fake-secret-test-only',
  RAZORPAY_WEBHOOK_SECRET:'safe-fake-webhook-secret-test-only',
  RAZORPAY_PLAN_ID:'plan_us15day',
};

async function verifyPhone(t,b){
  const csrf=(await b.me()).csrfToken;
  const req=await b.req('/api/billing/identity/start',{method:'POST',csrf,
    json:{phone:'+14155550123',confirmCountry:true,declaredCountry:'US'}});
  assert.equal(req.status,200,await req.text());
  const code=await b.req('/api/billing/identity/verify',{method:'POST',csrf,json:{code:'000000'}});
  assert.equal(code.status,200,await code.text());
  return csrf;
}

test('Razorpay first charge is 15 days after authorization window, not at checkout creation plus 15 days',()=>{
  const at=Date.UTC(2026,9,25,22,59,59,500);
  const schedule=makeTrialSchedule(at);
  assert.equal(schedule.expireBy-Math.ceil(at/1000),AUTH_WINDOW_SECONDS);
  assert.equal(schedule.startAt-schedule.expireBy,TRIAL_SECONDS);
  assert.ok(safeTrialSchedule({start_at:schedule.startAt,charge_at:schedule.startAt},schedule.startAt,at));
  assert.ok(safeTrialSchedule({start_at:schedule.startAt,charge_at:schedule.startAt},
    schedule.startAt,schedule.expireBy*1000));
  assert.equal(safeTrialSchedule({start_at:schedule.startAt},schedule.startAt,
    schedule.expireBy*1000+1),false);
  assert.equal(safeTrialSchedule({start_at:schedule.startAt-10},schedule.startAt,at),false);
  assert.equal(safeTrialSchedule({start_at:schedule.startAt,charge_at:schedule.startAt-1},schedule.startAt,at),false);
  assert.equal(safeTrialSchedule({status:'authenticated'},schedule.startAt,at),false);
});

test('creation sends bounded expire_by and an exactly matching scheduled provider start_at',async()=>{
  let createdArgs;
  const razorpay={
    getPlan:async()=>({period:'monthly',interval:1,item:{amount:2000,currency:'USD'}}),
    createSubscription:async args=>{
      createdArgs=args;
      return {id:'sub_earlyschedule',status:'created',start_at:args.startAt,expire_by:args.expireBy};
    }
  };
  const t=await startServer({env:VALID_ENV,razorpay});
  try{
    const b=t.browser();
    await signIn(t,b,{profile:ALICE});
    const csrf=await verifyPhone(t,b);
    const started=Date.now();
    const res=await b.req('/api/billing/subscription',{method:'POST',csrf});
    assert.equal(res.status,200,await res.text());
    const data=await res.json();
    assert.equal(data.startAt-createdArgs.expireBy,TRIAL_SECONDS);
    assert.equal(data.expireBy,createdArgs.expireBy);
    assert.ok(createdArgs.expireBy>=Math.ceil(started/1000)+AUTH_WINDOW_SECONDS);
    assert.equal(t.db.getUserByEmail(ALICE.email).onboarding_completed_at,0);
    assert.equal((await b.req('/api/workspace')).status,403);
  }finally{await t.close();}
});

test('provider callback confirms exact UTC trial deadline; late confirmation is cancelled',async()=>{
  let providerStart=makeTrialSchedule().startAt;
  let providerStatus='authenticated';
  const cancelled=[];
  const razorpay={
    verifySubscription:()=>true,
    getSubscription:async()=>({status:providerStatus,start_at:providerStart,charge_at:providerStart}),
    cancelSubscription:async id=>{cancelled.push(id);return {status:'cancelled'};}
  };
  const t=await startServer({env:VALID_ENV,razorpay});
  try{
    const b=t.browser();
    await signIn(t,b,{profile:ALICE});
    const csrf=await verifyPhone(t,b);
    const id=t.db.getUserByEmail(ALICE.email).id;
    t.db.createSubscription(id,'sub_callback',providerStart);
    const payload={razorpay_subscription_id:'sub_callback',razorpay_payment_id:'pay_fake',razorpay_signature:'sig_fake'};
    const verify=()=>b.req('/api/billing/subscription/verify',{method:'POST',csrf,json:payload});
    const approved=await verify();
    assert.equal(approved.status,200,await approved.text());
    assert.equal((await approved.json()).verified,true);
    const user=t.db.getUserById(id);
    assert.equal(user.trial_ends_at,providerStart*1000);
    assert.ok(user.trial_ends_at-user.onboarding_completed_at>=TRIAL_SECONDS*1000);
    const workspace=(await (await b.req('/api/workspace')).json()).account;
    assert.equal(workspace.trialEndsAt,new Date(providerStart*1000).toISOString());
    assert.equal(workspace.planStatus,'trial');
    assert.equal(cancelled.length,0);
  }finally{await t.close();}

  // A previously scheduled subscription authorized outside its safe window
  // cannot silently shorten the free trial.
  providerStart=Math.floor(Date.now()/1000)+TRIAL_SECONDS-120;
  const t2=await startServer({env:VALID_ENV,razorpay});
  try{
    const b=t2.browser();
    await signIn(t2,b,{profile:ALICE});
    const csrf=await verifyPhone(t2,b);
    const id=t2.db.getUserByEmail(ALICE.email).id;
    t2.db.createSubscription(id,'sub_late',providerStart);
    const denied=await b.req('/api/billing/subscription/verify',{method:'POST',csrf,
      json:{razorpay_subscription_id:'sub_late',razorpay_payment_id:'pay_fake',razorpay_signature:'sig_fake'}});
    assert.equal(denied.status,409,await denied.text());
    assert.equal((await denied.json()).error,'trial_schedule_unsafe');
    assert.deepEqual(cancelled,['sub_late']);
    assert.equal(t2.db.getUserById(id).onboarding_completed_at,0);
    assert.equal(t2.db.getUserSubscription(id).status,'cancelled');
    assert.equal((await b.req('/api/workspace')).status,403);
  }finally{await t2.close();}
});

test('signed webhook honors safe trial and cancels early-billing first authorizations',async()=>{
  let scheduledAt=makeTrialSchedule().startAt;
  const cancelled=[];
  const razorpay={
    verifyWebhook:()=>true,
    cancelSubscription:async id=>{cancelled.push(id);return {status:'cancelled'};}
  };
  const t=await startServer({env:VALID_ENV,razorpay});
  try{
    const b=t.browser();
    await signIn(t,b,{profile:ALICE});
    await verifyPhone(t,b);
    const id=t.db.getUserByEmail(ALICE.email).id;
    t.db.createSubscription(id,'sub_webhook',scheduledAt);
    const webhook=(status,at=scheduledAt)=>b.req('/webhooks/razorpay',{
      method:'POST',headers:{'content-type':'application/json','x-razorpay-signature':'test'},
      body:JSON.stringify({event:'subscription.authenticated',payload:{subscription:{entity:{
        id:'sub_webhook',status,start_at:at,charge_at:at
      }}}})
    });
    const safe=await webhook('authenticated');
    assert.equal(safe.status,200,await safe.text());
    assert.equal(t.db.getUserById(id).trial_ends_at,scheduledAt*1000);
    assert.equal((await b.req('/api/workspace')).status,200);
    assert.equal(cancelled.length,0);
  }finally{await t.close();}

  scheduledAt=Math.floor(Date.now()/1000)+TRIAL_SECONDS-10;
  const t2=await startServer({env:VALID_ENV,razorpay});
  try{
    const b=t2.browser();
    await signIn(t2,b,{profile:ALICE});
    await verifyPhone(t2,b);
    const id=t2.db.getUserByEmail(ALICE.email).id;
    t2.db.createSubscription(id,'sub_badwebhook',scheduledAt);
    const bad=await b.req('/webhooks/razorpay',{
      method:'POST',headers:{'content-type':'application/json','x-razorpay-signature':'test'},
      body:JSON.stringify({event:'subscription.authenticated',payload:{subscription:{entity:{
        id:'sub_badwebhook',status:'authenticated',start_at:scheduledAt,charge_at:scheduledAt
      }}}})
    });
    assert.equal(bad.status,200,await bad.text());
    assert.equal((await bad.json()).status,'cancelled_for_trial_safety');
    assert.deepEqual(cancelled,['sub_badwebhook']);
    assert.equal(t2.db.getUserById(id).onboarding_completed_at,0);
    assert.equal((await b.req('/api/workspace')).status,403);
  }finally{await t2.close();}
});
