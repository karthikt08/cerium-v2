import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeBillingPhone} from '../server/billing-identity.js';
import {decideRegion} from '../server/region-access.js';
import {startServer,signIn,ALICE} from './helpers.js';
import {getCountries,getCountryCallingCode,getExampleNumber} from 'libphonenumber-js/max';
import examples from 'libphonenumber-js/examples.mobile.json';
import {COUNTRY_OPTIONS,COUNTRY_CALLING_CODES,billingPlan,validCountry} from '../public/js/countries.js';
import {businessLocalDate,businessLocalToInstant,businessTimeZoneOptions} from '../public/js/us-market.js';
import {buildConfig} from '../server/config.js';

test('every country in phone metadata has matching browser choices, national parsing and fixed pricing',()=>{
  assert.deepEqual(COUNTRY_OPTIONS.map(c=>c.value).sort(),getCountries().sort());
  for(const country of getCountries()){
    assert.equal(COUNTRY_CALLING_CODES[country],getCountryCallingCode(country));
    const example=getExampleNumber(country,examples);
    for(const input of [example.number,example.formatNational()])
      assert.equal(normalizeBillingPhone(input,country),example.number,country+': '+input);
    const plan=billingPlan(country);
    assert.equal(plan.currency,country==='IN'?'INR':'USD',country);
    assert.equal(plan.minorUnits,country==='IN'?50000:2000,country);
  }
});

test('US national numbers are accepted without requiring the +1 prefix',()=>{
  for(const raw of ['4155550123','(415) 555-0123','1 415 555 0123','+1 415 555 0123'])
    assert.equal(normalizeBillingPhone(raw,'US'),'+14155550123',raw);
});

test('all international regions use USD 20 except India INR 500',()=>{
  for(const country of ['IN','US','CA','GB','FR','DE','AU','JP','BR','ZA','NG','NP']){
    const price=decideRegion({location:{country_code:country},is_vpn:false,is_proxy:false,is_tor:false});
    assert.equal(price.ok,true,country);
    assert.equal(price.country,country);
    assert.equal(price.currency,country==='IN'?'INR':'USD');
    assert.equal(price.monthlyPrice,country==='IN'?500:20);
  }
});

test('international national-format phone verification unlocks a usable USD workspace',async()=>{
  const t=await startServer({env:{WORKSPACE_ACCESS_MODE:'phone'}});
  try{
    const b=t.browser();await signIn(t,b,{profile:ALICE});
    const csrf=(await b.me()).csrfToken;
    const start=await b.req('/api/billing/identity/start',{method:'POST',csrf,json:{
      phone:'06 12 34 56 78',declaredCountry:'FR',confirmCountry:true,currency:'INR'
    }});
    assert.equal(start.status,200,await start.clone().text());
    const pending=await (await b.req('/api/billing/identity')).json();
    assert.equal(pending.pendingCountry,'FR');assert.equal(pending.country,'US');
    assert.equal((await b.req('/api/workspace')).status,403);
    const checked=await b.req('/api/billing/identity/verify',{method:'POST',csrf,json:{code:'000000'}});
    assert.equal(checked.status,200,await checked.clone().text());
    assert.equal((await (await b.req('/api/billing/identity')).json()).pendingCountry,null);
    const account=(await (await b.req('/api/workspace')).json()).account;
    assert.equal(account.country,'FR');assert.equal(account.currency,'USD');assert.equal(account.monthlyPrice,20);
    const invoice=await b.req('/api/invoices',{method:'POST',csrf,json:{customerName:'Client',jobTitle:'Service',amount:100}});
    assert.equal(invoice.status,201,await invoice.clone().text());
    assert.equal(t.db.getWorkspace(t.db.getUserByEmail(ALICE.email).id).invoices[0].currency,'USD');
    const profile=await b.req('/api/me',{method:'PATCH',csrf,json:{timeZone:'Europe/Paris',phone:'06 12 34 56 78'}});
    assert.equal(profile.status,200,await profile.clone().text());
    assert.equal((await profile.json()).account.timeZone,'Europe/Paris');
    for(const timeZone of ['Made/Up',{},null])
      assert.equal((await b.req('/api/me',{method:'PATCH',csrf,json:{timeZone}})).status,400);
    const countryChange=await b.req('/api/billing/identity/start',{method:'POST',csrf,json:{
      phone:'9876543210',declaredCountry:'IN',confirmCountry:true
    }});
    assert.equal(countryChange.status,409,'verified accounts with financial history cannot change country');
    assert.equal(t.db.getUserByEmail(ALICE.email).currency,'USD');
  }finally{await t.close();}
});

test('invalid phones, extensions, mismatched calling codes and arbitrary country keys are rejected',()=>{
  for(const raw of [null,{},[],true,4155550123,'','123','5550123','+999123456789','Call 4155550123','+14155550123 ext 4','1'.repeat(41),'+919876543210'])
    assert.equal(normalizeBillingPhone(raw,'US'),null,JSON.stringify(raw));
  for(const country of [null,{},[],true,'','XX','us','__proto__','constructor','toString']){
    assert.equal(validCountry(country),false);
    assert.equal(normalizeBillingPhone('4155550123',country),null);
    assert.equal(billingPlan(country),null);
  }
  assert.equal(normalizeBillingPhone('+14155550123','IN'),null);
});

test('a country declaration is required and cannot be used to obtain India pricing with a foreign phone',async()=>{
  const t=await startServer({env:{WORKSPACE_ACCESS_MODE:'phone'}});
  try{
    const b=t.browser();await signIn(t,b,{profile:ALICE});const csrf=(await b.me()).csrfToken;
    for(const patch of [{declaredCountry:undefined},{declaredCountry:'XX'},{declaredCountry:'__proto__'},
      {declaredCountry:{}},{confirmCountry:false},{declaredCountry:'IN'}]){
      const r=await b.req('/api/billing/identity/start',{method:'POST',csrf,json:{
        phone:'+14155550123',declaredCountry:'US',confirmCountry:true,...patch
      }});
      assert.equal(r.status,400,JSON.stringify(patch));
    }
    assert.equal(t.db.getBillingIdentity(t.db.getUserByEmail(ALICE.email).id),null);
    assert.equal((await b.req('/api/workspace')).status,403);
  }finally{await t.close();}
});

test('shared +1 codes preserve the declared Canadian country and canonical phone uniqueness',async()=>{
  const t=await startServer({env:{WORKSPACE_ACCESS_MODE:'phone'}});
  try{
    for(const [index,raw,country] of [[0,'(416) 555-0123','CA'],[1,'+1 416 555 0123','US']]){
      const b=t.browser();await signIn(t,b,{profile:{sub:'canada-'+index,email:'canada-'+index+'@example.com',name:'Canadian Owner'}});
      const csrf=(await b.me()).csrfToken;
      assert.equal((await b.req('/api/billing/identity/start',{method:'POST',csrf,json:{phone:raw,declaredCountry:country,confirmCountry:true}})).status,200);
      const verified=await b.req('/api/billing/identity/verify',{method:'POST',csrf,json:{code:'000000'}});
      assert.equal(verified.status,index===0?200:409);
      if(index===0){
        const account=(await (await b.req('/api/workspace')).json()).account;
        assert.equal(account.country,'CA');assert.equal(account.currency,'USD');
      }else assert.equal((await b.req('/api/workspace')).status,403);
    }
  }finally{await t.close();}
});

for(const country of ['US','IN','CA','GB','FR','AU','JP','BR','ZA','NP','XK']){
  test(country+' uses its correct server-selected plan and stays locked until recurring authorization',async()=>{
    const indian=country==='IN',amount=indian?50000:2000,currency=indian?'INR':'USD';
    let schedule,authorized=false;
    const t=await startServer({env:{WORKSPACE_ACCESS_MODE:'phone_and_mandate',
      RAZORPAY_KEY_ID:'rzp_test_global',RAZORPAY_KEY_SECRET:'global-test-secret',
      RAZORPAY_WEBHOOK_SECRET:'global-test-webhook-secret',RAZORPAY_PLAN_ID:'plan_global',RAZORPAY_IN_PLAN_ID:'plan_india'},
      razorpay:{
        getPlan:async id=>{assert.equal(id,indian?'plan_india':'plan_global');return {period:'monthly',interval:1,item:{amount,currency}};},
        createSubscription:async params=>{schedule=params;return {id:'sub_global',status:'created',start_at:params.startAt,expire_by:params.expireBy};},
        getSubscription:async()=>({id:'sub_global',status:authorized?'authenticated':'pending',start_at:schedule.startAt,charge_at:schedule.startAt}),
        verifySubscription:()=>true
      }});
    try{
      const b=t.browser();await signIn(t,b,{profile:ALICE});const csrf=(await b.me()).csrfToken;
      const phone=getExampleNumber(country,examples).formatNational();
      assert.equal((await b.req('/api/billing/identity/start',{method:'POST',csrf,json:{phone,declaredCountry:country,confirmCountry:true}})).status,200);
      assert.equal((await b.req('/api/billing/identity/verify',{method:'POST',csrf,json:{code:'000000'}})).status,200);
      assert.equal((await b.req('/api/workspace')).status,403);
      const billing=await (await b.req('/api/billing/status')).json();
      assert.equal(billing.checkoutAvailable,true);assert.equal(billing.monthlyPrice,amount/100);assert.equal(billing.currency,currency);
      const start=await b.req('/api/billing/subscription',{method:'POST',csrf,json:{amount:1,currency:'XXX',planId:'plan_tampered'}});
      assert.equal(start.status,200,await start.clone().text());
      const checkout=await start.json();assert.equal(checkout.amount,amount);assert.equal(checkout.currency,currency);
      assert.equal(checkout.trialEligible,true);assert.equal(schedule.notes.country,country);
      assert.ok(schedule.startAt*1000>=Date.now()+15*86400000);
      const confirmation={razorpay_subscription_id:'sub_global',razorpay_payment_id:'pay_global',razorpay_signature:'signed-test'};
      assert.equal((await b.req('/api/billing/subscription/verify',{method:'POST',csrf,json:confirmation})).status,409);
      assert.equal((await b.req('/api/workspace')).status,403);
      authorized=true;
      assert.equal((await b.req('/api/billing/subscription/verify',{method:'POST',csrf,json:confirmation})).status,200);
      const account=(await (await b.req('/api/workspace')).json()).account;
      assert.equal(account.country,country);assert.equal(account.currency,currency);assert.equal(account.monthlyPrice,amount/100);
      const uid=t.db.getUserByEmail(ALICE.email).id,proof=t.db.getBillingIdentity(uid);
      assert.equal(proof.phone_e164,getExampleNumber(country,examples).number);
      assert.ok(t.db.getUserById(uid).onboarding_completed_at>0);
      assert.equal((await b.req('/api/invoices',{method:'POST',csrf,json:{customerName:'Client',jobTitle:'Service',amount:100}})).status,201);
      assert.equal(t.db.getWorkspace(uid).invoices[0].currency,currency);
    }finally{await t.close();}
  });
}

test('international Google and email signup are accepted by the enforced region gate',async()=>{
  const t=await startServer({env:{REGION_ACCESS_MODE:'enforce',GEOIP_API_KEY:'test-global-geo-key'},
    regionLookup:async()=>({location:{country_code:'FR'},is_vpn:false,is_proxy:false,is_tor:false})});
  try{
    const b=t.browser();await signIn(t,b,{profile:ALICE});
    assert.equal((await b.me()).user.country,'FR');
    const registered=await t.browser().req('/auth/register',{method:'POST',json:{name:'Global Customer',email:'global@example.com',password:'Password123!'}});
    assert.equal(registered.status,201,await registered.clone().text());
    assert.equal(t.db.getUserByEmail('global@example.com').country,'FR');
    assert.equal(t.db.getUserByEmail('global@example.com').currency,'USD');
  }finally{await t.close();}
});

test('international scheduling supports quarter-hour offsets and retains DST ambiguity checks',()=>{
  assert.ok(businessTimeZoneOptions('Asia/Kathmandu').some(x=>x.value==='Asia/Kathmandu'));
  assert.equal(businessLocalDate('Asia/Kathmandu',new Date('2026-10-24T18:30:00Z')),'2026-10-25');
  assert.equal(businessLocalToInstant('2026-10-25T09:00','Asia/Kathmandu'),'2026-10-25T03:15:00.000Z');
  assert.equal(businessLocalToInstant('2026-11-12T09:00','Pacific/Chatham'),'2026-11-11T19:15:00.000Z');
  assert.throws(()=>businessLocalToInstant('2026-10-25T02:30','Europe/Paris'),/missing or repeated/);
});

test('global monthly pricing cannot drift from the advertised USD 20 via configuration',()=>{
  assert.equal(buildConfig({NODE_ENV:'test',PRICE_CENTS:'2000'}).priceCents,2000);
  assert.throws(()=>buildConfig({NODE_ENV:'test',PRICE_CENTS:'500'}),/PRICE_CENTS must be 2000/);
});
