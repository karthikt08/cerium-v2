// Isolated end-to-end checks for the complete navigation tree and new workflows.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {startServer} from '../test/helpers.js';
import {completeBusiness} from '../test/business-fixtures.js';
import {WORKSPACE_FEATURES,resolveWorkspaceRoute} from '../public/js/workspace-registry.js';
import {subfeaturesFor,subviewHref} from '../public/js/workspace-subviews.js';
import {WORKSPACE_MODULES} from '../public/js/industry-workspaces.js';
const require=createRequire(import.meta.url),{chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright':'playwright');
const out=process.env.UI_AUDIT_OUTPUT||'output/workspace-capabilities';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const t=await startServer({env:{WORKSPACE_ACCESS_MODE:'phone'}}),context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
page.setDefaultTimeout(7000);
await context.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
const errors=[],results=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
const ws=async()=>(await context.request.get(t.url+'/api/workspace')).json();
const settle=async hash=>page.waitForFunction(h=>document.querySelector('#page-body')?.dataset.route===h,resolveWorkspaceRoute(hash).href);
async function open(hash){await page.evaluate(h=>{location.hash=h;},hash);await settle(hash);}
async function check(name,fn){try{await fn();results.push({name,pass:true});console.log('PASS',name);}catch(e){results.push({name,pass:false,error:e.message});console.error('FAIL',name,e.message);await page.screenshot({path:join(out,'failure-'+results.length+'.png')});await page.keyboard.press('Escape').catch(()=>{});}}
async function saved(test){await page.waitForFunction(test);}
try{
  const owner=t.browser();await owner.req('/auth/register',{method:'POST',json:{name:'Capability Owner',email:'capabilities@example.com',password:'BrowserTest123!'}});
  const user=t.db.getUserByEmail('capabilities@example.com');t.db.beginBillingPhone(user.id,'+14155550123','US');t.db.completeBillingPhone(user.id,'+14155550123','US');await completeBusiness(t,owner,'US');
  t.db.saveWorkspacePreferences(user.id,{category:'other',modules:WORKSPACE_MODULES.map(m=>m.id)});
  const crew=t.db.addCrew(user.id,{name:'Test Technician',role:'Service'});
  const job=t.db.createJob(user.id,{title:'Availability check',customerName:'Test Customer',startAt:'2026-11-10T09:00',endAt:'2026-11-10T10:00',status:'Scheduled'});
  const invoice=t.db.createInvoice(user.id,{customerName:'Ledger Customer',jobTitle:'Recorded work',amount:100,status:'Sent',issueDate:'2026-10-01',dueDate:'2026-10-10'});
  for(const stage of ['New','Quoted','Booked','Done'])t.db.createLead(user.id,{name:'Lead '+stage,stage,createReminder:false},{historical:true});
  t.db.createFollowUp(user.id,{contactName:'Overdue callback',task:'Call back',dueDate:'2026-01-01'});
  t.db.createFollowUp(user.id,{contactName:'Upcoming callback',task:'Call later',dueDate:'2027-01-01'});
  await context.addCookies([...owner.jar].map(([name,value])=>({name,value,url:t.url})));
  await page.goto(t.url+'/app.html#overview');await page.reload();await settle('#overview');await page.locator('#cerium-entry-scene').waitFor({state:'hidden'});
  await check('Every registered subview renders an active link and content without changing data',async()=>{
    const before=await ws();let count=0;
    for(const feature of WORKSPACE_FEATURES)for(const sub of subfeaturesFor(feature)){
      const href=subviewHref(feature,sub.id);await open(href);
      assert.equal(await page.locator('.workspace-subfeature-tab[aria-current=page]').count(),1,href);
      assert.equal(await page.locator('.workspace-subfeature-tab[aria-current=page]').getAttribute('href'),href);
      assert.equal(await page.locator('.workspace-feature-tab[aria-selected=true]').getAttribute('data-feature'),feature.id);
      assert.ok(await page.locator('.workspace-feature-content h1:visible').count(),href+' has a visible heading');
      assert.ok((await page.locator('.workspace-feature-content').innerText()).trim().length>30,href+' has content');
      const ids=await page.locator('[id]').evaluateAll(nodes=>nodes.map(n=>n.id));assert.equal(new Set(ids).size,ids.length,href+' duplicate IDs');count++;
    }
    assert.deepEqual(await ws(),before,'Viewing routes must not write records');console.log('Checked subviews:',count);
  });
  await check('Lead and follow-up subviews filter actual records and retain history',async()=>{
    await open('#customers/leads/active');assert.equal(await page.locator('#results tbody tr').count(),2);
    await page.locator('[data-subfeature=board]').click();await settle('#customers/leads/board');assert.equal(await page.locator('.lead-card').count(),4);
    await page.goBack();await settle('#customers/leads/active');assert.equal(await page.locator('#results tbody tr').count(),2);
    await open('#customers/followups/Due');assert.equal(await page.locator('#results tbody tr').count(),1);await page.getByText('Overdue callback',{exact:true}).waitFor();
    await page.locator('[data-subfeature=Upcoming]').click();await page.getByText('Upcoming callback',{exact:true}).waitFor();
  });
  await check('Availability and dispatch planning save a reviewed assignment',async()=>{
    await open('#team/availability/windows');const f=page.locator('[data-operation-form]');
    await f.locator('[name=workerId]').selectOption(crew.id);await f.locator('[name=startAt]').fill('2026-11-10T08:00');await f.locator('[name=endAt]').fill('2026-11-10T17:00');await f.locator('[name=type]').selectOption('Available');await f.locator('[type=submit]').click();
    await page.locator('[data-operation-edit]').waitFor();assert.equal((await ws()).operations.availability.length,1);
    await open('#field/dispatch-planning/candidates');await page.locator('[name=jobId]').selectOption(job.id);await page.locator('[data-dispatch-form] [type=submit]').click();await page.locator('[data-dispatch-assign]').click();
    await saved(()=>document.querySelector('#toast-region')?.textContent.includes('Assignment saved'));
    assert.equal((await ws()).jobs.find(j=>j.id===job.id).workerId,crew.id);
  });
  await check('Timesheet edits retain record identity across navigation and create no duplicate',async()=>{
    await open('#team/timesheets/records');const f=page.locator('[data-operation-form]');
    await f.locator('[name=workerId]').selectOption(crew.id);await f.locator('[name=startAt]').fill('2026-10-20T09:00');await f.locator('[name=endAt]').fill('2026-10-20T12:00');await f.locator('[name=breakMinutes]').fill('30');await f.locator('[type=submit]').click();await page.locator('[data-operation-edit]').waitFor();
    await page.locator('[data-operation-edit]').click();await f.locator('[name=notes]').fill('Edited shift retained');await open('#customers/leads/list');await open('#team/timesheets/records');
    assert.notEqual(await f.locator('[name=id]').inputValue(),'');assert.equal(await f.locator('[name=notes]').inputValue(),'Edited shift retained');
    await f.locator('[type=submit]').click();await page.getByText('Edited shift retained',{exact:true}).waitFor();assert.equal((await ws()).operations.timesheets.length,1);
    assert.match(await page.locator('[data-operation-kind] .notice').innerText(),/2\.50 recorded hours/);
  });
  await check('Saved reminder templates survive navigation without scheduling emails',async()=>{
    await open('#billing/reminders/templates');const f=page.locator('[data-operation-form]');
    await f.locator('[name=name]').fill('Gentle reminder');await f.locator('[name=subject]').fill('Invoice #{invoice}');await f.locator('[name=body]').fill('Hello {customer}, remaining {amount}.');await f.locator('[type=submit]').click();await page.locator('[data-operation-edit]').waitFor();
    await open('#billing/reminders/rules');assert.match(await page.locator('select[name=templateId]').innerText(),/Gentle reminder/);assert.equal((await ws()).reminders.length,0);
  });
  await check('Spreadsheet preview, mapping, import and custom-field views work end to end',async()=>{
    await open('#settings/migration/import');const f=page.locator('[data-migration-form]');await f.locator('[name=target]').selectOption('inventory');
    await f.locator('[name=file]').setInputFiles({name:'stock.csv',mimeType:'text/csv',buffer:Buffer.from('Stock report\nItem name,Product code,Stock,Color\nPump,P-1,4,Blue')});await f.locator('[type=submit]').click();
    await page.locator('[data-commit-migration]:enabled').waitFor();assert.equal((await ws()).operations.inventory.length,0);
    await page.locator('[data-mapping-name]').fill('Stock supplier');await page.locator('[data-save-mapping]').click();
    await page.waitForFunction(()=>document.body.textContent.includes('Mapping saved.'));
    await page.locator('[data-commit-migration]').click();await page.waitForFunction(()=>document.body.textContent.includes('1 records imported.'));
    assert.equal((await ws()).operations.inventory.length,1);await open('#settings/migration/mappings');await page.getByText('Stock supplier',{exact:true}).waitFor();
    await open('#settings/migration/fields');await page.locator('details summary').click();await page.getByText('Blue',{exact:true}).waitFor();
  });
  await check('Payment ledger records a partial payment and voids it with a retained reason',async()=>{
    await open('#billing/payments/ledger');const f=page.locator('[data-receipt-form]');await f.locator('[name=customerName]').fill('Ledger Customer');await f.locator('[name=amount]').fill('40');await f.locator('[name=paidAt]').fill('2026-10-20');await f.locator('[name=reference]').fill('QA-RECEIPT-1');await f.locator('[data-allocate-invoice="'+invoice.id+'"]').fill('40');await f.locator('[name=confirmed]').check();await f.locator('[type=submit]').click();await page.locator('.payment-receipt').waitFor();
    assert.equal((await ws()).invoices.find(i=>i.id===invoice.id).balance,60);
    await open('#billing/invoices/Sent');await page.locator('[data-action=preview-invoice][data-id="'+invoice.id+'"]').click();assert.match(await page.locator('#invoice-sheet').innerText(),/Balance due\s*USD 60/);await page.keyboard.press('Escape');
    await open('#billing/payments/ledger');await page.locator('.payment-receipt summary').click();const reversal=page.locator('[data-void-receipt]');await reversal.locator('[name=reason]').fill('Bank reversal verified');await reversal.locator('[name=confirmed]').check();await reversal.locator('[type=submit]').click();await page.getByText(/Voided/).first().waitFor();
    assert.equal((await ws()).invoices.find(i=>i.id===invoice.id).balance,100);assert.equal((await ws()).customerPayments[0].voidReason,'Bank reversal verified');
  });
  await check('Assistant guidance is user-triggered and opens the actual panel',async()=>{
    await open('#assistant/response-experience/progressive');await page.locator('[data-action=ask-guide]').click();await page.locator('#guide-panel').waitFor({state:'visible'});await page.locator('#guide-messages .guide-bubble:not(.user)').last().waitFor();await page.locator('#guide-close').click();
  });
  await check('Mobile subview keyboard navigation, scrolling and direct links stay inside the viewport',async()=>{
    await page.setViewportSize({width:320,height:820});await open('#billing/payments/ledger');await page.locator('.workspace-subfeature-tab[aria-current=page]').focus();await page.keyboard.press('End');await settle('#billing/payments/bank');
    assert.equal(await page.locator('[data-subfeature=bank]').evaluate(el=>el===document.activeElement),true);
    await page.keyboard.press('Home');await settle('#billing/payments/paid');await page.keyboard.press('ArrowRight');await settle('#billing/payments/ledger');
    const box=await page.locator('[data-subfeature=ledger]').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=321,JSON.stringify(box));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);console.log('Mobile geometry',JSON.stringify(await page.evaluate(()=>['#workspace-main','.page-width','.workspace-feature-panel'].map(sel=>{const e=document.querySelector(sel),r=e.getBoundingClientRect();return {sel,x:r.x,width:r.width,scrollLeft:e.scrollLeft,clientWidth:e.clientWidth,scrollWidth:e.scrollWidth};}))));await page.waitForFunction(()=>!document.querySelector('#toast-region .toast'));await page.screenshot({path:join(out,'payment-mobile.png')});
    for(const hash of ['#settings/migration/import','#team/timesheets/records','#field/dispatch-planning/candidates','#customers/leads/board']){await open(hash);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,hash);}
    await page.screenshot({path:join(out,'lead-board-mobile.png')});await page.setViewportSize({width:1440,height:1000});await open('#customers/leads/active');await page.screenshot({path:join(out,'lead-hierarchy-desktop.png')});
    await open('#team/availability/windows');await page.screenshot({path:join(out,'availability-desktop.png')});
  });
  await check('New mutation forms are read-only on expired plans',async()=>{
    t.db.setUserPlan(user.id,{plan:'expired',planStatus:'expired'});await page.reload();await settle('#team/availability/windows');assert.equal(await page.locator('[data-operation-form]').count(),0);
    await open('#billing/payments/ledger');assert.equal(await page.locator('[data-receipt-form]').count(),0);
    await open('#settings/migration/import');assert.equal(await page.locator('[data-migration-form] [type=submit]').isDisabled(),true);
  });
  await check('No uncaught browser errors',async()=>assert.deepEqual(errors,[]));
}finally{writeFileSync(join(out,'results.json'),JSON.stringify(results,null,2));await browser.close();await t.close();if(results.some(r=>!r.pass))process.exitCode=1;}
