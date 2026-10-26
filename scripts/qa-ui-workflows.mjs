// Exercises actual controls against disposable accounts, never production data.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {startServer} from '../test/helpers.js';
import {completeBusiness} from '../test/business-fixtures.js';
import {SECTIONS} from '../public/js/workspace-model.js';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright':'playwright');
const out=process.env.UI_AUDIT_OUTPUT||'output/ui-workflows';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote','--use-gl=disabled']});
const t=await startServer({env:{WORKSPACE_ACCESS_MODE:'phone'}}),results=[];
const context=await browser.newContext({viewport:{width:1440,height:1000}});
await context.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
const page=await context.newPage();page.setDefaultTimeout(7000);
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
async function check(name,fn){
 try{await fn();results.push({name,pass:true});console.log('PASS',name);}
 catch(e){results.push({name,pass:false,error:e.message});console.log('FAIL',name,e.message);await page.screenshot({path:join(out,'failure-'+results.length+'.png')});await page.keyboard.press('Escape').catch(()=>{});}
}
async function nav(section){await page.goto(t.url+'/app.html#'+section);await page.locator('#page-body').waitFor({state:'visible'});await page.waitForFunction(title=>document.querySelector('#current-section')?.textContent===title,SECTIONS[section][0]);await page.locator('#cerium-entry-scene').waitFor({state:'hidden'});}
async function record(kind,values){await page.locator('[data-action="new"][data-kind="'+kind+'"]').first().click();for(const [name,value] of Object.entries(values))await page.locator('#record-form [name="'+name+'"]').fill(value);await page.locator('#record-submit').click();await page.locator('#record-dialog').waitFor({state:'hidden'});}
async function ws(){return (await context.request.get(t.url+'/api/workspace')).json();}
async function createOwner(country='US'){
 const b=t.browser(),email='ui-'+country.toLowerCase()+'@example.com';
 await b.req('/auth/register',{method:'POST',json:{name:'UI Owner',email,password:'BrowserTest123!'}});
 const user=t.db.getUserByEmail(email),phone=country==='IN'?'+919876543210':'+14155550123';
 t.db.beginBillingPhone(user.id,phone,country);t.db.completeBillingPhone(user.id,phone,country);await completeBusiness(t,b,country);
 t.db.saveWorkspacePreferences(user.id,{category:'construction',modules:['leads','jobs','quotes','followups','invoices','payments','reviews','reminders']});
 await page.goto('about:blank');await context.clearCookies();await context.addCookies([...b.jar].map(([name,value])=>({name,value,url:t.url})));return user;
}
try{
 await check('Nested 404 keeps styles, scripts and return-home link',async()=>{
  const failures=[];const listener=r=>{if(r.url().startsWith(t.url)&&r.status()>=400&&['stylesheet','script','image'].includes(r.request().resourceType()))failures.push(r.url());};page.on('response',listener);
  await page.goto(t.url+'/missing/nested/page');await page.waitForTimeout(100);page.off('response',listener);
  assert.deepEqual(failures,[]);await page.getByRole('link',{name:'Return to Home Page'}).click();assert.equal(new URL(page.url()).pathname,'/');
 });
 await check('Login failure restores the sign-in button',async()=>{
  await page.goto(t.url+'/login.html');await page.locator('#email').fill('missing@example.com');await page.locator('#password').fill('WrongTest123!');
  await page.locator('#login-form button[type=submit]').click();await page.locator('#msg.err').waitFor();assert.equal(await page.locator('#login-form button[type=submit]').isEnabled(),true);
 });
 await check('Signup, missing-token recovery, password reset and login',async()=>{
  await page.goto(t.url+'/signup.html');await page.locator('#name').fill('Registration Test');await page.locator('#email').fill('registration@example.com');await page.locator('#password').fill('BrowserTest123!');
  await page.locator('#signup-form button[type=submit]').click();await page.waitForURL('**/verify.html**');
  await page.goto('about:blank');await context.clearCookies();await page.goto(t.url+'/reset-password.html');assert.equal(await page.locator('#reset-form button').isDisabled(),true);
  await page.goto(t.url+'/forgot-password.html');await page.locator('#email').fill('registration@example.com');await page.locator('#forgot-form button').click();await page.locator('#dev-reset-link a').click();
  await page.locator('#password').fill('ChangedTest123!');await page.locator('#confirm-password').fill('WrongTest123!');await page.locator('#reset-form button').click();assert.match(await page.locator('#msg').textContent(),/do not match/);
  await page.locator('#confirm-password').fill('ChangedTest123!');await page.locator('#reset-form button').click();await page.waitForURL('**/login.html?reset=1');
  await page.locator('#email').fill('registration@example.com');await page.locator('#password').fill('ChangedTest123!');await page.locator('#login-form button[type=submit]').click();await page.waitForURL('**/welcome.html**');
 });
 await createOwner();
 await check('Record defaults follow the business date across device time zones',async()=>{
  await page.clock.setFixedTime(new Date('2026-10-27T01:30:00Z'));
  for(const [section,kind,name] of [['leads','lead','nextFollowUp'],['followups','followup','dueDate'],['invoices','invoice','supplyDate']]){
   await nav(section);await page.locator('[data-action=new][data-kind='+kind+']').first().click();
   assert.equal(await page.locator('#record-form [name='+name+']').inputValue(),'2026-10-26');await page.keyboard.press('Escape');
  }
  await page.clock.setFixedTime(new Date());
 });
 await check('Lead create, search, edit, board and follow-up completion',async()=>{
  await nav('leads');await record('lead',{name:'Browser Customer',email:'customer@example.com',value:'250'});
  await page.locator('[data-filter=query]').fill('Browser Customer');await page.getByRole('button',{name:'Edit Browser Customer',exact:true}).click();
  await page.locator('#record-form [name=notes]').fill('Saved through real browser controls');await page.locator('#record-submit').click();await page.locator('#record-dialog').waitFor({state:'hidden'});
  await page.locator('[data-action=lead-view][data-view=board]').click();assert.match(await page.locator('.board').textContent(),/Browser Customer/);
  await nav('followups');await page.locator('[data-action=toggle-followup]').first().click();await page.locator('[data-filter=status]').selectOption('Done');await page.getByRole('button',{name:'Done',exact:true}).waitFor();
  assert.equal((await ws()).leads[0].notes,'Saved through real browser controls');
 });
 await check('Record validation, failed save and retry preserve input',async()=>{
  await nav('leads');await page.locator('[data-action=new]').first().click();await page.locator('#record-submit').click();assert.equal(await page.locator('#record-dialog').isVisible(),true);
  await page.locator('#record-form [name=name]').fill('Retry Customer');let fail=true;
  await page.route('**/api/leads',r=>r.request().method()==='POST'&&fail?(fail=false,r.fulfill({status:503,json:{message:'Temporary test outage'}})):r.continue());
  await page.locator('#record-submit').click();await page.locator('#record-error').waitFor({state:'visible'});assert.equal(await page.locator('#record-form [name=name]').inputValue(),'Retry Customer');
  assert.equal(await page.locator('#record-submit').isEnabled(),true);await page.locator('#record-submit').click();await page.locator('#record-dialog').waitFor({state:'hidden'});await page.unroute('**/api/leads');
 });
 await check('Modal cursor, text editing and accessible fallback',async()=>{
  await nav('leads');await page.locator('[data-action=new]').first().click();await page.locator('#record-submit').hover();await page.waitForTimeout(120);
  assert.equal(await page.locator('#record-dialog > .workspace-cursor.visible').count(),1);
  await page.locator('#record-form [name=name]').hover();assert.equal(await page.locator('#record-form [name=name]').evaluate(e=>getComputedStyle(e).cursor),'text');
  await page.emulateMedia({reducedMotion:'reduce'});await page.mouse.move(5,5);await page.waitForTimeout(50);
  assert.notEqual(await page.locator('#record-dialog').evaluate(e=>getComputedStyle(e,'::backdrop').cursor),'none');
  await page.emulateMedia({reducedMotion:'no-preference',forcedColors:'active'});await page.mouse.move(10,10);
  assert.equal(await page.locator('html').evaluate(e=>e.classList.contains('has-workspace-cursor')),false);
  await page.keyboard.press('Escape');await page.emulateMedia({forcedColors:'none'});
 });
 await check('CSV preview, import and duplicate prevention',async()=>{
  await nav('leads');await page.locator('[data-action=import-leads]').click();
  const file={name:'customers.csv',mimeType:'text/csv',buffer:Buffer.from('Name,Email,Phone\nImported Customer,imported@example.com,4155550199\n')};
  await page.locator('#lead-import-file').setInputFiles(file);await page.getByRole('button',{name:'Import 1 lead',exact:true}).waitFor();await page.locator('#lead-import-submit').click();await page.locator('#lead-import-dialog').waitFor({state:'hidden'});
  assert.ok((await ws()).leads.some(l=>l.name==='Imported Customer'));await page.locator('[data-action=import-leads]').click();await page.locator('#lead-import-file').setInputFiles(file);await page.getByRole('button',{name:'Import 0 leads',exact:true}).waitFor();assert.equal(await page.locator('#lead-import-submit').isDisabled(),true);await page.locator('#lead-import-cancel').click();
 });
 await check('Estimate create, line items and customer approval page',async()=>{
  await nav('quotes');await page.locator('[data-quote-action=new]').first().click();
  await page.locator('[data-quote-form] [name=customerName]').fill('Estimate Customer');await page.locator('[data-quote-form] [name=title]').fill('Service estimate');
  await page.locator('[data-quote-field=description]').fill('Labor');await page.locator('[data-quote-field=rate]').fill('150');
  await page.locator('[data-quote-action=add-item]').click();await page.locator('[data-quote-field=description]').nth(1).fill('Parts');await page.locator('[data-quote-field=rate]').nth(1).fill('25');await page.locator('[data-quote-form] [type=submit]').click();await page.locator('.quotes-dialog').waitFor({state:'hidden'});
  await page.locator('[data-quote-action=share]').first().click();await page.locator('#cerium-share-url').waitFor();const url=await page.locator('#cerium-share-url').inputValue();
  const customer=await context.newPage();try{await customer.goto(url);assert.match(await customer.locator('body').textContent(),/175/);await customer.screenshot({path:join(out,'customer-estimate.png')});await customer.getByRole('button',{name:'Accept estimate',exact:true}).click();await customer.getByRole('heading',{name:'Estimate accepted'}).waitFor();}finally{await customer.close();}await page.keyboard.press('Escape');
  await page.locator('[data-action=refresh]').click();await page.locator('[data-quote-action=convert]').first().click();await page.locator('[data-quote-form=convert] [type=submit]').click();await page.waitForURL('**#jobs');assert.ok((await ws()).jobs.some(j=>j.title==='Service estimate'));
 });
 await check('Crew, scheduled job, completion and automatic invoice',async()=>{
  await nav('jobs');await page.locator('[data-job-action=crew]').first().click();await page.locator('[data-job-form=crew] [name=name]').fill('Test Technician');await page.locator('[data-job-form=crew] [type=submit]').click();await page.getByText('Test Technician',{exact:true}).first().waitFor();await page.locator('[data-job-action=close]').last().click();
  await page.locator('[data-job-action=new]').first().click();await page.locator('[data-job-form=job] [name=title]').fill('Browser service job');await page.locator('[data-job-form=job] [name=customerName]').fill('Job Customer');
  await page.locator('[data-job-form=job] [name=status]').selectOption('Completed');await page.locator('[data-job-form=job] [type=submit]').click();await page.locator('#cerium-job-dialog').waitFor({state:'hidden'});
  const data=await ws();assert.ok(data.jobs.some(j=>j.title==='Browser service job'&&j.status==='Completed'));assert.ok(data.invoices.some(i=>i.jobTitle==='Browser service job'));
 });
 await check('Invoice create, preview, print window and paid status',async()=>{
  await nav('invoices');await record('invoice',{customerName:'Invoice Customer',customerEmail:'invoice@example.com',jobTitle:'Invoice service',amount:'125'});
  const invoice=(await ws()).invoices.find(i=>i.customerName==='Invoice Customer');
  await page.locator('[data-action=preview-invoice][data-id="'+invoice.id+'"]').click();assert.match(await page.locator('#invoice-sheet').textContent(),/125/);
  const popupPromise=context.waitForEvent('page');await page.locator('[data-action=print-invoice]').click();const popup=await popupPromise;await popup.waitForLoadState();assert.match(await popup.locator('body').textContent(),/Invoice Customer/);await popup.close();await page.keyboard.press('Escape');
  const saved=page.waitForResponse(r=>r.url().includes('/api/invoices/')&&r.request().method()==='PATCH');await page.locator('[data-invoice-status="'+invoice.id+'"]').selectOption('Paid');assert.equal((await saved).ok(),true);await page.getByText('Invoice status updated.',{exact:true}).waitFor();await nav('payments');assert.match(await page.locator('#page-body').textContent(),/Invoice Customer/);
 });
 await check('Payment reminder schedule and cancel',async()=>{
  await nav('invoices');await record('invoice',{customerName:'Reminder Customer',customerEmail:'reminder@example.com',jobTitle:'Reminder service',amount:'90'});
  const invoice=(await ws()).invoices.find(i=>i.customerName==='Reminder Customer');await page.locator('[data-invoice-status="'+invoice.id+'"]').selectOption('Sent');
  await nav('reminders');await page.locator('#reminder-form [name=invoiceId]').selectOption(invoice.id);await page.locator('#reminder-form [name=consentConfirmed]').check();await page.locator('#reminder-form [name=approved]').check();await page.locator('#reminder-form [type=submit]').click();await page.locator('[data-reminder-cancel]').waitFor();await page.locator('[data-reminder-cancel]').click();await page.locator('.reminder-status').filter({hasText:'Cancelled'}).waitFor();
 });
 await check('Review log, requested and received actions',async()=>{
  await nav('reviews');await record('review',{customerName:'Review Customer',jobTitle:'Review service'});
  await page.locator('[data-action=review-received]').first().waitFor();await page.locator('[data-action=review-received]').first().click();await page.getByText('Review marked as received.',{exact:true}).waitFor();assert.ok((await ws()).reviews.some(r=>r.customerName==='Review Customer'&&r.status==='Reviewed'));
 });
 await check('Marketing tabs, keyboard navigation and edited draft retention',async()=>{
  await nav('marketing');await page.locator('[data-marketing-draft]').fill('My reviewed draft');await page.locator('#marketing-tab-visibility').focus();await page.keyboard.press('End');assert.equal(await page.locator('#marketing-tab-performance').getAttribute('aria-selected'),'true');await page.keyboard.press('Home');assert.equal(await page.locator('[data-marketing-draft]').inputValue(),'My reviewed draft');
  await page.locator('[data-marketing-service]').fill('repair work');await page.locator('[data-marketing-generate]').click();assert.match(await page.locator('[data-marketing-draft]').inputValue(),/repair work/);
 });
 await check('Assistant answer, page link and close control',async()=>{
  await nav('overview');await page.locator('#guide-trigger').click();await page.locator('#guide-question').fill('How do I import an Excel spreadsheet?');await page.locator('#guide-send').click();await page.locator('#guide-messages a[href*="leads"]').first().waitFor();await page.locator('#guide-messages a[href*="leads"]').first().click();assert.match(page.url(),/#leads/);if(await page.locator('#guide-close').isVisible())await page.locator('#guide-close').click();assert.equal(await page.locator('#guide-trigger').getAttribute('aria-expanded'),'false');
 });
 await check('Settings save, tool customization, export and delete cancellation',async()=>{
  await nav('settings');await page.locator('#profile-form [name=businessName]').fill('Browser Tested Services');await page.locator('#profile-form [type=submit]').click();await page.getByText('Browser Tested Services',{exact:true}).first().waitFor();
  await page.locator('#workspace-open-customizer').click();await page.locator('#workspace-category').selectOption('plumbing');await page.locator('#workspace-save-modules').click();await page.locator('#workspace-customizer-dialog').waitFor({state:'hidden'});assert.equal((await ws()).account.workspacePreferences.category,'plumbing');
  const download=page.waitForEvent('download');await page.locator('[data-action=export]').click();assert.ok((await download).suggestedFilename().endsWith('.json'));
  await page.locator('[data-action=clear-data]').click();await page.locator('#confirm-dialog [data-action=close-dialog]').last().click();assert.ok((await ws()).leads.length>0);
 });
 await check('Mobile navigation, topbar fit and all menu routes',async()=>{
  await page.setViewportSize({width:320,height:800});await nav('reminders');
  assert.ok((await page.locator('#user-avatar').boundingBox()).x+31<=320);
  await page.locator('#menu-toggle').click();await page.locator('#sidebar .nav-link[data-nav=settings]').click();assert.match(page.url(),/#settings/);assert.equal(await page.locator('#menu-toggle').getAttribute('aria-expanded'),'false');
  await page.locator('#menu-toggle').click();await page.keyboard.press('Escape');assert.equal(await page.locator('#menu-toggle').getAttribute('aria-expanded'),'false');
 });
 await check('Desktop sidebar collapse persists without shrinking the mobile drawer',async()=>{
  await page.setViewportSize({width:1440,height:900});await nav('overview');await page.locator('#sidebar-collapse-toggle').click();
  await page.waitForFunction(()=>document.querySelector('#sidebar').getBoundingClientRect().width<80);
  assert.equal(await page.locator('#sidebar-collapse-toggle').getAttribute('aria-label'),'Expand sidebar');
  await page.reload();await page.locator('#page-body').waitFor({state:'visible'});await page.locator('#cerium-entry-scene').waitFor({state:'hidden'});assert.equal(await page.locator('#sidebar-collapse-toggle').getAttribute('aria-expanded'),'false');
  await page.setViewportSize({width:390,height:800});assert.equal(await page.locator('#sidebar-collapse-toggle').isVisible(),false);await page.locator('#menu-toggle').click();assert.ok((await page.locator('#sidebar').boundingBox()).width>200);await page.keyboard.press('Escape');
  await page.setViewportSize({width:1440,height:900});await page.locator('#sidebar-collapse-toggle').click();assert.equal(await page.locator('#sidebar-collapse-toggle').getAttribute('aria-expanded'),'true');
  await page.setViewportSize({width:320,height:800});
 });
 await check('India non-GST invoice and mobile dialog fit',async()=>{
  await createOwner('IN');await nav('invoices');await record('invoice',{customerName:'India Customer',jobTitle:'Non-GST service',amount:'500'});assert.ok((await ws()).invoices.some(i=>i.customerName==='India Customer'));
  await page.locator('[data-action=preview-invoice]').first().click();assert.match(await page.locator('#invoice-sheet').textContent(),/500/);assert.ok((await page.locator('#invoice-dialog').boundingBox()).width<=320);await page.screenshot({path:join(out,'india-invoice-mobile.png')});await page.keyboard.press('Escape');
 });
 await check('Expired trial keeps records readable and disables invoice creation',async()=>{
  const user=t.db.getUserByEmail('ui-in@example.com');t.db.setUserPlan(user.id,{plan:'expired',planStatus:'expired'});await page.reload();await page.locator('#page-body').waitFor({state:'visible'});
  await page.getByText('Your free trial has ended — read-only access',{exact:true}).waitFor();assert.equal(await page.locator('[data-action=new][data-kind=invoice]').isDisabled(),true);assert.match(await page.locator('#page-body').textContent(),/India Customer/);
 });
 await check('Contact form validates and prepares an email handoff',async()=>{
  await page.goto(t.url+'/contact.html');await page.locator('#cf button[type=submit]').click();assert.equal(await page.locator('#f-name').evaluate(e=>e.validity.valueMissing),true);
  await page.locator('#f-name').fill('Contact Test');await page.locator('#f-email').fill('contact@example.com');await page.locator('#f-msg').fill('Synthetic local UI test');await page.locator('#cf button[type=submit]').click();await page.locator('#fs').waitFor({state:'visible'});assert.match(await page.locator('#fs').textContent(),/email app should open/);
 });
 await check('Signed-in waitlist retry, join, export, delete cancellation and logout',async()=>{
  await page.route('**/api/me',r=>r.fulfill({status:503,contentType:'application/json',body:'{}'}));await page.goto(t.url+'/waitlist.html');await page.locator('#retry').waitFor();await page.unroute('**/api/me');await page.locator('#retry').click();
  await page.locator('#s-join').waitFor({state:'visible'});await page.locator('#j-biz').fill('Waitlist test');await page.locator('#j-go').click();await page.locator('#s-on').waitFor({state:'visible'});
  const download=page.waitForEvent('download');await page.getByRole('link',{name:'Download my data'}).click();assert.equal((await download).suggestedFilename(),'cerium-my-data.json');
  await page.locator('#del').click();await page.locator('#dlg-no').click();assert.equal(await page.locator('#dlg').isVisible(),false);await page.locator('#out').click();await page.waitForURL('**/index.html');assert.equal((await (await context.request.get(t.url+'/api/me')).json()).signedIn,false);
 });
 await check('No uncaught browser errors across workflows',async()=>assert.deepEqual(errors,[]));
}finally{writeFileSync(join(out,'workflows.json'),JSON.stringify(results,null,2));await browser.close();await t.close();if(results.some(r=>!r.pass))process.exitCode=1;}
