import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {buildConfig} from '../server/config.js';
import {makeRazorpay} from '../server/razorpay.js';
import {GOOD_SECRET} from './helpers.js';

test('real Razorpay adapter uses the credentials returned by buildConfig',async()=>{
  const config=buildConfig({NODE_ENV:'test',SESSION_SECRET:GOOD_SECRET,
    RAZORPAY_KEY_ID:'rzp_test_adapter',RAZORPAY_KEY_SECRET:'adapter-test-secret',
    RAZORPAY_WEBHOOK_SECRET:'adapter-test-webhook-secret'});
  let called;
  const client=makeRazorpay({...config,fetchImpl:async(url,options)=>{
    called={url,options};return {ok:true,json:async()=>({id:'plan_test'})};
  }});
  assert.deepEqual(await client.getPlan('plan_test'),{id:'plan_test'});
  assert.equal(called.options.headers.Authorization,'Basic '+Buffer.from('rzp_test_adapter:adapter-test-secret').toString('base64'));
  const payload=Buffer.from('{"event":"test"}');
  const signature=createHmac('sha256',config.razorpayWebhookSecret).update(payload).digest('hex');
  assert.equal(client.verifyWebhook(payload,signature),true);
  assert.equal(client.verifyWebhook(Buffer.from('changed'),signature),false);
  const signed=createHmac('sha256',config.razorpayKeySecret).update('pay_test|sub_test').digest('hex');
  assert.equal(client.verifySubscription({paymentId:'pay_test',subscriptionId:'sub_test',signature:signed}),true);
  assert.ok(called.options.signal,'provider calls have a bounded timeout');
});
