import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

test('hosted checkout discloses a free trial only for an eligible first authorization',async()=>{
  const script=readFileSync(new URL('../public/js/billing.js',import.meta.url),'utf8');
  for(const currency of ['USD','INR'])for(const trialEligible of [true,false]){
    let checkout,opened=false;
    const window={
      CeriumAPI:{createRecurringSubscription:async()=>({keyId:'test-key',subscriptionId:'sub_test',
        status:'created',startAt:1800000000,currency,trialEligible})},
      Razorpay:class {constructor(options){checkout=options;}on(){}open(){opened=true;}},
    };
    runInNewContext(script,{window});
    let error;
    await window.CeriumBilling.startSubscriptionCheckout({onError:e=>{error=e;}});
    assert.equal(error,undefined);assert.equal(opened,true);
    assert.equal(checkout.description.includes('15 full days free'),trialEligible);
    assert.ok(checkout.description.includes(currency==='INR'?'₹500/month':'$20/month'));
    assert.ok(checkout.description.includes('debit scheduled'));
  }
});
