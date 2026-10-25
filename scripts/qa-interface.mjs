// Run with Playwright + Chromium installed. Uses only a disposable local database.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {startServer} from '../test/helpers.js';
import {businessDetails} from '../test/business-fixtures.js';
const require=createRequire(import.meta.url),{chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright':'playwright');
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox','--disable-dev-shm-usage'],headless:true});
const t=await startServer({env:{WORKSPACE_ACCESS_MODE:'phone'}});let checks=0;const errors=[];
try{
 const guest=await browser.newContext({reducedMotion:'reduce'}),owner=await browser.newContext({reducedMotion:'reduce'});
 for(const context of [guest,owner])await context.route('https://fonts.googleapis.com/**',r=>r.abort());
 const response=await owner.request.post(t.url+'/auth/register',{headers:{Origin:t.base},data:{email:'interface@example.com',name:'Interface Owner',password:'BrowserTest123!'}});assert.equal(response.status(),201);
 const user=t.db.getUserByEmail('interface@example.com');t.db.beginBillingPhone(user.id,'+14155550123','US');t.db.completeBillingPhone(user.id,'+14155550123','US');t.db.saveBusinessProfile(user.id,businessDetails('US'));
 const pub=await guest.newPage(),work=await owner.newPage();for(const p of [pub,work])p.on('pageerror',err=>errors.push(err.message));
 const routes=['/','/about.html','/contact.html','/pricing.html','/login.html','/signup.html','/forgot-password.html','/reset-password.html','/privacy.html','/terms.html','/404.html'];
 for(const width of [320,390,768,1440]){
  for(const p of [pub,work])await p.setViewportSize({width,height:1000});
  for(const path of routes){
   await pub.goto(t.url+path);assert.equal(await pub.locator('link[href="css/cerium-ui.css"]').count(),1,path);checks++;
   const overflow=await pub.evaluate(()=>[...document.querySelectorAll('body *')].filter(n=>n.getBoundingClientRect().right>innerWidth+1&&getComputedStyle(n).position!=='fixed').slice(0,8).map(n=>({tag:n.tagName,class:n.className,width:n.getBoundingClientRect().width,right:n.getBoundingClientRect().right})));
   assert.equal(await pub.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,path+' overflow at '+width+' '+JSON.stringify(overflow));checks++;
  }
  for(const path of ['/app.html','/app.html#invoices','/app.html#settings','/verify.html?edit=business','/welcome.html','/waitlist.html']){
   await work.goto(t.url+path);
   if(path.startsWith('/app'))await work.locator('#cerium-entry-scene').waitFor({state:'hidden'});
   if(path.startsWith('/verify'))await work.locator('#biz-contact').waitFor({state:'visible'});
   assert.equal(await work.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,path+' overflow at '+width);checks++;
  }
  await work.goto(t.url+'/app.html');await work.locator('#cerium-entry-scene').waitFor({state:'hidden'});
  if(width<760){
   const cards=await work.locator('.metric:visible').evaluateAll(nodes=>nodes.map(n=>({x:n.getBoundingClientRect().x,y:n.getBoundingClientRect().y})));
   assert.equal(cards.filter(c=>c.y===cards[0].y).length,2,'two readable metric columns on mobile');checks++;
   await work.locator('#menu-toggle').click();await work.locator('.nav-link[data-nav="invoices"]').click();
   assert.equal(await work.locator('#sidebar').getAttribute('inert'),'');checks++;
  }else await work.locator('.nav-link[data-nav="invoices"]').click();
  await work.locator('[data-action="new"][data-kind="invoice"]').first().click();
  const dialog=await work.locator('#record-dialog').boundingBox();assert.ok(dialog.x>=0&&dialog.x+dialog.width<=width+1);checks++;
  await work.locator('#field-customerName').fill('Interface Customer');await work.locator('#field-jobTitle').fill('Design review');await work.locator('#field-amount').fill('125');
  await work.locator('#record-dialog [data-action="close-dialog"]').first().click();assert.equal(await work.locator('#record-dialog').isVisible(),false);checks++;
 }
 // The public example is still interactive and the signup link remains real.
 await pub.goto(t.url+'/');await pub.locator('#fl input').first().check();assert.equal(await pub.locator('#fc').textContent(),'1');checks++;
 assert.equal(await pub.locator('.hero .btn-auth-action').getAttribute('href'),'signup.html');checks++;
 // User-selected tools still remove their overview cards instead of leaving slots.
 await work.goto(t.url+'/app.html');await work.locator('#cerium-entry-scene').waitFor({state:'hidden'});
 await work.evaluate(async()=>{const api=(await import('/js/api.js')).default;await api.saveWorkspacePreferences({category:'other',modules:['invoices']});});
 await work.reload();await work.locator('#cerium-entry-scene').waitFor({state:'hidden'});
 assert.equal(await work.locator('.metric:visible').count(),2);assert.equal(await work.locator('.dashboard-grid>.panel:visible').count(),1);checks+=2;
 assert.deepEqual(errors,[]);checks++;
 console.log(JSON.stringify({checks,viewports:[320,390,768,1440],pageErrors:errors},null,2));
}finally{await browser.close();await t.close();}
