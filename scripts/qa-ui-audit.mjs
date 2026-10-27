// Real-browser UI audit. Uses an isolated in-memory database and synthetic accounts.
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {startServer} from '../test/helpers.js';
import {completeBusiness} from '../test/business-fixtures.js';
import {WORKSPACE_FEATURES,WORKSPACE_UTILITIES} from '../public/js/workspace-registry.js';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright':'playwright');
const out=process.env.UI_AUDIT_OUTPUT||'output/ui-audit';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote','--use-gl=disabled']});
const t=await startServer({env:{WORKSPACE_ACCESS_MODE:'phone'}});
const results={pages:[],errors:[],failedAssets:[],brokenLinks:[]};
const internalLinks=new Set();
async function context(options={}){
 const c=await browser.newContext(options);
 // Fonts are optional external assets; keep the audit independent of internet access.
 await c.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
 return c;
}
function watch(p){
 p.on('pageerror',e=>results.errors.push({url:p.url(),message:e.message}));
 p.on('response',r=>{if(r.url().startsWith(t.url)&&r.status()>=400&&['script','stylesheet','image','font'].includes(r.request().resourceType()))results.failedAssets.push({url:r.url(),status:r.status()});});
}
async function inspect(p,label,width){
 const data=await p.evaluate(()=>{
  const visible=e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'&&!e.closest('[hidden]');};
  const scrollable=e=>{for(let p=e.parentElement;p&&p!==document.body;p=p.parentElement){if(/auto|scroll/.test(getComputedStyle(p).overflowX)&&p.scrollWidth>p.clientWidth+1)return true;}return false;};
  const clipped=[...document.querySelectorAll('h1,h2,h3,p,.ac,button,a,input,select,textarea')].filter(visible).filter(e=>{const r=e.getBoundingClientRect();return (r.right>innerWidth+2||r.left< -2||(e.matches('h1,h2,h3,p,.ac')&&e.scrollWidth>e.clientWidth+2))&&!e.closest('.sidebar')&&!scrollable(e);}).map(e=>({tag:e.tagName,id:e.id,text:(e.textContent||e.getAttribute('aria-label')||'').trim().slice(0,70),x:Math.round(e.getBoundingClientRect().x),w:Math.round(e.getBoundingClientRect().width)}));
  const unnamed=[...document.querySelectorAll('button,input:not([type=hidden]),select,textarea')].filter(visible).filter(e=>!(e.textContent.trim()||e.getAttribute('aria-label')||e.getAttribute('aria-labelledby')||e.labels?.length||e.getAttribute('title'))).map(e=>({tag:e.tagName,id:e.id,name:e.name}));
  return {title:document.title,heading:document.querySelector('h1')?.textContent.trim(),overflow:document.documentElement.scrollWidth>innerWidth+1,clipped,unnamed,links:[...document.querySelectorAll('a[href]')].map(e=>e.href),buttons:[...document.querySelectorAll('button')].filter(visible).map(e=>e.textContent.trim()||e.getAttribute('aria-label'))};
 });
 for(const link of data.links)if(link.startsWith(t.url)&&!new URL(link).pathname.startsWith('/auth/'))internalLinks.add(link);
 delete data.links;
 await p.mouse.move(Math.min(width-20,250),180);await p.waitForTimeout(100);
 data.cursor=await p.evaluate(()=>({native:getComputedStyle(document.elementFromPoint(Math.min(innerWidth-20,250),180)||document.body).cursor,ring:!!document.querySelector('.workspace-cursor.visible')}));
 if(width===1440||width===390)await p.screenshot({path:join(out,label+'-'+width+'.png'),animations:'disabled'});
 results.pages.push({page:label,width,...data});
 if(data.overflow||data.clipped.length||data.unnamed.length||(data.cursor.native==='none'&&!data.cursor.ring))process.exitCode=1;
 console.log(label,width,JSON.stringify({overflow:data.overflow,clipped:data.clipped.length,unnamed:data.unnamed.length}));
}
try{
 const publicPages=readdirSync(new URL('../public/',import.meta.url)).filter(n=>n.endsWith('.html')&&!['app.html','welcome.html','enter.html','verify.html'].includes(n));
 const guest=await context();const p=await guest.newPage();watch(p);
 for(const width of process.env.UI_AUDIT_WORKSPACE_ONLY?[]:[1440,768,390,320]){
  await p.setViewportSize({width,height:900});
  for(const path of publicPages){
   await p.goto(t.url+'/'+path,{waitUntil:'domcontentloaded'});await p.waitForTimeout(180);
   await inspect(p,path.replace('.html',''),width);
  }
 }
 for(const link of internalLinks){const response=await guest.request.get(link);if(response.status()>=400)results.brokenLinks.push({url:link,status:response.status()});}
 await guest.close();
 const owner=t.browser();
 await owner.req('/auth/register',{method:'POST',json:{name:'Audit Owner',email:'ui-audit@example.com',password:'BrowserTest123!'}});
 const user=t.db.getUserByEmail('ui-audit@example.com');t.db.beginBillingPhone(user.id,'+14155550123','US');t.db.completeBillingPhone(user.id,'+14155550123','US');
 await completeBusiness(t,owner,'US');
 t.db.saveWorkspacePreferences(user.id,{category:'construction',modules:['leads','jobs','quotes','followups','invoices','payments','reviews','reminders']});
 const signed=await context();await signed.addCookies([...owner.jar].map(([name,value])=>({name,value,url:t.url})));
 const app=await signed.newPage();watch(app);
 for(const width of [1440,768,390,320]){
  await app.setViewportSize({width,height:900});
  await app.goto(t.url+'/app.html');await app.locator('#page-body').waitFor({state:'visible'});
  await app.locator('#cerium-entry-scene').waitFor({state:'hidden'});
  for(const feature of [...WORKSPACE_FEATURES,...WORKSPACE_UTILITIES.filter(x=>x.id!=='customize')]){
   await app.evaluate(hash=>location.hash=hash,feature.href);await app.waitForTimeout(100);
   await inspect(app,'workspace-'+(feature.category?feature.category+'-':'')+feature.id,width);
  }
 }
 const identity=await owner.me();const joined=await owner.req('/api/waitlist',{method:'POST',csrf:identity.csrfToken,json:{business:'UI audit'}});if(!joined.ok)throw new Error('Could not prepare signed-in waitlist fixture');
 for(const width of [1440,768,390,320]){
  await app.setViewportSize({width,height:900});await app.goto(t.url+'/waitlist.html');await app.locator('#s-on').waitFor({state:'visible'});await inspect(app,'waitlist-signed',width);
 }
 for(const path of ['welcome.html','verify.html?edit=business','enter.html?next=%2Fapp.html']){
  await app.setViewportSize({width:390,height:900});await app.goto(t.url+'/'+path);await app.waitForTimeout(250);await inspect(app,path.split('.')[0],390);
 }
 await signed.close();
}catch(e){results.failure={message:e.message,stack:e.stack};console.error(e);process.exitCode=1;}
finally{if(results.errors.length||results.failedAssets.length||results.brokenLinks.length)process.exitCode=1;writeFileSync(join(out,'scan.json'),JSON.stringify(results,null,2));await browser.close();await t.close();}
