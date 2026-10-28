// Navigation regression checks against isolated synthetic accounts.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {startServer} from '../test/helpers.js';
import {completeBusiness} from '../test/business-fixtures.js';
import {WORKSPACE_CATEGORIES,WORKSPACE_FEATURES,resolveWorkspaceRoute} from '../public/js/workspace-registry.js';
import {WORKSPACE_MODULES} from '../public/js/industry-workspaces.js';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright':'playwright');
const out=process.env.UI_AUDIT_OUTPUT||'output/workspace-navigation';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote','--use-gl=disabled']});
const t=await startServer({env:{WORKSPACE_ACCESS_MODE:'phone'}});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
await context.route('https://fonts.googleapis.com/**',route=>route.fulfill({contentType:'text/css',body:''}));
const page=await context.newPage();page.setDefaultTimeout(7000);
const results=[],errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('dialog',dialog=>dialog.accept());
async function check(name,fn){
  try{await fn();results.push({name,pass:true});console.log('PASS',name);}
  catch(e){results.push({name,pass:false,error:e.message});console.error('FAIL',name,e.message);await page.screenshot({path:join(out,'failure-'+results.length+'.png')});await page.keyboard.press('Escape').catch(()=>{});}
}
async function settled(hash){
  await page.waitForFunction(h=>document.querySelector('#page-body')?.dataset.route===h,resolveWorkspaceRoute(hash).href);
  await page.locator('#cerium-entry-scene').waitFor({state:'hidden'});
}
async function open(hash){await page.goto(t.url+'/app.html'+hash);await page.reload();await settled(hash);}
async function tab(id){await page.locator('#workspace-tab-'+id).click();await settled(page.url().split('#')[1]);}
async function workspace(){return (await context.request.get(t.url+'/api/workspace')).json();}
try{
  const owner=t.browser();
  await owner.req('/auth/register',{method:'POST',json:{name:'Navigation Owner',email:'navigation@example.com',password:'BrowserTest123!'}});
  const user=t.db.getUserByEmail('navigation@example.com');
  t.db.beginBillingPhone(user.id,'+14155550123','US');t.db.completeBillingPhone(user.id,'+14155550123','US');
  await completeBusiness(t,owner,'US');
  t.db.saveWorkspacePreferences(user.id,{category:'other',modules:WORKSPACE_MODULES.map(m=>m.id)});
  const identity=await owner.me();
  const seed=await owner.req('/api/leads',{method:'POST',csrf:identity.csrfToken,json:{name:'Preserved Customer',stage:'New',source:'Referral',notes:'Keep this record when hiding tools',createReminder:false}});
  assert.equal(seed.status,201);
  await context.addCookies([...owner.jar].map(([name,value])=>({name,value,url:t.url})));
  await open('#overview');
  await check('Feature groups expose the requested implemented tools',async()=>{
    const groups={
      customers:['Leads','Follow-ups','Estimates & Quotes'],
      field:['Job Schedule','Dispatch','Crew Assignments','Dispatch Planning'],
      billing:['Invoices','Payments','Payment Reminders','Custom Dues','Bank Matching','Expenses'],
      marketing:['Get Found','Re-engage','Reviews','Performance'],
      team:['Crew','Assignments','Availability','Attendance','Timesheets','Inventory'],
      insights:['Business Overview','Sales Insights','Revenue Insights'],
    };
    for(const [category,labels] of Object.entries(groups)){
      await page.locator('[data-category="'+category+'"]').click();
      await settled(page.url().split('#')[1]);
      const visibleLabels=await page.locator('.workspace-feature-tab:visible').evaluateAll(tabs=>tabs.map(tab=>
        tab.querySelector('.workspace-feature-label').textContent.trim()));
      assert.deepEqual(visibleLabels,labels);
    }
    await open('#field/schedule');
    assert.equal((await page.locator('#page-body h1').textContent()).trim(),'Job schedule');
    assert.equal(await page.getByRole('region',{name:'Weekly schedule',exact:true}).count(),1);
  });
  for(const category of WORKSPACE_CATEGORIES){
    await check(category.label+' category and every visible feature tab',async()=>{
      await page.locator('[data-category="'+category.id+'"]').click();
      const features=WORKSPACE_FEATURES.filter(f=>f.category===category.id);
      for(const feature of features){
        if(category.id!=='overview')await page.locator('#workspace-tab-'+feature.id).click();
        await settled(feature.href);
        if(await page.locator('#workspace-customizer-dialog[open]').count())await page.locator('#workspace-cancel-customizer').click();
        assert.equal(await page.locator('[data-category="'+category.id+'"]').getAttribute('aria-current'),'page');
        assert.ok(await page.locator('#page-body h1').count());
        if(category.id!=='overview'){
          assert.equal(await page.locator('[role=tab][aria-selected=true]:visible').count(),1);
          assert.equal(await page.locator('#workspace-feature-panel').getAttribute('aria-labelledby'),'workspace-tab-'+feature.id);
          assert.equal(await page.locator('#workspace-tab-'+feature.id).getAttribute('tabindex'),'0');
        }
      }
    });
  }
  await check('Back and forward restore feature tabs; categories remember the last tab',async()=>{
    await open('#customers/leads');await tab('followups');await tab('quotes');
    await page.goBack();await settled('#customers/followups');
    await page.goBack();await settled('#customers/leads');
    await page.goForward();await settled('#customers/followups');
    await page.locator('[data-category=settings]').click();await settled('#settings');
    await page.locator('[data-category=customers]').click();await settled('#customers/followups');
  });
  await check('Marketing drafts survive reviews, categories and back/forward',async()=>{
    await open('#marketing/visibility');await page.locator('[data-marketing-draft]').fill('Keep this unsent customer draft.');
    await tab('reviews');await page.locator('[data-category=customers]').click();await page.locator('[data-category=marketing]').click();await settled('#marketing/reviews');
    await tab('visibility');assert.equal(await page.locator('[data-marketing-draft]').inputValue(),'Keep this unsent customer draft.');
    await tab('performance');await page.goBack();await settled('#marketing/visibility');
    assert.equal(await page.locator('[data-marketing-draft]').inputValue(),'Keep this unsent customer draft.');
  });
  await check('Unsaved profile fields survive category navigation and clear after saving',async()=>{
    await open('#settings');const saved=(await workspace()).account.businessName;
    await page.locator('#profile-form [name=businessName]').fill('Unsaved Navigation Business');
    await page.locator('[data-category=customers]').click();await page.locator('[data-category=settings]').click();await settled('#settings');
    assert.equal(await page.locator('#profile-form [name=businessName]').inputValue(),'Unsaved Navigation Business');
    assert.equal((await workspace()).account.businessName,saved);
    await page.locator('#profile-form [type=submit]').click();await page.getByText('Business profile saved.',{exact:true}).waitFor();
    t.db.updateUser(user.id,{businessName:'Updated elsewhere'});
    await page.locator('[data-action=refresh]').click();await page.waitForFunction(()=>document.querySelector('#profile-form [name=businessName]')?.value==='Updated elsewhere');
  });
  await check('Support drafts survive tab navigation without sending messages',async()=>{
    await open('#support/support-requests');await page.locator('#support-form [name=subject]').fill('Unsent support draft');await page.locator('#support-form [name=body]').fill('Keep my draft text.');
    await page.locator('[data-category=billing]').click();await page.locator('[data-category=support]').click();await settled('#support/support-requests');
    assert.equal(await page.locator('#support-form [name=body]').inputValue(),'Keep my draft text.');assert.equal((await workspace()).messages.length,0);
  });
  await check('Browser navigation keeps open record and tool-customization editors intact',async()=>{
    await open('#overview');await page.locator('[data-category=customers]').click();await tab('leads');
    await page.locator('[data-action=new][data-kind=lead]').click();await page.locator('#record-form [name=name]').fill('Unsent lead draft');await page.goBack();
    assert.equal(await page.locator('#record-form [name=name]').inputValue(),'Unsent lead draft');assert.equal(await page.locator('#record-dialog').isVisible(),true);await page.keyboard.press('Escape');
    await page.locator('.workspace-category-heading [data-nav="settings/tools"]').click();await settled('#settings/tools');await page.locator('#workspace-work-description').fill('Keep my tool-selection draft');
    await page.goBack();assert.equal(await page.locator('#workspace-customizer-dialog').isVisible(),true);assert.equal(await page.locator('#workspace-work-description').inputValue(),'Keep my tool-selection draft');
    assert.equal(await page.locator('#workspace-customizer-dialog').count(),1);await page.locator('#workspace-cancel-customizer').click();
  });
  await check('Customization hides empty categories, preserves records and honors old bookmarks',async()=>{
    await open('#settings/tools');
    for(const input of await page.locator('input[name=modules]').all())await input.setChecked(await input.getAttribute('value')==='invoices');
    await page.locator('#workspace-save-modules').click();await page.locator('#workspace-customizer-dialog').waitFor({state:'hidden'});
    // Closing the editor precedes the async workspace refresh. Wait for its
    // visible result before checking navigation or using the next feature.
    for(const category of ['customers','field','team'])await page.locator('[data-category='+category+']').waitFor({state:'hidden'});
    await page.locator('[data-category=billing]').click();await settled('#billing/invoices');assert.equal(await page.locator('.workspace-feature-tab').count(),1);
    const before=(await workspace()).leads;
    await page.evaluate(()=>location.hash='#leads');await settled('#customers/leads');await page.getByText('Preserved Customer',{exact:true}).waitFor();assert.equal(await page.locator('.hidden-tool-notice').count(),1);
    const data=await workspace();assert.deepEqual(data.leads,before);assert.deepEqual(data.account.workspacePreferences.modules,['invoices']);
    await page.goto(t.url+'/app.html#customers');await page.reload();await settled('#overview');assert.equal(await page.locator('[data-category=customers]').isVisible(),false);
    await page.locator('.workspace-category-heading [data-nav="settings/tools"]').click();
    for(const input of await page.locator('input[name=modules]').all())await input.check();
    await page.locator('#workspace-save-modules').click();await page.locator('#workspace-customizer-dialog').waitFor({state:'hidden'});
    await page.locator('[data-category=team]').waitFor({state:'visible'});
  });
  await check('Ask Cerium opens canonical feature links inside their category',async()=>{
    await open('#overview');await page.locator('#guide-trigger').click();await page.locator('#guide-question').fill('Where do I manage leads?');await page.locator('#guide-send').click();
    const link=page.locator('#guide-messages a[href="#customers/leads"]').first();await link.waitFor();await link.click();await settled('#customers/leads');
    if(await page.locator('#guide-close').isVisible())await page.locator('#guide-close').click();
  });
  await check('Crew and assignment tabs reuse the existing scheduling and dispatch editors',async()=>{
    await open('#team/crew');await page.locator('[data-job-action=crew]').click();await page.locator('[data-job-form=crew] [name=name]').fill('Navigation Technician');await page.locator('[data-job-form=crew] [type=submit]').click();
    await page.getByText('Navigation Technician',{exact:true}).first().waitFor();await page.locator('#cerium-job-dialog [data-job-action=close]').last().click();
    const worker=(await workspace()).crew.find(c=>c.name==='Navigation Technician');
    await page.locator('[data-job-action=new]').click();await page.locator('[data-job-form=job] [name=title]').fill('Assigned navigation job');await page.locator('[data-job-form=job] [name=customerName]').fill('Assignment Customer');await page.locator('[data-job-form=job] [name=workerId]').selectOption(worker.id);await page.locator('[data-job-form=job] [type=submit]').click();await page.locator('#cerium-job-dialog').waitFor({state:'hidden'});
    await tab('assignments');await page.getByText('Assigned navigation job',{exact:true}).waitFor();
    await page.locator('[data-category=field]').click();await tab('dispatch');await page.locator('.operation-job').filter({hasText:'Assigned navigation job'}).getByRole('button',{name:'Details'}).click();await page.locator('[data-job-form=job] [name=status]').selectOption('Confirmed');await page.locator('[data-job-form=job] [type=submit]').click();await page.locator('#cerium-job-dialog').waitFor({state:'hidden'});
    const job=(await workspace()).jobs.find(j=>j.title==='Assigned navigation job');assert.equal(job.workerId,worker.id);assert.equal(job.status,'Confirmed');
  });
  await check('Bank Matching confirms recorded deposits and preserves the payment workflow',async()=>{
    const made=await owner.req('/api/invoices',{method:'POST',csrf:identity.csrfToken,json:{customerName:'Deposit Customer',jobTitle:'Deposit service',amount:10,status:'Sent',terms:'Net 15'}});assert.equal(made.status,201);const invoice=await made.json();
    const insert=t.db.rawDb.prepare('INSERT INTO bank_transactions(id,user_id,date,description,amount,type,status,suggested_invoice_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)');
    insert.run('nav-match',user.id,'2026-10-27','Recorded test deposit',10,'Deposit','pending_match',invoice.id,'2026-10-27');insert.run('nav-dismiss',user.id,'2026-10-27','Unrelated deposit',5,'Deposit','pending_match',null,'2026-10-27');
    await open('#billing/bank');await page.locator('[data-action=match-payment][data-id=nav-match]').click();await page.locator('#confirm-form [type=submit]').click();await page.locator('#confirm-dialog').waitFor({state:'hidden'});
    await page.locator('[data-action=dismiss-payment][data-id=nav-dismiss]').click();await page.waitForFunction(()=>!document.querySelector('[data-action=dismiss-payment][data-id=nav-dismiss]'));
    const data=await workspace();assert.equal(data.invoices.find(i=>i.id===invoice.id).status,'Paid');assert.equal(data.bankTransactions.find(x=>x.id==='nav-dismiss').status,'dismissed');
    await tab('payments');await page.getByText('Deposit Customer',{exact:true}).waitFor();
  });
  await check('Billing preserves historical invoice currencies and groups only recorded paid totals',async()=>{
    // Seed historical denominations directly in this isolated fixture. Normal
    // account validation correctly prevents relabeling existing financial data.
    for(const [customerName,amount,status,currency] of [
      ['Euro historical customer',21.5,'Paid','EUR'],
      ['Rupee historical customer',890.12,'Paid','INR'],
      ['Unpaid customer',99,'Sent','EUR'],
    ]){
      const invoice=t.db.createInvoice(user.id,{customerName,jobTitle:'Recorded service',amount,status,terms:'Net 15'});
      t.db.rawDb.prepare('UPDATE invoices SET invoice_currency=? WHERE id=? AND user_id=?').run(currency,invoice.id,user.id);
    }
    const before=(await workspace()).invoices;
    await open('#billing/invoices');
    for(const [name,amount] of [['Euro historical customer','EUR 21.50'],['Rupee historical customer','INR 890.12']]){
      assert.equal(await page.locator('tr').filter({hasText:name}).locator('.amount').first().textContent(),amount);
    }
    await tab('payments');
    const summary=await page.locator('.panel-subtitle').textContent();
    for(const amount of ['USD 10.00','EUR 21.50','INR 890.12'])assert.ok(summary.includes(amount),summary);
    assert.match(summary,/3 paid/);
    assert.equal(await page.locator('tbody tr').count(),3);
    assert.equal(await page.getByText('Unpaid customer',{exact:true}).count(),0);
    assert.equal(await page.locator('tr').filter({hasText:'Euro historical customer'}).locator('.amount').textContent(),'EUR 21.50');
    assert.equal(await page.locator('tr').filter({hasText:'Rupee historical customer'}).locator('.amount').textContent(),'INR 890.12');
    await open('#insights/revenue');
    assert.equal(await page.locator('tbody tr').count(),3);
    assert.deepEqual((await workspace()).invoices,before,'Viewing groups must not alter financial records');
  });
  await check('Mobile drawer, scrollable feature tabs and keyboard focus work at 320px',async()=>{
    await page.setViewportSize({width:320,height:800});await open('#overview');await page.locator('#menu-toggle').click();await page.locator('[data-category=billing]').click();
    assert.equal(await page.locator('#menu-toggle').getAttribute('aria-expanded'),'false');
    await page.locator('.workspace-feature-tab[aria-selected=true]').focus();await page.keyboard.press('End');await settled('#billing/expenses');
    assert.equal(await page.locator('#workspace-tab-expenses').evaluate(e=>document.activeElement===e),true);
    const bounds=await page.locator('#workspace-tab-expenses').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=321);
    await page.keyboard.press('Home');await settled('#billing/invoices');await page.keyboard.press('ArrowRight');await settled('#billing/payments');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    await page.screenshot({path:join(out,'billing-mobile.png')});
    await open('#insights/revenue');await page.waitForTimeout(80);const active=await page.locator('#workspace-tab-revenue').boundingBox();assert.ok(active.x>=0&&active.x+active.width<=321,'direct-linked active tab stays visible');
    await page.screenshot({path:join(out,'revenue-mobile.png')});
  });
  await check('Read-only plans retain category navigation and lock mutation controls',async()=>{
    t.db.setUserPlan(user.id,{plan:'expired',planStatus:'expired'});await open('#billing/invoices');
    assert.equal(await page.locator('[data-action=new][data-kind=invoice]').isDisabled(),true);
    await page.evaluate(()=>location.hash='#team/assignments');await settled('#team/assignments');assert.equal(await page.locator('[data-job-action=new]').isDisabled(),true);
  });
  await check('No duplicate DOM IDs or uncaught browser errors',async()=>{
    const ids=await page.locator('[id]').evaluateAll(nodes=>nodes.map(n=>n.id));assert.equal(new Set(ids).size,ids.length);assert.deepEqual(errors,[]);
  });
}finally{
  writeFileSync(join(out,'results.json'),JSON.stringify(results,null,2));
  await browser.close();await t.close();if(results.some(r=>!r.pass))process.exitCode=1;
}
