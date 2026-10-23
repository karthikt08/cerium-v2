import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {openDb} from '../server/db.js';
import {US_STATES,US_TIME_ZONES,validUsState,validUsZip,validUsTimeZone,businessLocalDate,businessLocalDateTime,businessLocalToInstant,formatUSPhone} from '../public/js/us-market.js';
import {startServer,signIn,ALICE} from './helpers.js';

test('US market formatters accept all states, ZIP+4 and all supported US zones',()=>{
  assert.equal(Object.keys(US_STATES).length,52);
  assert.equal(validUsState('CA'),true);
  assert.equal(validUsState('PR'),true);
  assert.equal(validUsState('ZZ'),false);
  assert.equal(validUsState(''),true); // progressive profile completion
  assert.equal(validUsZip('94105'),true);
  assert.equal(validUsZip('94105-1234'),true);
  for(const z of ['9410','123456','SW1A 1AA','ABCDE','12345-123'])assert.equal(validUsZip(z),false,z);
  for(const tz of Object.keys(US_TIME_ZONES))assert.equal(validUsTimeZone(tz),true,tz);
  assert.equal(validUsTimeZone('Asia/Kolkata'),false);
  assert.equal(formatUSPhone('4155550123'),'(415) 555-0123');
  assert.equal(formatUSPhone('+1 (415) 555-0123'),'(415) 555-0123');
  assert.equal(formatUSPhone('555-0123'),'555-0123'); // never silently corrupt nonstandard contact entries
  assert.equal(formatUSPhone('4155550123 ext 22'),'4155550123 ext 22');
});

test('US business dates follow regional time zones including near UTC midnight',()=>{
  const instant=new Date('2026-10-23T05:00:00.000Z');
  assert.equal(businessLocalDate('America/New_York',instant),'2026-10-23');
  assert.equal(businessLocalDate('America/Los_Angeles',instant),'2026-10-22');
  assert.equal(businessLocalDate('Pacific/Honolulu',instant),'2026-10-22');
  assert.equal(businessLocalDate('America/Puerto_Rico',instant),'2026-10-23');
});

test('reminder scheduling converts US business clock to UTC without DST ambiguity',()=>{
  assert.equal(businessLocalToInstant('2026-10-23T09:00','America/Los_Angeles'),'2026-10-23T16:00:00.000Z');
  assert.equal(businessLocalToInstant('2026-12-23T09:00','America/Los_Angeles'),'2026-12-23T17:00:00.000Z');
  assert.equal(businessLocalToInstant('2026-10-23T09:00','America/New_York'),'2026-10-23T13:00:00.000Z');
  assert.equal(businessLocalDateTime('America/Los_Angeles',new Date('2026-10-23T05:00:00Z')),'2026-10-22T22:00');
  assert.throws(()=>businessLocalToInstant('2026-03-08T02:30','America/New_York'),/daylight saving/);
  assert.throws(()=>businessLocalToInstant('2026-11-01T01:30','America/New_York'),/daylight saving/);
  assert.throws(()=>businessLocalToInstant('bad','America/New_York'),/valid reminder/);
});

test('profile: US state, ZIP and time zone persist; non-US and non-USD changes are rejected',async()=>{
  const t=await startServer();
  try{
    const browser=t.browser();
    await signIn(t,browser,{profile:ALICE});
    const csrf=(await browser.me()).csrfToken;
    const call=async(path,method='GET',json)=>{
      const response=await browser.req(path,{method,json,csrf});
      return {status:response.status,data:await response.json()};
    };
    const changed=await call('/api/me','PATCH',{
      name:'US Contractor',country:'US',currency:'USD',
      businessName:'Example Home Services',location:'San Francisco',phone:'(415) 555-0123',
      usState:'CA',usZip:'94105-0123',timeZone:'America/Los_Angeles',
    });
    assert.equal(changed.status,200);
    assert.equal(changed.data.account.usState,'CA');
    assert.equal(changed.data.account.usZip,'94105-0123');
    assert.equal(changed.data.account.timeZone,'America/Los_Angeles');
    const ws=(await call('/api/workspace')).data;
    assert.equal(ws.account.country,'US');
    assert.equal(ws.account.currency,'USD');
    assert.equal(ws.account.usState,'CA');
    assert.equal(ws.account.timeZone,'America/Los_Angeles');
    for(const invalid of [
      {country:'IN'}, {currency:'INR'}, {usState:'ZZ'},
      {usZip:'bad zip'}, {usZip:'9999'}, {timeZone:'Asia/Tokyo'},
    ]){
      const response=await call('/api/me','PATCH',invalid);
      assert.equal(response.status,400,JSON.stringify(invalid));
      assert.equal(response.data.error,'invalid_us_profile');
    }
    const unchanged=(await call('/api/workspace')).data.account;
    assert.equal(unchanged.usState,'CA');
    assert.equal(unchanged.currency,'USD');
  }finally{await t.close();}
});

test('US edition does not silently relabel legacy invoice amounts or historical quote currencies',async()=>{
  const t=await startServer();
  try{
    const browser=t.browser();await signIn(t,browser,{profile:ALICE});
    const me=await browser.me(),userId=me.user.id;
    const invoice=t.db.createInvoice(userId,{
      customerName:'A Customer',jobTitle:'Inspection',amount:425,status:'Draft',
    });
    t.db.rawDb.prepare('UPDATE users SET currency=? WHERE id=?').run('INR',userId);
    const ws=t.db.getWorkspace(userId);
    assert.equal(ws.account.currency,'INR'); // visible legacy state, not a silent conversion
    assert.equal(ws.invoices.find(i=>i.id===invoice.id).total,425);
    assert.throws(()=>t.db.updateUser(userId,{currency:'INR'}),{code:'invalid_us_profile'});
    assert.throws(()=>t.db.updateUser(userId,{currency:'USD'}),{code:'invalid_us_profile'});
    t.db.updateUser(userId,{usState:'NY',usZip:'10001',timeZone:'America/New_York'});
    assert.equal(t.db.getWorkspace(userId).invoices.find(i=>i.id===invoice.id).total,425);
  }finally{await t.close();}
});


test('US profile migrations are additive and idempotent on persistent SQLite',()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'cerium-us-'));
  const file=path.join(temp,'workspace.db');
  try{
    for(let n=0;n<2;n++){
      const db=openDb(file);
      try{
        const columns=db.rawDb.prepare('PRAGMA table_info(users)').all().map(row=>row.name);
        for(const name of ['us_state','us_zip','time_zone','country','currency'])
          assert.ok(columns.includes(name),name);
        assert.equal(db.rawDb.pragma('foreign_keys',{simple:true}),1);
      }finally{db.close();}
    }
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
});

test('US-only page positioning and invoice presentation are present without relabeling historic currency',()=>{
  const landing=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  const app=fs.readFileSync(new URL('../public/js/app.js',import.meta.url),'utf8');
  const signup=fs.readFileSync(new URL('../public/signup.html',import.meta.url),'utf8');
  assert.match(landing,/United States/);
  assert.doesNotMatch(landing,/US and India/);
  assert.match(signup,/US service businesses/);
  assert.match(app,/US state/);
  assert.match(app,/ZIP code/);
  assert.match(app,/Business time zone/);
  assert.match(app,/const usAddress=/);
  assert.match(app,/legacy non-USD/);
});
