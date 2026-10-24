import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMarketGate} from '../server/market-gate.js';
import {buildConfig} from '../server/config.js';

test('market gate chooses US dollars and Indian rupees from trusted server IP intelligence', async()=>{
 const response=data=>({ok:true,json:async()=>data});
 const mock=async url=>{
   const ip=new URL(url).searchParams.get('q');
   return response(ip==='8.8.8.8'?{location:{country_code:'US'},is_vpn:false,is_proxy:false,is_tor:false}
     :ip==='1.1.1.1'?{location:{country_code:'IN'},is_vpn:false,is_proxy:false,is_tor:false}
     :ip==='9.9.9.9'?{location:{country_code:'GB'}}
     :{location:{country_code:'US'},is_vpn:true});
 };
 const gate=createMarketGate({enabled:true,apiKey:'fake-for-mocks',fetchImpl:mock});
 assert.deepEqual((await gate.lookup('8.8.8.8')).country,'US');
 assert.equal((await gate.lookup('8.8.8.8')).monthlyPrice,20);
 assert.equal((await gate.lookup('1.1.1.1')).currency,'INR');
 assert.equal((await gate.lookup('1.1.1.1')).monthlyPrice,500);
 assert.equal((await gate.lookup('9.9.9.9')).reason,'region_unavailable');
 assert.equal((await gate.lookup('2.2.2.2')).reason,'proxy_detected');
});
test('gate fails closed when provider cannot verify an IP',async()=>{
 const gate=createMarketGate({enabled:true,apiKey:'fake-for-mocks',fetchImpl:async()=>{throw Error('offline')}});
 assert.equal((await gate.lookup('8.8.8.8')).reason,'location_check_unavailable');
 assert.equal((await gate.lookup('127.0.0.1')).reason,'unknown_location');
});
test('production requires market key and cannot turn region restrictions off',()=>{
 const base={NODE_ENV:'production',BASE_URL:'https://cerium.example.test',SESSION_SECRET:'a'.repeat(56),
   GOOGLE_CLIENT_ID:'test-123456789.apps.googleusercontent.com',GOOGLE_CLIENT_SECRET:'GOCSPX-fake-for-tests',TRUST_PROXY:'0',DATABASE_PATH:'/data/db.sqlite'};
 assert.throws(()=>buildConfig(base),/MARKET_IPAPI_KEY/);
 assert.throws(()=>buildConfig({...base,MARKET_GATE_ENABLED:'false'}),/cannot be disabled/);
 const config=buildConfig({...base,MARKET_IPAPI_KEY:'real-testing-only-key'});
 assert.equal(config.marketGateEnabled,true);
});
