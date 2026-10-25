import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startServer,signIn,ALICE,BOB} from './helpers.js';
import {businessDetails,completeBusiness} from './business-fixtures.js';
import {validateBusinessProfile} from '../server/business-profile.js';
import {makeTrialSchedule} from '../server/trial-timing.js';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import Database from 'better-sqlite3';
import {openDb} from '../server/db.js';

async function phone(t,b,country='US'){
  const csrf=(await b.me()).csrfToken;
  assert.equal((await b.req('/api/billing/identity/start',{method:'POST',csrf,json:{
    declaredCountry:country,confirmCountry:true,phone:country==='IN'?'9876543210':country==='FR'?'06 12 34 56 78':'4155550123'
  }})).status,200);
  assert.equal((await b.req('/api/billing/identity/verify',{method:'POST',csrf,json:{code:'000000'}})).status,200);
  return csrf;
}

test('phone approval alone cannot unlock the shell, APIs, checkout or trial clock',async()=>{
  const t=await startServer({env:{WORKSPACE_ACCESS_MODE:'phone'}});
  try{
    const b=t.browser();await signIn(t,b,{profile:ALICE});const csrf=await phone(t,b);
    const uid=t.db.getUserByEmail(ALICE.email).id;
    assert.equal(t.db.getUserById(uid).onboarding_completed_at,0);
    for(const url of ['/api/workspace','/api/leads','/api/jobs','/api/quotes'])assert.equal((await b.req(url)).status,403,url);
    for(const url of ['/app.html','/app','/%61pp.html'])assert.equal((await b.req(url)).headers.get('location'),'/verify.html');
    assert.equal((await b.req('/api/invoices',{method:'POST',csrf,json:{customerName:'Bypass',jobTitle:'Work',amount:10}})).status,403);
    const checkout=await b.req('/api/billing/subscription',{method:'POST',csrf});
    assert.equal(checkout.status,409);assert.equal((await checkout.json()).error,'business_profile_required');
    const before=Date.now();await completeBusiness(t,b);
    const user=t.db.getUserById(uid);
    assert.ok(user.business_profile_completed_at>=before);assert.ok(user.onboarding_completed_at>=before);
    assert.equal(user.trial_ends_at-user.onboarding_completed_at,15*86400000);
    assert.equal((await b.req('/app.html')).status,200);assert.equal((await b.req('/api/workspace')).status,200);
    const proof=await (await b.req('/api/billing/identity')).json();assert.equal(proof.businessComplete,true);assert.equal(proof.workspaceUnlocked,true);
  }finally{await t.close();}
});

test('business submission requires an authenticated owner, CSRF and a verified phone',async()=>{
  const t=await startServer({env:{WORKSPACE_ACCESS_MODE:'phone'}});
  try{
    const b=t.browser();assert.equal((await b.req('/api/business/profile')).status,401);
    await signIn(t,b,{profile:ALICE});const csrf=(await b.me()).csrfToken;
    assert.equal((await b.req('/api/business/profile',{method:'POST',json:businessDetails()})).status,403);
    const denied=await b.req('/api/business/profile',{method:'POST',csrf,json:businessDetails()});
    assert.equal(denied.status,409);assert.equal((await denied.json()).error,'phone_verification_required');
    assert.equal(t.db.getUserByEmail(ALICE.email).business_profile_completed_at,0);
  }finally{await t.close();}
});

test('required fields, malformed values and country/confirmation changes cannot complete setup',async()=>{
  const t=await startServer({env:{WORKSPACE_ACCESS_MODE:'phone'}});
  try{
    const b=t.browser();await signIn(t,b,{profile:ALICE});const csrf=await phone(t,b);
    for(const patch of [
      ...['name','businessName','trade','businessEmail','businessAddress','businessCity','businessPostalCode','usState','timeZone'].map(key=>({[key]:' '})),
      {businessName:{}},{businessAddress:['12 Road']},{businessEmail:'invalid'},{businessEmail:'a@example.com\r\nBcc:x@example.com'},
      {businessCity:'x'.repeat(81)},{timeZone:'Bad/Zone'},{usState:'ZZ'},{businessPostalCode:'1234'},
      {country:'IN'},{confirmBusinessDetails:false},{confirmBusinessDetails:'true'}
    ]){
      const result=await b.req('/api/business/profile',{method:'POST',csrf,json:{...businessDetails(),...patch}});
      assert.equal(result.status,400,JSON.stringify(patch));assert.equal((await result.json()).error,'invalid_business_profile');
      assert.equal(t.db.getUserByEmail(ALICE.email).business_profile_completed_at,0);
      assert.equal(t.db.getUserByEmail(ALICE.email).business_name,null);
    }
    for(const json of [null,[],true,'text'])assert.equal((await b.req('/api/business/profile',{method:'POST',csrf,json})).status,400);
    assert.equal((await b.req('/api/workspace')).status,403);
  }finally{await t.close();}
});

test('India requires state, PIN and a GST declaration; GSTIN is conditional',()=>{
  const valid=businessDetails('IN');assert.equal(validateBusinessProfile(valid,'IN').gstin,'');
  assert.equal(validateBusinessProfile({...valid,gstRegistration:'registered',gstin:'33ABCDE1234F1Z5'},'IN').gstin,'33ABCDE1234F1Z5');
  for(const patch of [{indiaState:''},{businessPostalCode:'000000'},{businessPostalCode:'12345'},
    {gstRegistration:''},{gstRegistration:'registered',gstin:''},
    {gstRegistration:'registered',gstin:'29ABCDE1234F1Z5'},
    {gstRegistration:'not_registered',gstin:'33ABCDE1234F1Z5'}])
    assert.throws(()=>validateBusinessProfile({...valid,...patch},'IN'),{code:'invalid_business_profile'});
});

test('international businesses can complete setup without US state/ZIP or Indian tax fields',async()=>{
  const t=await startServer({env:{WORKSPACE_ACCESS_MODE:'phone'}});
  try{
    const b=t.browser();await signIn(t,b,{profile:ALICE});await phone(t,b,'FR');
    await completeBusiness(t,b,'FR');const account=(await (await b.req('/api/workspace')).json()).account;
    assert.equal(account.country,'FR');assert.equal(account.currency,'USD');assert.equal(account.businessProfile.complete,true);
    assert.equal(account.businessProfile.usState,'');assert.equal(account.businessProfile.businessPostalCode,'');
  }finally{await t.close();}
});

test('phone and business completion still cannot bypass the production mandate gate',async()=>{
  const t=await startServer({env:{WORKSPACE_ACCESS_MODE:'phone_and_mandate'}});
  try{
    const b=t.browser();await signIn(t,b,{profile:ALICE});await phone(t,b);await completeBusiness(t,b);
    assert.equal((await b.req('/api/workspace')).status,403);
    assert.equal(t.db.getUserByEmail(ALICE.email).onboarding_completed_at,0);
    const proof=await (await b.req('/api/billing/identity')).json();assert.equal(proof.businessComplete,true);assert.equal(proof.paymentAuthorized,false);
  }finally{await t.close();}
});

test('editing completed details is atomic, cannot clear mandatory fields, and never restarts the trial',async()=>{
  const t=await startServer({env:{WORKSPACE_ACCESS_MODE:'phone'}});
  try{
    const b=t.browser();await signIn(t,b,{profile:ALICE});const csrf=await phone(t,b);await completeBusiness(t,b);
    const before=t.db.getUserByEmail(ALICE.email);
    const save=await b.req('/api/business/profile',{method:'POST',csrf,json:{...businessDetails(),businessName:'Updated Name',businessEmail:'NEW@example.com'}});
    assert.equal(save.status,200);
    for(const json of [{name:''},{businessName:''},{trade:''},{usZip:''},{timeZone:''}])
      assert.equal((await b.req('/api/me',{method:'PATCH',csrf,json})).status,400,JSON.stringify(json));
    const after=t.db.getUserByEmail(ALICE.email);
    assert.equal(after.business_email,'new@example.com');assert.equal(after.business_name,'Updated Name');
    assert.equal(after.business_profile_completed_at,before.business_profile_completed_at);
    assert.equal(after.trial_ends_at,before.trial_ends_at);assert.equal(after.onboarding_completed_at,before.onboarding_completed_at);
    const failed=await b.req('/api/business/profile',{method:'POST',csrf,json:{...businessDetails(),businessName:'Do not save',businessCity:''}});
    assert.equal(failed.status,400);assert.equal(t.db.getUserByEmail(ALICE.email).business_name,'Updated Name');
  }finally{await t.close();}
});

test('profile data is owner scoped and included in account export',async()=>{
  const t=await startServer({env:{WORKSPACE_ACCESS_MODE:'phone'}});
  try{
    const b=t.browser();await signIn(t,b,{profile:ALICE});await phone(t,b);await completeBusiness(t,b);
    const other=t.browser();await signIn(t,other,{profile:BOB});
    const own=await (await other.req('/api/business/profile')).json();assert.equal(own.businessName,'');assert.equal(own.complete,false);
    const csrf=(await b.me()).csrfToken;
    assert.equal((await b.req('/api/business/profile',{method:'POST',csrf,json:{...businessDetails(),userId:t.db.getUserByEmail(BOB.email).id,currency:'INR',completedAt:1,business_profile_completed_at:1}})).status,200);
    assert.equal(t.db.getUserByEmail(BOB.email).business_profile_completed_at,0);
    assert.equal(t.db.getUserByEmail(ALICE.email).currency,'USD');assert.ok(t.db.getUserByEmail(ALICE.email).business_profile_completed_at>1);
    const exported=await (await b.req('/api/me/export')).json();
    assert.ok(JSON.stringify(exported).includes('business@example.com'));assert.ok(JSON.stringify(exported).includes('12 Example Street'));
  }finally{await t.close();}
});

test('existing paid accounts finish missing setup without losing paid dates, export or cancellation',async()=>{
  const t=await startServer({env:{WORKSPACE_ACCESS_MODE:'phone_and_mandate'},razorpay:{cancelSubscription:async()=>({status:'cancelled'})}});
  try{
    const b=t.browser();await signIn(t,b,{profile:ALICE});const csrf=await phone(t,b),uid=t.db.getUserByEmail(ALICE.email).id;
    const end=Date.now()+7*86400000;t.db.createSubscription(uid,'sub_existing',Math.floor(Date.now()/1000)-86400);
    t.db.updateSubscription('sub_existing','active',end);
    assert.equal((await b.req('/api/workspace')).status,403);assert.equal((await b.req('/api/me/export')).status,200);
    assert.equal((await b.req('/api/billing/subscription/cancel',{method:'POST',csrf})).status,200);
    await completeBusiness(t,b);assert.equal((await b.req('/api/workspace')).status,200);
    const user=t.db.getUserById(uid);assert.equal(user.subscription_expires_at,end);assert.equal(user.onboarding_completed_at,0);
  }finally{await t.close();}
});

test('a legacy database gains required profile fields without changing invoices, billing or trial dates',()=>{
  const directory=mkdtempSync(join(tmpdir(),'cerium-business-migration-')),file=join(directory,'legacy.sqlite');
  const columns=['business_email','business_address','business_city','business_region','business_postal_code','gst_registration','business_profile_completed_at','business_setup_draft'];
  let db;
  try{
    db=openDb(file);
    const user=db.createUser({email:'legacy@example.com',name:'Legacy Owner',businessName:'Legacy Services'});
    const invoice=db.createInvoice(user.id,{customerName:'Existing Customer',jobTitle:'Existing Work',amount:125});
    db.beginBillingPhone(user.id,'+14155550123','US');db.completeBillingPhone(user.id,'+14155550123','US');
    const started=Date.now()-10*86400000;db.beginTrialOnEntry(user.id,started);
    db.createSubscription(user.id,'sub_legacy',Math.floor(started/1000));
    db.updateSubscription('sub_legacy','active',Date.now()+5*86400000);
    const before=db.getUserById(user.id),subscription=db.getUserSubscription(user.id);
    db.close();db=null;
    const legacy=new Database(file);
    try{for(const column of columns)legacy.exec('ALTER TABLE users DROP COLUMN '+column);}finally{legacy.close();}
    for(let reopen=0;reopen<2;reopen++){
      db=openDb(file);
      const after=db.getUserById(user.id);
      for(const key of Object.keys(before).filter(key=>!columns.includes(key)))assert.deepEqual(after[key],before[key],key);
      assert.equal(db.businessProfileComplete(user.id),false);assert.equal(after.business_profile_completed_at,0);
      assert.deepEqual(db.getUserSubscription(user.id),subscription);
      assert.equal(db.getWorkspace(user.id).invoices[0].id,invoice.id);assert.equal(db.getWorkspace(user.id).invoices[0].total,125);
      db.close();db=null;
    }
    const check=new Database(file);
    try{assert.equal(check.pragma('integrity_check',{simple:true}),'ok');assert.deepEqual(check.pragma('foreign_key_check'),[]);}finally{check.close();}
  }finally{db?.close();rmSync(directory,{recursive:true,force:true});}
});

for(const via of ['callback','webhook'])test('first '+via+' authorization cannot bypass missing business setup',async()=>{
  const schedule=makeTrialSchedule(),cancelled=[];
  const t=await startServer({env:{WORKSPACE_ACCESS_MODE:'phone_and_mandate'},razorpay:{
    verifySubscription:()=>true,verifyWebhook:()=>true,
    getSubscription:async()=>({status:'authenticated',start_at:schedule.startAt,charge_at:schedule.startAt}),
    cancelSubscription:async id=>{cancelled.push(id);return {status:'cancelled'};}
  }});
  try{
    const b=t.browser();await signIn(t,b,{profile:ALICE});const csrf=await phone(t,b),uid=t.db.getUserByEmail(ALICE.email).id;
    t.db.createSubscription(uid,'sub_missing_business',schedule.startAt);
    const response=via==='callback'
      ?await b.req('/api/billing/subscription/verify',{method:'POST',csrf,json:{razorpay_subscription_id:'sub_missing_business',razorpay_payment_id:'pay_test',razorpay_signature:'test'}})
      :await b.req('/webhooks/razorpay',{method:'POST',headers:{'content-type':'application/json','x-razorpay-signature':'test'},body:JSON.stringify({event:'subscription.authenticated',payload:{subscription:{entity:{id:'sub_missing_business',status:'authenticated',start_at:schedule.startAt,charge_at:schedule.startAt}}}})});
    assert.equal(response.status,via==='callback'?409:200);
    assert.deepEqual(cancelled,['sub_missing_business']);assert.equal(t.db.getUserById(uid).onboarding_completed_at,0);
    assert.equal(t.db.getBillingIdentity(uid).mandate_authorized_at,0);assert.equal((await b.req('/api/workspace')).status,403);
  }finally{await t.close();}
});

test('gated users can sign out and cannot spoof completion with a profile patch',async()=>{
  const t=await startServer({env:{WORKSPACE_ACCESS_MODE:'phone'}});
  try{
    const b=t.browser();await signIn(t,b,{profile:ALICE});const csrf=await phone(t,b);
    const spoof=await b.req('/api/me',{method:'PATCH',csrf,json:{business_profile_completed_at:Date.now(),businessComplete:true,businessProfile:{complete:true}}});
    assert.equal(spoof.status,403);assert.equal(t.db.getUserByEmail(ALICE.email).business_profile_completed_at,0);
    assert.equal((await b.req('/api/logout',{method:'POST',csrf})).status,204);assert.equal((await b.me()).signedIn,false);
  }finally{await t.close();}
});

test('registered Indian setup feeds invoice tax snapshots and remains editable without resetting history',async()=>{
  const t=await startServer({env:{WORKSPACE_ACCESS_MODE:'phone'}});
  try{
    const b=t.browser();await signIn(t,b,{profile:ALICE});const csrf=await phone(t,b,'IN'),uid=t.db.getUserByEmail(ALICE.email).id;
    const initial={...businessDetails('IN'),gstRegistration:'registered',gstin:'33ABCDE1234F1Z5'};
    assert.equal((await b.req('/api/business/profile',{method:'POST',csrf,json:initial})).status,200);
    const made=await b.req('/api/invoices',{method:'POST',csrf,json:{customerName:'Customer',jobTitle:'Service',amount:100,gstRate:18,placeOfSupply:'33',hsnSac:'9987'}});
    assert.equal(made.status,201,await made.clone().text());
    const before=t.db.getWorkspace(uid),deadline=t.db.getUserById(uid).trial_ends_at;
    assert.equal(before.invoices[0].supplierGstin,'33ABCDE1234F1Z5');assert.equal(before.invoices[0].total,118);
    assert.equal((await b.req('/api/me',{method:'PATCH',csrf,json:{gstin:''}})).status,200);
    assert.equal(t.db.getBusinessProfile(uid).gstRegistration,'not_registered');assert.equal(t.db.businessProfileComplete(uid),true);
    assert.equal(t.db.getWorkspace(uid).invoices[0].supplierGstin,'33ABCDE1234F1Z5');assert.equal(t.db.getUserById(uid).trial_ends_at,deadline);
    assert.equal((await b.req('/api/me',{method:'DELETE',csrf})).status,200);assert.equal(t.db.getUserById(uid),null);
  }finally{await t.close();}
});
