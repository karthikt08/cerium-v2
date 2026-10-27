// Browser regression checks with synthetic data; no external AI requests.
// Set PLAYWRIGHT_CHROMIUM_EXECUTABLE when using a separately installed browser.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {startServer} from '../test/helpers.js';
import {completeBusiness} from '../test/business-fixtures.js';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright':'playwright');
const out=process.env.GUIDE_QA_OUTPUT||'output/guide-assistant';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote','--use-gl=disabled']});
const t=await startServer({env:{WORKSPACE_ACCESS_MODE:'phone'}});
const errors=[];
let page;
const pass=label=>console.log('PASS '+label);
try{
  const owner=t.browser();
  await owner.req('/auth/register',{method:'POST',json:{name:'Guide Tester',email:'guide-qa@example.com',password:'BrowserTest123!'}});
  const user=t.db.getUserByEmail('guide-qa@example.com');
  t.db.beginBillingPhone(user.id,'+14155550123','US');t.db.completeBillingPhone(user.id,'+14155550123','US');
  await completeBusiness(t,owner,'US');
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'no-preference'});
  await context.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
  await context.addCookies([...owner.jar].map(([name,value])=>({name,value,url:t.url})));
  page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(t.url+'/app.html');
  await page.locator('#page-body').waitFor({state:'visible'});
  await page.locator('#cerium-entry-scene').waitFor({state:'hidden'});
  await page.locator('#guide-trigger').click();
  const reply=()=>page.locator('.guide-bubble.guide-formatted').last();
  const submit=async question=>{
    await page.locator('#guide-question').fill(question);
    await page.locator('#guide-form').evaluate(form=>form.requestSubmit());
  };
  const done=()=>page.waitForFunction(()=>!document.querySelector('#guide-send').disabled);
  const typing=()=>page.waitForFunction(()=>document.querySelector('.guide-typing'));
  const reset=()=>page.locator('#guide-reset').click();

  await page.evaluate(()=>{
    window.guideAnnouncements=[];
    new MutationObserver(()=>window.guideAnnouncements.push(document.querySelector('#guide-announcer').textContent))
      .observe(document.querySelector('#guide-announcer'),{childList:true,subtree:true,characterData:true});
  });
  await submit('How do I save an invoice PDF?');await typing();
  await page.waitForFunction(()=>document.querySelector('.guide-formatted')?.innerText.length>15);
  const early=await reply().innerText();
  assert.ok(!early.includes('print dialog'),'first frames must not contain the full answer');
  await page.waitForTimeout(120);
  assert.ok((await reply().innerText()).length>early.length,'characters progress between frames');
  assert.equal(await page.locator('.guide-direct-links').count(),0,'navigation waits for the answer');
  await page.locator('#guide-question').fill('Next question draft');
  await page.locator('#guide-question').press('Enter');
  assert.equal(await page.locator('#guide-question').inputValue(),'Next question draft');
  await done();
  assert.equal(await reply().locator('ol li').count(),4);
  assert.match(await reply().innerText(),/print dialog/);
  assert.doesNotMatch(await reply().innerText(),/New invoice/);
  assert.equal(await page.locator('#guide-reveal').isVisible(),false);
  const announcements=await page.evaluate(()=>window.guideAnnouncements);
  assert.equal(announcements.length,2,'one thinking message and one completed answer');
  assert.match(announcements[1],/Print \/ save PDF/);
  pass('Progressive typing, numbered instructions, accessible announcement and composing during replies');
  await page.screenshot({path:join(out,'desktop.png')});

  await page.locator('.guide-direct-links a[href="#invoices"]').last().click();
  assert.equal(await page.locator('#guide-panel').isVisible(),false);
  assert.equal(new URL(page.url()).hash,'#invoices');
  await page.locator('#guide-trigger').click();
  await submit('Show me the steps');await typing();
  await page.locator('#guide-reveal').click();await done();
  assert.match(await reply().innerText(),/print dialog/);
  assert.doesNotMatch(await reply().innerText(),/New invoice/);
  pass('Verified page links, specific follow-up context and Show full answer');

  await page.route('**/api/assistant/message',r=>r.fulfill({status:503,contentType:'application/json',body:'{"error":"offline"}'}));
  await submit('How do I import an Excel spreadsheet?');await typing();
  await page.locator('#guide-reveal').click();await done();
  assert.match(await reply().innerText(),/map the columns/i);
  assert.equal(await page.locator('.guide-direct-links a[href="#leads"]').count(),1);
  await submit('frobnicate the platypus');await typing();await page.locator('#guide-reveal').click();await done();
  await submit('Show me the steps');await typing();await page.locator('#guide-reveal').click();await done();
  assert.match(await reply().innerText(),/Which part of Cerium/,'unknown turns must clear stale navigation context');
  await page.unroute('**/api/assistant/message');
  await page.route('**/api/assistant/message',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({reply:'Bad route',section:'../../admin'})}));
  await submit('How do I import an Excel spreadsheet?');await typing();await page.locator('#guide-reveal').click();await done();
  assert.match(await reply().innerText(),/map the columns/i);
  assert.doesNotMatch(await page.locator('#guide-messages').innerText(),/Bad route/);
  await page.unroute('**/api/assistant/message');
  pass('Failed and invalid API responses fall back locally; unknown turns clear stale context');

  let release,finishHeld;
  const held=new Promise(resolve=>{release=resolve;});
  const heldGate=new Promise(resolve=>{finishHeld=resolve;});
  await page.route('**/api/assistant/message',async route=>{release(route);await heldGate;},{times:1});
  await submit('Where are my invoices?');
  const oldRequest=await held;
  await reset();
  await submit('How do I convert an accepted quote into a scheduled job and invoice?');await typing();
  await oldRequest.fulfill({contentType:'application/json',body:JSON.stringify({reply:'STALE RESPONSE',section:'payments'})});
  finishHeld();
  await page.waitForTimeout(100);
  assert.equal(await page.locator('#guide-send').isDisabled(),true,'stale finally must not unlock the new request');
  assert.doesNotMatch(await page.locator('#guide-messages').innerText(),/STALE RESPONSE/);
  await reset();await page.waitForTimeout(100);
  assert.equal(await page.locator('.guide-bubble,.guide-actions,.guide-typing').count(),0);
  assert.equal(await page.locator('#guide-welcome-card').count(),1);
  pass('Reset cancels typing and discards delayed replies without corrupting a new conversation');

  await submit('How do I convert an accepted quote into a scheduled job and invoice?');await typing();
  await page.locator('#guide-close').click();await done();
  await page.locator('#guide-trigger').click();
  assert.equal(await page.locator('.guide-typing').count(),0);
  assert.equal(await reply().locator('ol li').count(),3);
  await submit('Walk me through it');await typing();await page.locator('#guide-reveal').click();await done();
  assert.equal(await reply().locator('ol li').count(),3);
  assert.deepEqual(await page.locator('.guide-workflow-card').last().locator('a').evaluateAll(links=>links.map(a=>a.getAttribute('href'))),['#quotes','#jobs','#invoices']);
  pass('Close and reopen finishes cleanly; workflow follow-ups keep all relevant pages');

  await reset();await page.emulateMedia({reducedMotion:'reduce'});
  await submit('How do I save an invoice PDF?');await done();
  assert.equal(await page.locator('.guide-typing').count(),0);
  assert.match(await reply().innerText(),/print dialog/);
  assert.equal(await page.locator('#guide-reveal').isVisible(),false);
  pass('Reduced-motion preference displays complete, formatted answers');

  await reset();await page.emulateMedia({reducedMotion:'no-preference'});
  const mock={source:'ai',section:'invoices',reply:'1. **Preview** the invoice before sharing.\n2. [Unsafe destination](javascript:alert(1)) <img src=x onerror=alert(1)>\n3. '+('Check the customer, balance and dates. '.repeat(32)),steps:'Open Invoices → New invoice',links:[{href:'https://evil.example',label:'Click'}]};
  await page.route('**/api/assistant/message',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(mock)}));
  await submit('How do I check my invoice?');await typing();await page.locator('#guide-reveal').click();await done();
  assert.equal(await reply().locator('ol').count(),1,'AI steps must not duplicate generic instructions');
  assert.equal(await reply().locator('strong').first().innerText(),'Preview');
  assert.equal(await reply().locator('img,script,a').count(),0);
  assert.equal(await page.locator('#guide-messages a[href^="https:"]').count(),0);
  await submit('How do I check my invoice?');await typing();
  await page.locator('#guide-messages').evaluate(el=>{el.scrollTop=0;el.dispatchEvent(new Event('scroll'));});
  await page.waitForTimeout(200);
  assert.ok(await page.locator('#guide-messages').evaluate(el=>el.scrollTop<2),'typing must not drag a reader to the bottom');
  await page.locator('#guide-reveal').click();await done();
  assert.ok(await page.locator('#guide-messages').evaluate(el=>el.scrollTop<2),'completion must preserve the reading position');
  await page.unroute('**/api/assistant/message');
  pass('Safe bold/list rendering, inert HTML and links, and scroll position preservation');

  const unicode=await page.evaluate(async()=>{
    const {typeGuideReply}=await import('/js/guide-response.js');
    const el=document.createElement('div');document.body.append(el);
    const text='👩🏽‍💻 नमस्ते ₹20.50 — café';
    const units=Array.from(new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text),x=>x.segment);
    const prefixes=new Set(units.map((_,i)=>units.slice(0,i+1).join('')));
    const samples=[];
    const render=typeGuideReply(el,[{type:'ul',items:[text]}],{onUpdate:()=>samples.push(el.textContent)});
    await render.finished;
    const result={valid:samples.every(s=>prefixes.has(s)),final:el.textContent};el.remove();return result;
  });
  assert.equal(unicode.valid,true);assert.equal(unicode.final,'👩🏽‍💻 नमस्ते ₹20.50 — café');
  pass('Typing preserves emoji and multilingual grapheme boundaries');

  await reset();await page.setViewportSize({width:390,height:844});
  await submit('How do I share an invoice on WhatsApp?');await typing();
  await page.screenshot({path:join(out,'mobile-typing.png')});
  await page.locator('#guide-reveal').click();await done();
  const bounds=await page.locator('#guide-panel').boundingBox();
  assert.ok(bounds.x>=0&&bounds.x+bounds.width<=390&&bounds.y>=0&&bounds.y+bounds.height<=844);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.match(await reply().innerText(),/message draft/);
  await page.screenshot({path:join(out,'mobile.png')});
  await page.setViewportSize({width:320,height:700});
  const small=await page.locator('#guide-panel').boundingBox();
  assert.ok(small.x>=0&&small.x+small.width<=320&&small.y>=0&&small.y+small.height<=700);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#guide-panel').isVisible(),false);
  assert.equal(await page.locator('#guide-trigger').evaluate(el=>el===document.activeElement),true);
  pass('Mobile layouts at 390px and 320px, Escape and focus return');
  assert.deepEqual(errors,[]);pass('No uncaught browser errors');
}catch(error){
  if(page)await page.screenshot({path:join(out,'failure.png')});
  console.error(error);process.exitCode=1;
}finally{await browser.close();await t.close();}
