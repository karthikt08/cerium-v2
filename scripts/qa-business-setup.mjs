// Browser regression checks: install Playwright and its Chromium browser, then run this script.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {startServer} from '../test/helpers.js';
import {businessDetails} from '../test/business-fixtures.js';
const require=createRequire(import.meta.url),{chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright':'playwright');
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-zygote','--use-gl=disabled'],headless:true});
const t=await startServer({env:{WORKSPACE_ACCESS_MODE:'phone'}});const results={},page=await browser.newPage();
await page.route('**/onboarding-harness',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><main id="root"></main>'}));
async function mount(step='basics'){
 await page.goto(t.url+'/onboarding-harness');
 await page.evaluate(async({draft,step})=>{
  const {mountBusinessSetup}=await import('/js/business-setup-ui.js');
  window.data={step,country:'US',draft,complete:false,revision:'review-1'};
  window.calls={save:0,complete:0,enter:0};window.failEnter=false;
  window.widget=mountBusinessSetup(document.getElementById('root'),{api:{
   saveBusinessSetupStep:async()=>{calls.save++;return new Promise(resolve=>{window.finishSave=()=>resolve({...data,step:'address'});});},
   completeBusinessSetup:async()=>{calls.complete++;return {ok:true};}
  },onComplete:async()=>{calls.enter++;if(window.failEnter)throw new Error('Temporary connection failure');}});
  widget.show(data);
 },{draft:businessDetails('US'),step});
}
try{
 await mount();await page.locator('#business-submit').click();
 results.controlsLockedWhileSaving=await page.locator('#biz-name').isDisabled();
 results.modulesLockedWhileSaving=await page.locator('#biz-module-grid input').first().isDisabled();
 await page.evaluate(()=>finishSave());
 await mount('review');await page.evaluate(()=>{window.failEnter=true;});await page.locator('#biz-confirm').check();await page.locator('#business-submit').click();
 await page.locator('#business-errors').waitFor({state:'visible'});
 await page.evaluate(()=>{window.failEnter=false;});await page.locator('#business-submit').click();
 results.retryCompletionCalls=await page.evaluate(()=>calls.complete);results.retryEntryCalls=await page.evaluate(()=>calls.enter);
 await mount();await page.evaluate(()=>widget.show({...data,draft:{...data.draft,businessName:'Changed in another tab'}}));
 results.refreshedName=await page.locator('#biz-name').inputValue();
 await mount('review');await page.locator('#biz-confirm').check();await page.evaluate(()=>widget.show({...data,draft:{...data.draft,businessName:'New review'}}));
 results.freshReviewUnchecked=!(await page.locator('#biz-confirm').isChecked());

 async function ownerPage(country,phone,width=1280){
  const context=await browser.newContext({viewport:{width,height:1100},reducedMotion:'reduce'});
  const email=country.toLowerCase()+'-onboarding@example.com';
  const registered=await context.request.post(t.url+'/auth/register',{headers:{Origin:t.base},data:{email,name:'Setup Owner',password:'BrowserTest123!'}});
  assert.equal(registered.status(),201);
  const user=t.db.getUserByEmail(email);
  if(phone){t.db.beginBillingPhone(user.id,phone,country);assert.equal(t.db.completeBillingPhone(user.id,phone,country),true);}
  const p=await context.newPage();await p.goto(t.url+'/verify.html');
  await p.locator(phone?'#biz-contact':'#phone').waitFor({state:'visible'});
  return {p,context,user};
 }
 async function fillBusiness(p,country,connected=true){
  const d=businessDetails(country);
  await p.locator('#biz-contact').fill(d.name);await p.locator('#biz-name').fill(d.businessName);
  await p.locator('#biz-email').fill(d.businessEmail);await p.locator('#biz-trade').fill(d.trade);
  await p.locator('#business-submit').click();await p.locator('[data-business-step="address"]').waitFor({state:'visible'});
  await p.reload();await p.locator('[data-business-step="address"]').waitFor({state:'visible'});
  await p.locator('#biz-address').fill(d.businessAddress);await p.locator('#biz-city').fill(d.businessCity);
  if(country==='US')await p.locator('#biz-us-state').selectOption('CA');
  if(country==='IN')await p.locator('#biz-india-state').selectOption('33');
  await p.locator('#biz-postal').fill(d.businessPostalCode);await p.locator('#biz-time-zone').selectOption(d.timeZone);
  await p.locator('#business-submit').click();
  if(country==='IN'){
   await p.locator('[data-business-step="tax"]').waitFor({state:'visible'});
   await p.locator('#biz-gst-registration').selectOption('registered');await p.locator('#business-submit').click();
   assert.equal(await p.locator('[data-business-step="tax"]').isVisible(),true);
   await p.locator('#biz-gstin').fill('29ABCDE1234F1Z5');await p.locator('#business-submit').click();
   await p.locator('#business-errors').waitFor({state:'visible'});
   assert.equal(await p.locator('#biz-gstin').getAttribute('aria-invalid'),'true');
   assert.equal(await p.locator('#biz-gstin').evaluate(n=>n===document.activeElement),true);
   await p.locator('#biz-gstin').fill('33ABCDE1234F1Z5');await p.locator('#business-submit').click();
  }
  await p.locator('[data-business-step="review"]').waitFor({state:'visible'});
  await p.locator('#business-submit').click();assert.equal(await p.locator('#biz-confirm').isChecked(),false);
  if(connected)assert.equal((await p.request.get(t.url+'/api/workspace')).status(),403);
 }
 // Exercise a real national-format phone, OTP, resumed wizard and failed handoff.
 const us=await ownerPage('US');
 await us.p.locator('#phone').fill('4155550123');await us.p.locator('#country-confirm').check();
 await us.p.locator('#start-form button[type="submit"]').click();await us.p.locator('#code').fill('000000');
 await us.p.locator('#code-form button[type="submit"]').click();await us.p.locator('#biz-contact').waitFor({state:'visible'});
 await fillBusiness(us.p,'US');let failSession=false,completionRequests=0;
 await us.p.route('**/api/business/setup/complete',async route=>{completionRequests++;const response=await route.fetch();failSession=true;await route.fulfill({response});});
 await us.p.route('**/api/me',async route=>{if(failSession){failSession=false;await route.fulfill({status:503,json:{error:'temporary_outage'}});}else await route.continue();});
 await us.p.locator('#biz-confirm').check();await us.p.locator('#business-submit').click();
 await us.p.locator('#business-errors').waitFor({state:'visible'});
 assert.match(us.p.url(),/verify.html/);assert.equal(await us.p.locator('#setup-retry').isVisible(),true);
 await us.p.locator('#business-submit').click();await us.p.waitForURL('**/app.html');assert.equal(completionRequests,1);
 assert.equal(t.db.businessProfileComplete(us.user.id),true);results.nationalPhoneAndHandoffRecovery=true;await us.context.close();
 const india=await ownerPage('IN','+919876543210',390);await fillBusiness(india.p,'IN');
 assert.equal(await india.p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await india.p.locator('#biz-confirm').check();await india.p.locator('#business-submit').click();await india.p.waitForURL('**/app.html');
 assert.equal(t.db.getBusinessProfile(india.user.id).gstin,'33ABCDE1234F1Z5');results.indiaMobileTaxValidation=true;await india.context.close();
 const france=await ownerPage('FR','+33612345678',320);await fillBusiness(france.p,'FR');
 const stale=await france.context.newPage();await stale.goto(t.url+'/verify.html');await stale.locator('#biz-confirm').check();
 await france.p.locator('#business-previous').click();await france.p.locator('#business-previous').click();
 await france.p.locator('#biz-name').fill('Entreprise révisée');await france.p.locator('#business-submit').click();
 await france.p.locator('[data-business-step="address"]').waitFor({state:'visible'});await france.p.locator('#business-submit').click();
 await france.p.locator('[data-business-step="review"]').waitFor({state:'visible'});
 await stale.locator('#business-submit').click();await stale.locator('#business-errors').waitFor({state:'visible'});
 assert.equal(await stale.locator('#biz-confirm').isChecked(),false);assert.match(await stale.locator('#business-review').textContent(),/Entreprise révisée/);
 assert.equal(t.db.businessProfileComplete(france.user.id),false);
 await stale.locator('#biz-confirm').check();await stale.locator('#business-submit').click();await stale.waitForURL('**/app.html');
 assert.equal(t.db.getBusinessProfile(france.user.id).businessName,'Entreprise révisée');results.staleTabReviewRecovery=true;await france.context.close();
 const retry=await ownerPage('GB','+447400123456');let failSetup=true;
 await retry.p.route('**/api/business/setup',async route=>{if(failSetup){failSetup=false;await route.fulfill({status:503,json:{message:'Temporary outage'}});}else await route.continue();});
 await retry.p.reload();await retry.p.locator('#setup-retry').waitFor({state:'visible'});
 await retry.p.locator('#setup-retry').click();await retry.p.locator('#biz-contact').waitFor({state:'visible'});
 results.initialSetupRetry=true;
 await fillBusiness(retry.p,'GB');let dropResponse=true;
 await retry.p.route('**/api/business/setup/complete',async route=>{
  if(dropResponse){dropResponse=false;await route.fetch();await route.abort();}else await route.continue();
 });
 await retry.p.locator('#biz-confirm').check();await retry.p.locator('#business-submit').click();
 await retry.p.locator('#business-errors').waitFor({state:'visible'});const deadline=t.db.getUserById(retry.user.id).trial_ends_at;
 await retry.p.locator('#business-submit').click();await retry.p.getByRole('button',{name:'Continue to next step',exact:true}).waitFor();
 await retry.p.locator('#business-submit').click();await retry.p.waitForURL('**/app.html');
 assert.equal(t.db.getUserById(retry.user.id).trial_ends_at,deadline);results.lostCompletionResponseRecovery=true;
 await retry.context.close();
 const temporary=mkdtempSync(join(tmpdir(),'cerium-onboarding-browser-'));
 try{
  const preview=join(temporary,'preview.html');execFileSync(process.execPath,[fileURLToPath(new URL('./build-preview.mjs',import.meta.url)),preview]);
  const context=await browser.newContext({viewport:{width:390,height:1100},reducedMotion:'reduce'}),offline=await context.newPage();
  await offline.goto(pathToFileURL(preview).href);await fillBusiness(offline,'US',false);
  await offline.locator('#biz-confirm').check();await offline.locator('#business-submit').click();await offline.locator('#workspace').waitFor({state:'visible'});
  await offline.reload();await offline.locator('#workspace').waitFor({state:'visible'});
  results.offlinePreviewResumeAndCompletion=true;await context.close();
 }finally{rmSync(temporary,{recursive:true,force:true});}
 console.log(JSON.stringify(results,null,2));
 {
  assert.equal(results.controlsLockedWhileSaving,true);assert.equal(results.modulesLockedWhileSaving,true);
  assert.equal(results.retryCompletionCalls,1);assert.equal(results.retryEntryCalls,2);
  assert.equal(results.refreshedName,'Changed in another tab');assert.equal(results.freshReviewUnchecked,true);
 }
}finally{await browser.close();await t.close();}
