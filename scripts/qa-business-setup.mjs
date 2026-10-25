// Browser regression checks: install Playwright and its Chromium browser, then run this script.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {startServer} from '../test/helpers.js';
import {businessDetails} from '../test/business-fixtures.js';
const require=createRequire(import.meta.url),{chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright':'playwright');
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-zygote','--use-gl=disabled'],headless:true});
const t=await startServer();const results={},page=await browser.newPage();
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
 console.log(JSON.stringify(results,null,2));
 {
  assert.equal(results.controlsLockedWhileSaving,true);assert.equal(results.modulesLockedWhileSaving,true);
  assert.equal(results.retryCompletionCalls,1);assert.equal(results.retryEntryCalls,2);
  assert.equal(results.refreshedName,'Changed in another tab');assert.equal(results.freshReviewUnchecked,true);
 }
}finally{await browser.close();await t.close();}
