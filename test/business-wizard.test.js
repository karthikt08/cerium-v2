import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startServer,signIn,ALICE,BOB} from './helpers.js';
import {businessDetails} from './business-fixtures.js';
import {BUSINESS_SETUP_FIELDS} from '../server/business-profile.js';
import {openDb} from '../server/db.js';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

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
    const legacy=await b.req('/api/business/profile',{method:'POST',csrf,json:businessDetails('US')});
    assert.equal(legacy.status,409);assert.equal((await legacy.json()).error,'business_setup_required');
    assert.equal((await step(b,csrf,'address',fields('US','address'))).status,400);
    assert.equal((await b.req('/api/business/setup/complete',{method:'POST',csrf,json:{confirmBusinessDetails:true,revision:(await (await b.req('/api/business/setup')).json()).revision}})).status,400);
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
    assert.equal((await b.req('/api/business/setup/complete',{method:'POST',csrf,json:{confirmBusinessDetails:false,revision:(await (await b.req('/api/business/setup')).json()).revision}})).status,400);
    assert.equal((await b.req('/api/business/setup/complete',{method:'POST',csrf,json:{confirmBusinessDetails:true,revision:(await (await b.req('/api/business/setup')).json()).revision}})).status,200);
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
    assert.equal((await b.req('/api/business/setup/complete',{method:'POST',csrf,json:{confirmBusinessDetails:true,revision:(await (await b.req('/api/business/setup')).json()).revision}})).status,400);
    assert.equal((await step(b,csrf,'tax',{gstRegistration:'registered',gstin:'33ABCDE1234F1Z5'})).status,200);
    assert.equal((await b.req('/api/business/setup/complete',{method:'POST',csrf,json:{confirmBusinessDetails:true,revision:(await (await b.req('/api/business/setup')).json()).revision}})).status,200);
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
    assert.equal((await b.req('/api/business/setup/complete',{method:'POST',csrf,json:{confirmBusinessDetails:true,revision:(await (await b.req('/api/business/setup')).json()).revision}})).status,400);
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

test('saved steps survive database restart and never carry over to another business country',()=>{
  const directory=mkdtempSync(join(tmpdir(),'cerium-wizard-')),file=join(directory,'workspace.sqlite');let db;
  try{
    db=openDb(file);const user=db.createUser({email:'resume@example.com',name:'Resume Owner'});
    db.beginBillingPhone(user.id,'+14155550123','US');db.completeBillingPhone(user.id,'+14155550123','US');
    db.saveBusinessSetupStep(user.id,'basics',fields('US','basics'));db.close();db=openDb(file);
    assert.equal(db.getBusinessSetup(user.id).step,'address');assert.equal(db.getBusinessSetup(user.id).draft.businessName,'Example Services');
    assert.equal(db.businessProfileComplete(user.id),false);
    assert.equal(db.beginBillingPhone(user.id,'+919876543210','IN').ok,false,'verified country cannot change without review');
    db.updateUser(user.id,{country:'IN'}); // Simulate an approved empty-workspace edition change.
    assert.equal(db.beginBillingPhone(user.id,'+919876543210','IN').ok,true);
    assert.equal(db.completeBillingPhone(user.id,'+919876543210','IN'),true);
    assert.equal(db.getBusinessSetup(user.id).country,'IN');assert.equal(db.getBusinessSetup(user.id).step,'basics');
  }finally{db?.close();rmSync(directory,{recursive:true,force:true});}
});

test('editing through the wizard preserves the original completion and trial deadline',async()=>{
  const t=await startServer({env:{WORKSPACE_ACCESS_MODE:'phone'}});
  try{
    const {b,csrf,uid}=await owner(t);
    for(const name of ['basics','address'])await step(b,csrf,name,fields('US',name));
    await b.req('/api/business/setup/complete',{method:'POST',csrf,json:{confirmBusinessDetails:true,revision:(await (await b.req('/api/business/setup')).json()).revision}});
    const before=t.db.getUserById(uid);
    for(const name of ['basics','address'])assert.equal((await step(b,csrf,name,fields('US',name,{businessName:'Edited Through Wizard'}))).status,200);
    assert.equal((await b.req('/api/business/setup/complete',{method:'POST',csrf,json:{confirmBusinessDetails:true,revision:(await (await b.req('/api/business/setup')).json()).revision}})).status,200);
    const after=t.db.getUserById(uid);assert.equal(after.business_name,'Edited Through Wizard');
    assert.equal(after.business_profile_completed_at,before.business_profile_completed_at);assert.equal(after.trial_ends_at,before.trial_ends_at);
  }finally{await t.close();}
});

test('a stale tab cannot confirm business details changed after its review',async()=>{
  const t=await startServer({env:{WORKSPACE_ACCESS_MODE:'phone'}});
  try{
    const {b,csrf,uid}=await owner(t);
    for(const name of ['basics','address'])await step(b,csrf,name,fields('US',name));
    const reviewed=await (await b.req('/api/business/setup')).json();
    await step(b,csrf,'basics',fields('US','basics',{businessName:'Changed in another tab'}));
    await step(b,csrf,'address',fields('US','address'));
    const stale=await b.req('/api/business/setup/complete',{method:'POST',csrf,json:{confirmBusinessDetails:true,revision:reviewed.revision}});
    assert.equal(stale.status,409);assert.equal((await stale.json()).error,'business_setup_changed');
    assert.equal(t.db.businessProfileComplete(uid),false);assert.equal(t.db.getUserById(uid).onboarding_completed_at,0);
    assert.equal((await b.req('/api/workspace')).status,403);
  }finally{await t.close();}
});

test('the legacy profile endpoint cannot replace and confirm an unreviewed initial draft',async()=>{
  const t=await startServer({env:{WORKSPACE_ACCESS_MODE:'phone'}});
  try{
    const {b,csrf,uid}=await owner(t);
    for(const name of ['basics','address'])await step(b,csrf,name,fields('US',name));
    const r=await b.req('/api/business/profile',{method:'POST',csrf,json:{...businessDetails('US'),businessName:'Never reviewed'}});
    assert.equal(r.status,409);assert.equal(t.db.businessProfileComplete(uid),false);
  }finally{await t.close();}
});

test('confirmation requires the current owner review revision and an explicit boolean',async()=>{
  const t=await startServer({env:{WORKSPACE_ACCESS_MODE:'phone'}});
  try{
    const {b,csrf,uid}=await owner(t);
    for(const name of ['basics','address'])await step(b,csrf,name,fields('US',name));
    const reviewed=await (await b.req('/api/business/setup')).json();
    assert.match(reviewed.revision,/^[a-f0-9]{64}$/);
    for(const revision of [undefined,null,false,0,{},'forged']){
      const r=await b.req('/api/business/setup/complete',{method:'POST',csrf,json:{confirmBusinessDetails:true,revision}});
      assert.equal(r.status,409);assert.equal(t.db.businessProfileComplete(uid),false);
    }
    for(const confirmBusinessDetails of [undefined,null,false,'true',1]){
      const r=await b.req('/api/business/setup/complete',{method:'POST',csrf,json:{confirmBusinessDetails,revision:reviewed.revision}});
      assert.equal(r.status,400);assert.equal(t.db.businessProfileComplete(uid),false);
    }
    const request=()=>b.req('/api/business/setup/complete',{method:'POST',csrf,json:{confirmBusinessDetails:true,revision:reviewed.revision}});
    const responses=await Promise.all([request(),request()]);
    assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
    const user=t.db.getUserById(uid);
    assert.equal(user.trial_ends_at-user.onboarding_completed_at,15*86400000);
    assert.equal((await b.req('/api/workspace')).status,200);
  }finally{await t.close();}
});

test('stale reviews fail when another tab moves back and fresh reviewed changes can complete',async()=>{
  const t=await startServer({env:{WORKSPACE_ACCESS_MODE:'phone'}});
  try{
    const {b,csrf,uid}=await owner(t);
    for(const name of ['basics','address'])await step(b,csrf,name,fields('US',name));
    const reviewed=await (await b.req('/api/business/setup')).json();
    await step(b,csrf,'basics',fields('US','basics',{businessName:'Corrected name'}));
    assert.equal((await b.req('/api/business/setup/complete',{method:'POST',csrf,json:{confirmBusinessDetails:true,revision:reviewed.revision}})).status,409);
    await step(b,csrf,'address',fields('US','address'));
    const fresh=await (await b.req('/api/business/setup')).json();
    assert.notEqual(fresh.revision,reviewed.revision);
    assert.equal((await b.req('/api/business/setup/complete',{method:'POST',csrf,json:{confirmBusinessDetails:true,revision:fresh.revision}})).status,200);
    assert.equal(t.db.getBusinessProfile(uid).businessName,'Corrected name');
  }finally{await t.close();}
});
