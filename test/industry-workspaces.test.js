import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {
 INDUSTRY_PROFILES,INDUSTRY_OPTIONS,WORKSPACE_MODULES,defaultModules,
 suggestIndustry,recommendWorkspace,normalizeModules
} from '../public/js/industry-workspaces.js';
import {startServer,signIn,ALICE,BOB} from './helpers.js';
import {prepareBusiness} from './business-fixtures.js';
import {customizeBusinessNavigation} from '../public/js/workspace-customizer.js';

const source=p=>readFileSync(fileURLToPath(new URL('../'+p,import.meta.url)),'utf8');

test('ten distinct preset industries plus a fully selectable Other profile',()=>{
 assert.equal(INDUSTRY_PROFILES.length,10);
 assert.equal(new Set(INDUSTRY_PROFILES.map(p=>p.id)).size,10);
 assert.equal(INDUSTRY_OPTIONS.length,11);
 assert.equal(INDUSTRY_OPTIONS.at(-1).value,'other');
 const ids=new Set(WORKSPACE_MODULES.map(m=>m.id));
 const unique=new Set();
 for(const p of INDUSTRY_PROFILES){
   assert.ok(p.modules.length>=4);
   assert.ok(p.modules.length<ids.size,'Preset should hide unnecessary modules');
   assert.ok(p.modules.every(id=>ids.has(id)));
   assert.equal(new Set(p.modules).size,p.modules.length);
   unique.add(p.modules.join(','));
 }
 assert.ok(unique.size>=5,'Trade presets should vary meaningfully');
 assert.deepEqual(new Set(defaultModules('other')),ids);
});
test('smart assistant is local, explainable and suggestions are user-editable',()=>{
 assert.equal(suggestIndustry('I repair water pipes').category,'plumbing');
 assert.equal(suggestIndustry('Commercial AC maintenance').category,'hvac');
 assert.equal(suggestIndustry('We clean offices').category,'cleaning');
 const rec=recommendWorkspace({category:'other',description:'I send quotes and chase overdue invoices'});
 for(const module of ['quotes','invoices','reminders'])assert.ok(rec.modules.includes(module),module);
 assert.match(rec.explanation,/Suggested from the work you described/);
 assert.ok(recommendWorkspace({category:'other',description:'Unique artistic work'}).modules.length>0);
 assert.deepEqual(normalizeModules('quotes,jobs'),['quotes','jobs']);
 for(const input of [[],['other'],['jobs','jobs'],['invoices','admin'],'fake',{},null])
   assert.throws(()=>normalizeModules(input));
 const wizard=source('public/js/business-setup-ui.js');
 const customizer=source('public/js/workspace-customizer.js');
 assert.match(wizard,/biz-industry/);
 assert.match(wizard,/biz-module-grid/);
 assert.match(wizard,/biz-suggest-modules/);
 assert.match(customizer,/workspace-preferences-form/);
 assert.match(customizer,/workspace-recommend/);
 assert.match(customizer,/customizeBusinessNavigation/);
 assert.doesNotMatch(customizer,/https?:\/\/|fetch\(/);
});

test('preferences are account-owned; reject invalid modules and missing CSRF',async()=>{
 const t=await startServer({env:{WORKSPACE_ACCESS_MODE:'off'}});
 try{
   const a=t.browser(),b=t.browser();
   await signIn(t,a,{profile:ALICE});
   await signIn(t,b,{profile:BOB});
   const csrfA=(await a.me()).csrfToken;
   const csrfB=(await b.me()).csrfToken;
   const endpoint='/api/workspace/preferences';
   assert.equal((await t.browser().req(endpoint,{method:'PATCH',json:{category:'other',modules:['leads']}})).status,401);
   assert.equal((await a.req(endpoint,{method:'PATCH',json:{category:'plumbing',modules:['jobs']}})).status,403);
   for(const payload of [
     {category:'plumbing',modules:[]},{category:'plumbing',modules:['admin']},
     {category:'plumbing',modules:['jobs','jobs']},
     {category:'wrong',modules:['jobs']},{category:'plumbing',modules:'jobs'},
   ]) {
     const r=await a.req(endpoint,{method:'PATCH',csrf:csrfA,json:payload});
     assert.equal(r.status,400,JSON.stringify(payload));
   }
   const update=await a.req(endpoint,{method:'PATCH',csrf:csrfA,json:{category:'other',modules:['quotes','invoices','payments']}});
   assert.equal(update.status,200,await update.clone().text());
   assert.deepEqual((await update.json()).preferences,{category:'other',modules:['quotes','invoices','payments']});
   const owner=(await (await a.req('/api/workspace')).json()).account.workspacePreferences;
   assert.deepEqual(owner.modules,['quotes','invoices','payments']);
   const other=(await (await b.req('/api/workspace')).json()).account.workspacePreferences;
   assert.notDeepEqual(other.modules,owner.modules);
   assert.equal((await b.req(endpoint,{method:'PATCH',csrf:csrfB,json:{category:'painting',modules:['quotes','jobs']}})).status,200);
   assert.deepEqual((await (await a.req('/api/workspace')).json()).account.workspacePreferences.modules,owner.modules);
 }finally{await t.close();}
});
test('mandatory onboarding stores the exact custom selection without changing trial clock',async()=>{
 const t=await startServer({env:{WORKSPACE_ACCESS_MODE:'phone'}});
 try{
   const b=t.browser();
   await signIn(t,b,{profile:ALICE});
   const csrf=(await b.me()).csrfToken;
   assert.equal((await b.req('/api/billing/identity/start',{method:'POST',csrf,
     json:{declaredCountry:'US',confirmCountry:true,phone:'4155550123'}})).status,200);
   assert.equal((await b.req('/api/billing/identity/verify',{method:'POST',csrf,json:{code:'000000'}})).status,200);
   await prepareBusiness(t,b,'US',{trade:'Independent graphic design',industryCategory:'other',workspaceModules:'leads,quotes,invoices'});
   assert.equal((await b.req('/api/workspace')).status,403);
   const completed=await b.req('/api/business/setup/complete',{method:'POST',csrf,json:{confirmBusinessDetails:true}});
   assert.equal(completed.status,200,await completed.clone().text());
   const ws=await (await b.req('/api/workspace')).json();
   assert.deepEqual(ws.account.workspacePreferences,{category:'other',modules:['leads','quotes','invoices']});
   const user=t.db.getUserByEmail(ALICE.email);
   assert.equal(user.trial_ends_at-user.onboarding_completed_at,15*86400000);
 }finally{await t.close();}
});

function navigationFixture(){
 const items=['overview',...WORKSPACE_MODULES.map(m=>m.id)].map(id=>({dataset:{nav:id},hidden:false,style:{display:''}}));
 const nav={children:[...items],querySelectorAll:()=>items,
  append(link){this.children=this.children.filter(item=>item!==link);this.children.push(link);},
  prepend(link){this.children=this.children.filter(item=>item!==link);this.children.unshift(link);}};
 return {nav,root:{querySelector:()=>nav},links:new Map(items.map(item=>[item.dataset.nav,item]))};
}
test('Overview stays visible and first for every preset, custom selection and fallback',()=>{
 const fixture=navigationFixture();
 for(const modules of [...INDUSTRY_PROFILES.map(p=>p.modules),['payments','quotes'],undefined,[]]){
  // Recover an Overview link hidden by an earlier customization pass.
  const overview=fixture.links.get('overview');overview.hidden=true;overview.style.display='none';
  customizeBusinessNavigation(fixture.root,modules);
  const selected=modules??WORKSPACE_MODULES.map(m=>m.id);
  const visible=fixture.nav.children.filter(link=>!link.hidden&&link.style.display!=='none').map(link=>link.dataset.nav);
  assert.deepEqual(visible,['overview',...selected]);
  for(const [id,link] of fixture.links){
   assert.equal(link.hidden,id!=='overview'&&!selected.includes(id));
  }
 }
});
