import {test} from 'node:test';
import assert from 'node:assert/strict';
import {decideRegion,makeIpApiLookup} from '../server/region-access.js';
import {buildConfig} from '../server/config.js';
import {startServer,signIn,ALICE} from './helpers.js';

const options={REGION_ACCESS_MODE:'enforce',GEOIP_API_KEY:'regtoken-1234567890abcdef'};
const fixture=(country='US',flags={})=>({
  location:{country_code:country},
  is_vpn:false,is_proxy:false,is_tor:false,
  ...flags,
});
const runFor=async(raw,fn)=>{
  const t=await startServer({env:options,regionLookup:async()=>raw});
  try{await fn(t,t.browser());}finally{await t.close();}
};

test('country selection is US/USD or India/INR, rejecting elsewhere and incomplete network data',()=>{
  assert.deepEqual(decideRegion(fixture('US')),{ok:true,country:'US',currency:'USD',monthlyPrice:20,minorUnits:2000});
  assert.deepEqual(decideRegion(fixture('IN')),{ok:true,country:'IN',currency:'INR',monthlyPrice:500,minorUnits:50000});
  assert.deepEqual(decideRegion(fixture('FR')),{ok:false,status:403,reason:'country_unavailable'});
  assert.deepEqual(decideRegion(fixture('US',{is_vpn:true})),{ok:false,status:403,reason:'anonymous_network'});
  assert.deepEqual(decideRegion(fixture('US',{is_proxy:true})),{ok:false,status:403,reason:'anonymous_network'});
  assert.deepEqual(decideRegion(fixture('IN',{is_tor:true})),{ok:false,status:403,reason:'anonymous_network'});
  assert.deepEqual(decideRegion({location:{country_code:'IN'}}),{ok:false,status:503,reason:'unverified'});
  assert.deepEqual(decideRegion({is_bogon:true,...fixture('US')}),{ok:false,status:503,reason:'unverified'});
});

test('GeoIP request carries token only in HTTPS POST JSON body and rejects upstream errors',async()=>{
  let calls=0;
  const lookup=makeIpApiLookup('private-token-123456',{fetchImpl:async (url,options)=>{
    calls++;
    assert.equal(url,'https://api.ipapi.is/');
    assert.equal(options.method,'POST');
    assert.deepEqual(JSON.parse(options.body),{q:'8.8.8.8',key:'private-token-123456'});
    return {ok:true,json:async()=>fixture('US')};
  }});
  assert.equal((await lookup('8.8.8.8')).location.country_code,'US');
  assert.equal(calls,1);
  const failure=makeIpApiLookup('private-token',{fetchImpl:async()=>({ok:false})});
  await assert.rejects(failure('8.8.8.8'),/GeoIP provider unavailable/);
});

test('production cannot disable geographic restrictions or run without a provider key',()=>{
  assert.throws(()=>buildConfig({...options,NODE_ENV:'production',REGION_ACCESS_MODE:'off'}),/region access/);
  assert.throws(()=>buildConfig({NODE_ENV:'test',REGION_ACCESS_MODE:'enforce'}),/GEOIP_API_KEY/);
});

test('US signup via Google is USD from the start, and country cannot be changed by API',async()=>{
  await runFor(fixture('US'),async(t,b)=>{
    const region=await b.req('/api/region');
    assert.equal(region.status,200);
    assert.equal((await region.json()).monthlyPrice,20);
    const login=await signIn(t,b,{profile:ALICE});
    assert.equal(login.cb.status,303);
    const ws=await b.req('/api/workspace');
    assert.equal(ws.status,200);
    const data=await ws.json();
    assert.equal(data.account.country,'US');
    assert.equal(data.account.currency,'USD');
    assert.equal(data.account.regionLocked,true);
    const csrf=(await b.me()).csrfToken;
    const patched=await b.req('/api/me',{method:'PATCH',json:{country:'IN'},csrf});
    assert.equal(patched.status,403);
    assert.equal((await patched.json()).error,'region_locked');
    const billing=await b.req('/api/billing/status');
    assert.equal(billing.status,200);
    assert.equal((await billing.json()).currency,'USD');
  });
});

test('India Google signup immediately creates INR workspace and INR 500 pricing',async()=>{
  await runFor(fixture('IN'),async(t,b)=>{
    const region=await b.req('/api/region');
    assert.equal((await region.json()).monthlyPrice,500);
    const signInResult=await signIn(t,b,{profile:ALICE});
    assert.equal(signInResult.cb.status,303);
    const data=await (await b.req('/api/workspace')).json();
    assert.equal(data.account.country,'IN');
    assert.equal(data.account.currency,'INR');
    assert.equal(data.account.timeZone,'Asia/Kolkata');
    assert.equal(data.account.monthlyPrice,500);
    const csrf=(await b.me()).csrfToken;
    const rejected=await b.req('/api/me',{method:'PATCH',json:{country:'US'},csrf});
    assert.equal(rejected.status,403);
    assert.equal((await rejected.json()).error,'region_locked');
    const price=await (await b.req('/api/billing/status')).json();
    assert.equal(price.currency,'INR');
    assert.equal(price.monthlyPrice,500);
  });
});

test('unsupported country, detected VPN and unverifiable network block HTML and API access',async()=>{
  for(const [raw,status,error] of [
    [fixture('FR'),403,'country_unavailable'],
    [fixture('US',{is_vpn:true}),403,'anonymous_network'],
    [fixture('IN',{is_proxy:true}),403,'anonymous_network'],
    [{location:null,is_vpn:false,is_proxy:false,is_tor:false},503,'unverified'],
  ]){
    await runFor(raw,async(t,b)=>{
      const home=await b.req('/');
      assert.equal(home.status,status);
      const api=await b.req('/api/region');
      assert.equal(api.status,status);
      assert.equal((await api.json()).error,error);
      const health=await b.req('/healthz');
      assert.equal(health.status,200);
    });
  }
});

test('untrusted X-Forwarded-For cannot override the socket IP at trustProxy=0',async()=>{
  const seen=[];
  const t=await startServer({env:{...options,TRUST_PROXY:'0'},regionLookup:async ip=>{
    seen.push(ip);return fixture('US');
  }});
  try {
    const b=t.browser();
    const r=await b.req('/api/region',{headers:{'x-forwarded-for':'203.0.113.99','cf-ipcountry':'IN'}});
    assert.equal(r.status,200);
    assert.equal((await r.json()).country,'US');
    assert.ok(seen.every(ip=>ip==='127.0.0.1'||ip==='::1'||ip==='::ffff:127.0.0.1'));
  }finally{await t.close();}
});

test('previously registered accounts cannot be silently repriced if detected market differs',async()=>{
  const t=await startServer({env:options,regionLookup:async()=>fixture('IN')});
  try {
    t.db.createUser({email:ALICE.email,name:ALICE.name,country:'US'});
    const b=t.browser();
    const result=await signIn(t,b,{profile:ALICE});
    assert.equal(result.cb.status,303);
    const ws=await b.req('/api/workspace');
    assert.equal(ws.status,409);
    const resultBody=await ws.json();
    assert.equal(resultBody.error,'region_mismatch');
    const account=t.db.getUserByEmail(ALICE.email);
    assert.equal(account.currency,'USD');
  }finally{await t.close();}
});
