import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startServer,signIn,ALICE,BOB} from './helpers.js';
import {businessDetails} from './business-fixtures.js';
import {BUSINESS_SETUP_FIELDS} from '../server/business-profile.js';

async function owner(t,country='US',profile=ALICE){
  const b=t.browser();await signIn(t,b,{profile});const csrf=(await b.me()).csrfToken;
  const uid=t.db.getUserByEmail(profile.email).id;
  t.db.beginBillingPhone(uid,country==='IN'?'+919876543210':'+14155550123',country);
  t.db.completeBillingPhone(uid,country==='IN'?'+919876543210':'+14155550123',country);
  return {b,csrf,uid};
}
const fields=(country,step,patch={})=>Object.fromEntries(BUSINESS_SETUP_FIELDS[step].map(key=>[key,({...businessDetails(country),...patch})[key]]));
const step=(b,csrf,name,data)=>b.req('/api/business/setup',{method:'POST',csrf,json:{step:name,fields:data}});

test('step progression persists across sessions and only review confirmation unlocks the workspace',async()=>{
  const t=await startServer({env:{WORKSPACE_ACCESS_MODE:'phone'}});
  try{
    const {b,csrf,uid}=await owner(t);
    assert.equal((await (await b.req('/api/business/setup')).json()).step,'basics');
    assert.equal((await step(b,csrf,'address',fields('US','address'))).status,400);
    assert.equal((await b.req('/api/business/setup/complete',{method:'POST',csrf,json:{confirmBusinessDetails:true}})).status,400);
    const saved=await step(b,csrf,'basics',fields('US','basics',{businessEmail:' Business@EXAMPLE.COM '}));
    assert.equal(saved.status,200);assert.equal((await saved.json()).step,'address');
    const again=t.browser();await signIn(t,again,{profile:ALICE});
    const resumed=await (await again.req('/api/business/setup')).json();assert.equal(resumed.step,'address');assert.equal(resumed.draft.businessEmail,'business@example.com');
    for(const path of ['/api/workspace','/api/jobs','/api/invoices'])assert.equal((await b.req(path)).status,403,path);
    assert.equal((await b.req('/api/billing/subscription',{method:'POST',csrf})).status,409);
    assert.equal(t.db.getUserById(uid).onboarding_completed_at,0);
    assert.equal((await step(b,csrf,'address',fields('US','address'))).status,200);
    assert.equal((await (await b.req('/api/business/setup')).json()).step,'review');
    assert.equal((await b.req('/api/workspace')).status,403);
    assert.equal((await b.req('/api/business/setup/complete',{method:'POST',csrf,json:{confirmBusinessDetails:false}})).status,400);
    assert.equal((await b.req('/api/business/setup/complete',{method:'POST',csrf,json:{confirmBusinessDetails:true}})).status,200);
    assert.equal((await b.req('/api/workspace')).status,200);
    assert.equal(t.db.getUserById(uid).business_setup_draft,'{}');assert.equal(t.db.getBusinessProfile(uid).complete,true);
    assert.equal(t.db.getUserById(uid).trial_ends_at-t.db.getUserById(uid).onboarding_completed_at,15*86400000);
  }finally{await t.close();}
});

test('India tax step cannot be skipped and GST errors do not advance it',async()=>{
  const t=await startServer({env:{WORKSPACE_ACCESS_MODE:'phone'}});
  try{
    const {b,csrf}=await owner(t,'IN');
    await step(b,csrf,'basics',fields('IN','basics'));await step(b,csrf,'address',fields('IN','address'));
    assert.equal((await (await b.req('/api/business/setup')).json()).step,'tax');
    for(const data of [{gstRegistration:''},{gstRegistration:'registered',gstin:''},{gstRegistration:'registered',gstin:'29ABCDE1234F1Z5'}])
      assert.equal((await step(b,csrf,'tax',data)).status,400);
    assert.equal((await b.req('/api/business/setup/complete',{method:'POST',csrf,json:{confirmBusinessDetails:true}})).status,400);
    assert.equal((await step(b,csrf,'tax',{gstRegistration:'registered',gstin:'33ABCDE1234F1Z5'})).status,200);
    assert.equal((await b.req('/api/business/setup/complete',{method:'POST',csrf,json:{confirmBusinessDetails:true}})).status,200);
    const profile=await (await b.req('/api/business/profile')).json();assert.equal(profile.gstin,'33ABCDE1234F1Z5');
  }finally{await t.close();}
});

test('setup drafts reject cross-step fields, invalid values and forged progress atomically',async()=>{
  const t=await startServer({env:{WORKSPACE_ACCESS_MODE:'phone'}});
  try{
    const {b,csrf,uid}=await owner(t);
    for(const data of [null,[],{...fields('US','basics'),country:'IN'},{...fields('US','basics'),completedAt:Date.now()},
      fields('US','basics',{businessName:''}),fields('US','basics',{businessEmail:'bad'})]){
      assert.equal((await step(b,csrf,'basics',data)).status,400);
      assert.equal(t.db.getUserById(uid).business_setup_draft,'{}');
    }
    for(const name of ['review','payment','complete','__proto__',null])assert.equal((await step(b,csrf,name,{})).status,400);
    await step(b,csrf,'basics',fields('US','basics'));await step(b,csrf,'address',fields('US','address'));
    assert.equal((await step(b,csrf,'basics',fields('US','basics',{businessName:'Corrected Name'}))).status,200);
    assert.equal((await (await b.req('/api/business/setup')).json()).step,'address');
    assert.equal((await b.req('/api/business/setup/complete',{method:'POST',csrf,json:{confirmBusinessDetails:true}})).status,400);
  }finally{await t.close();}
});

test('draft saving requires phone, session, CSRF and same origin and never leaks another owner draft',async()=>{
  const t=await startServer({env:{WORKSPACE_ACCESS_MODE:'phone'}});
  try{
    const {b,csrf}=await owner(t);const stranger=t.browser();
    assert.equal((await stranger.req('/api/business/setup')).status,401);
    assert.equal((await step(b,null,'basics',fields('US','basics'))).status,403);
    assert.equal((await b.req('/api/business/setup',{method:'POST',csrf,origin:'https://evil.example',json:{step:'basics',fields:fields('US','basics')}})).status,403);
    await signIn(t,stranger,{profile:BOB});const bobCsrf=(await stranger.me()).csrfToken;
    assert.equal((await step(stranger,bobCsrf,'basics',fields('US','basics'))).status,409);
    await step(b,csrf,'basics',fields('US','basics',{businessName:'Owner Private Draft'}));
    assert.equal((await (await stranger.req('/api/business/setup')).json()).draft.businessName,'');
    const exported=await (await b.req('/api/me/export')).json();assert.equal(exported.businessSetup.draft.businessName,'Owner Private Draft');
  }finally{await t.close();}
});
