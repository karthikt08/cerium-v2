import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildConfig} from '../server/config.js';
import {normalizeBillingPhone,maskBillingPhone,makePhoneVerifier} from '../server/billing-identity.js';
import {startServer,signIn,ALICE} from './helpers.js';

test('billing phone format is pinned to saved edition, not to a user-controlled currency',()=>{
  assert.equal(normalizeBillingPhone('+91 98765 43210','IN'),'+919876543210');
  assert.equal(normalizeBillingPhone('+1 (415) 555-0123','US'),'+14155550123');
  assert.equal(normalizeBillingPhone('+14155550123','IN'),null);
  assert.equal(normalizeBillingPhone('+919876543210','US'),null);
  assert.equal(normalizeBillingPhone('+44 7700 900123','US'),null);
  assert.equal(normalizeBillingPhone('919876543210','IN'),'+919876543210');
  assert.equal(maskBillingPhone('+919876543210').includes('87654'),false);
});

test('a phone prefix is not accepted as proof until code and country declaration are confirmed',async()=>{
  const t=await startServer({env:{
    RAZORPAY_KEY_ID:'rzp_test_abc123',
    RAZORPAY_KEY_SECRET:'fake-razorpay-secret',
    RAZORPAY_PLAN_ID:'plan_billingtest123',
    RAZORPAY_WEBHOOK_SECRET:'fake-webhook-secret-123456'
  }});
  try{
    const b=t.browser();
    await signIn(t,b,{profile:ALICE});
    const csrf=(await b.me()).csrfToken;
    const elig=await (await b.req('/api/billing/identity')).json();
    assert.equal(elig.verified,false);
    assert.equal(elig.mode,'development');
    const before=await b.req('/api/billing/subscription',{method:'POST',csrf});
    assert.equal(before.status,409);
    assert.equal((await before.json()).error,'billing_verification_required');
    const withoutDeclaration=await b.req('/api/billing/identity/start',{method:'POST',csrf,
      json:{phone:'+14155550123',confirmCountry:false,declaredCountry:'US'}});
    assert.equal(withoutDeclaration.status,400);
    const wrongEdition=await b.req('/api/billing/identity/start',{method:'POST',csrf,
      json:{phone:'+919876543210',confirmCountry:true,declaredCountry:'US'}});
    assert.equal(wrongEdition.status,400);
    const started=await b.req('/api/billing/identity/start',{method:'POST',csrf,
      json:{phone:'+1 (415) 555-0123',confirmCountry:true,declaredCountry:'US'}});
    assert.equal(started.status,200);
    assert.equal((await started.json()).pending,true);
    const resend=await b.req('/api/billing/identity/start',{method:'POST',csrf,
      json:{phone:'+14155550123',confirmCountry:true,declaredCountry:'US'}});
    assert.equal(resend.status,429);
    const bad=await b.req('/api/billing/identity/verify',{method:'POST',csrf,json:{code:'123456'}});
    assert.equal(bad.status,400);
    const checked=await b.req('/api/billing/identity/verify',{method:'POST',csrf,json:{code:'000000'}});
    assert.equal(checked.status,200);
    assert.equal((await checked.json()).verified,true);
    assert.equal(t.db.billingEligible((await t.db.getUserByEmail(ALICE.email)).id),true);
    const status=await (await b.req('/api/billing/status')).json();
    assert.equal(status.billingIdentityVerified,true);
    assert.equal(status.checkoutAvailable,true);
    const newEdition=await b.req('/api/me',{method:'PATCH',csrf,json:{country:'IN',indiaState:'29'}});
    assert.equal(newEdition.status,200);
    const after=await (await b.req('/api/billing/identity')).json();
    assert.equal(after.verified,false,'switching regions must discard old verification');
  }finally{await t.close();}
});

test('India edition uses confirmed +91 phone before its ₹500 subscription becomes eligible',async()=>{
  const t=await startServer();
  try{
    const b=t.browser();
    await signIn(t,b,{profile:ALICE});
    const csrf=(await b.me()).csrfToken;
    assert.equal((await b.req('/api/me',{method:'PATCH',csrf,json:{country:'IN',indiaState:'33'}})).status,200);
    assert.equal((await b.req('/api/billing/identity/start',{method:'POST',csrf,
      json:{phone:'+919876543210',confirmCountry:true,declaredCountry:'IN'}})).status,200);
    assert.equal((await b.req('/api/billing/identity/verify',{method:'POST',csrf,
      json:{code:'000000'}})).status,200);
    const status=await (await b.req('/api/billing/identity')).json();
    assert.equal(status.country,'IN');
    assert.equal(status.currency,'INR');
    assert.equal(status.verified,true);
    assert.equal(status.phoneMasked.includes('87654'),false);
  }finally{await t.close();}
});

test('production cannot enable local bypass and missing production SMS cannot issue codes',()=>{
  const dev=buildConfig({BASE_URL:'http://localhost:3000',PHONE_VERIFY_MODE:'development'});
  assert.equal(makePhoneVerifier(dev).ready,true);
  assert.throws(()=>buildConfig({NODE_ENV:'production',BASE_URL:'https://cerium.test',PHONE_VERIFY_MODE:'development'}),/development is forbidden in production/);
  const off=buildConfig({BASE_URL:'http://localhost:3000',PHONE_VERIFY_MODE:'off'});
  assert.equal(makePhoneVerifier(off).ready,false);
});

test('Verify API adapter keeps SMS operations server-side',async()=>{
  const seen=[];
  const adapter=makePhoneVerifier({
    isProd:true, phoneVerifyMode:'twilio',phoneVerifyConfigured:true,
    twilioAccountSid:'AC'+'a'.repeat(32),twilioAuthToken:'not-a-real-key',
    twilioVerifyServiceSid:'VA'+'b'.repeat(32)
  },async (url,opts)=>{
    seen.push({url,opts});
    return {ok:true,json:async()=>({status:url.endsWith('VerificationCheck')?'approved':'pending'})};
  });
  assert.equal(await adapter.send('+14155550123'),true);
  assert.equal(await adapter.check('+14155550123','345678'),true);
  assert.ok(seen.every(req=>req.url.startsWith('https://verify.twilio.com/v2/Services/')));
  assert.ok(seen.every(req=>req.opts.headers.Authorization.startsWith('Basic ')));
  assert.match(seen[0].opts.body,/Channel=sms/);
});
