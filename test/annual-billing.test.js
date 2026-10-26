import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startServer,signIn,ALICE} from './helpers.js';
import {completeBusiness} from './business-fixtures.js';
import {billingPlan} from '../public/js/countries.js';
import {checkoutPlan,checkoutAvailable,subscriptionPrice} from '../server/country-pricing.js';

const env={
  WORKSPACE_ACCESS_MODE:'phone_and_mandate',
  RAZORPAY_KEY_ID:'rzp_test_annual',RAZORPAY_KEY_SECRET:'annual-test-secret',
  RAZORPAY_WEBHOOK_SECRET:'annual-test-webhook-secret',
  RAZORPAY_PLAN_ID:'plan_monthus',
  RAZORPAY_ANNUAL_PLAN_ID:'plan_yearus',
  RAZORPAY_ANNUAL_UPPER_MIDDLE_PLAN_ID:'plan_yearupper',
  RAZORPAY_ANNUAL_LOWER_MIDDLE_PLAN_ID:'plan_yearlower',
  RAZORPAY_ANNUAL_LOW_PLAN_ID:'plan_yearlow',
  RAZORPAY_ANNUAL_IN_PLAN_ID:'plan_yearindia'
};

test('annual tier prices are exactly eleven monthly fees and missing tiers never use another plan',()=>{
  const config={
    ...Object.fromEntries([
      ['razorpayPlanId','plan_monthus'],['razorpayAnnualPlanId','plan_yearus'],
      ['razorpayAnnualUpperMiddlePlanId','plan_yearupper'],['razorpayAnnualLowerMiddlePlanId','plan_yearlower'],
      ['razorpayAnnualLowPlanId','plan_yearlow'],['razorpayAnnualIndiaPlanId','plan_yearindia']
    ]),razorpayConfigured:true,webhookConfigured:true
  };
  for(const [country,price,planId] of [['US',220,'plan_yearus'],['BR',176,'plan_yearupper'],
    ['NG',132,'plan_yearlower'],['UG',88,'plan_yearlow'],['IN',5500,'plan_yearindia']]){
    const m=billingPlan(country),annual=checkoutPlan(config,country,'annual');
    assert.equal(annual.minorUnits,m.minorUnits*11,country);
    assert.equal(annual.annualPrice,price,country);
    assert.equal(annual.planId,planId,country);
    assert.equal(annual.configured,true,country);
  }
  const partial={...config,razorpayAnnualUpperMiddlePlanId:''};
  assert.equal(checkoutPlan(partial,'BR','annual').configured,false);
  assert.equal(checkoutAvailable(partial,'BR',null,'annual'),false);
  assert.equal(checkoutPlan(partial,'BR','annual').planId,'');
  assert.equal(checkoutPlan(partial,'XX','annual'),null);
  assert.equal(checkoutPlan(partial,'US','every-minute'),null);
});

test('yearly checkout confirms amount, period and 15-day trial before opening access',async()=>{
  let scheduled,authorized=false,providerChecks=0;
  const t=await startServer({env,razorpay:{
    getPlan:async id=>{providerChecks++;assert.equal(id,'plan_yearus');
      return {period:'yearly',interval:1,item:{amount:22000,currency:'USD'}};},
    createSubscription:async params=>{scheduled=params;
      return {id:'sub_annual_us',status:'created',start_at:params.startAt,expire_by:params.expireBy};},
    getSubscription:async()=>({id:'sub_annual_us',status:authorized?'authenticated':'pending',start_at:scheduled.startAt,charge_at:scheduled.startAt}),
    verifySubscription:()=>true
  }});
  try{
    const b=t.browser();await signIn(t,b,{profile:ALICE});
    const user=t.db.getUserByEmail(ALICE.email),csrf=(await b.me()).csrfToken;
    t.db.beginBillingPhone(user.id,'+14155550123','US');
    assert.equal(t.db.completeBillingPhone(user.id,'+14155550123','US'),true);
    await completeBusiness(t,b,'US');
    const before=await (await b.req('/api/billing/status')).json();
    assert.equal(before.annualCheckoutAvailable,true);
    assert.equal(before.annualPrice,220);
    const response=await b.req('/api/billing/subscription',{method:'POST',csrf,
      json:{billingCycle:'annual',amount:1,currency:'INR',planId:'plan_tampered'}});
    assert.equal(response.status,200,await response.clone().text());
    const confirmation=await response.json();
    assert.equal(confirmation.billingCycle,'annual');
    assert.equal(confirmation.amount,22000);assert.equal(confirmation.currency,'USD');
    assert.equal(confirmation.trialEligible,true);
    assert.equal(scheduled.planId,'plan_yearus');
    assert.equal(scheduled.totalCount,10);
    assert.equal(scheduled.notes.billingCycle,'annual');
    assert.ok(scheduled.startAt*1000>=Date.now()+15*86400000);
    assert.equal(providerChecks,1);
    assert.equal(t.db.getSubscription('sub_annual_us').billing_cycle,'annual');
    assert.equal((await b.req('/api/workspace')).status,403);
    const verifyData={razorpay_subscription_id:'sub_annual_us',razorpay_payment_id:'pay_annual',razorpay_signature:'signed-test'};
    assert.equal((await b.req('/api/billing/subscription/verify',{method:'POST',csrf,json:verifyData})).status,409);
    authorized=true;
    assert.equal((await b.req('/api/billing/subscription/verify',{method:'POST',csrf,json:verifyData})).status,200);
    const ws=await (await b.req('/api/workspace')).json();
    assert.equal(ws.account.subscription.billingCycle,'annual');
    assert.equal(ws.account.billingPrice.annualPrice,220);
    assert.equal(ws.account.billingPrice.monthlyPrice,220/12);
    assert.equal(subscriptionPrice('US',t.db.getUserSubscription(user.id)).minorUnits,22000);
  }finally{await t.close();}
});

test('annual billing fails closed with an unconfigured or mismatched Razorpay plan',async()=>{
  for(const mode of ['unconfigured','wrong_period','wrong_amount','wrong_currency']){
    let created=0;
    const e={...env};
    if(mode==='unconfigured')delete e.RAZORPAY_ANNUAL_PLAN_ID;
    const t=await startServer({env:e,razorpay:{
      getPlan:async()=>({period:mode==='wrong_period'?'monthly':'yearly',interval:1,
        item:{amount:mode==='wrong_amount'?2000:22000,currency:mode==='wrong_currency'?'INR':'USD'}}),
      createSubscription:async()=>{created++;return {id:'sub_unexpected'};}
    }});
    try{
      const b=t.browser();await signIn(t,b,{profile:ALICE});const u=t.db.getUserByEmail(ALICE.email);
      t.db.beginBillingPhone(u.id,'+14155550123','US');t.db.completeBillingPhone(u.id,'+14155550123','US');
      await completeBusiness(t,b,'US');
      const csrf=(await b.me()).csrfToken;
      const res=await b.req('/api/billing/subscription',{method:'POST',csrf,json:{billingCycle:'annual'}});
      assert.equal(res.status,503,mode);assert.equal((await res.json()).error,mode==='unconfigured'?'billing_not_configured':'billing_plan_mismatch');
      assert.equal(created,0);
    }finally{await t.close();}
  }
});

test('a pending monthly mandate cannot be switched to annual without cancellation',async()=>{
  let created=0;
  const t=await startServer({env,razorpay:{
    getPlan:async()=>({period:'monthly',interval:1,item:{amount:2000,currency:'USD'}}),
    createSubscription:async params=>{created++;return {id:'sub_monthly_existing',status:'created',start_at:params.startAt,expire_by:params.expireBy};}
  }});
  try{
    const b=t.browser();await signIn(t,b,{profile:ALICE});const u=t.db.getUserByEmail(ALICE.email);
    t.db.beginBillingPhone(u.id,'+14155550123','US');t.db.completeBillingPhone(u.id,'+14155550123','US');
    await completeBusiness(t,b,'US');
    const csrf=(await b.me()).csrfToken;
    const first=await b.req('/api/billing/subscription',{method:'POST',csrf,json:{billingCycle:'monthly'}});
    assert.equal(first.status,200);
    const next=await b.req('/api/billing/subscription',{method:'POST',csrf,json:{billingCycle:'annual'}});
    assert.equal(next.status,409);
    assert.equal((await next.json()).error,'billing_cycle_change_requires_cancellation');
    assert.equal(created,1);
    assert.equal(t.db.getSubscription('sub_monthly_existing').billing_cycle,'monthly');
  }finally{await t.close();}
});

test('invalid billing cycles cannot create payment mandates',async()=>{
  const t=await startServer({env});
  try{
    const b=t.browser();await signIn(t,b,{profile:ALICE});const csrf=(await b.me()).csrfToken;
    for(const value of ['yearly','weekly',null,{},'']){
      const res=await b.req('/api/billing/subscription',{method:'POST',csrf,json:{billingCycle:value}});
      assert.equal(res.status,400);
      assert.equal((await res.json()).error,'invalid_billing_cycle');
    }
  }finally{await t.close();}
});
