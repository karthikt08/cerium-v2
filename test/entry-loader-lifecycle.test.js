import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../public/js/entry-loader.js',import.meta.url),'utf8');
function loader({mode='workspace',readyBefore=false,search='',referrer='',reduced=false,navType='navigate',fetcher=()=>Promise.resolve({ok:true,json:async()=>({signedIn:true})})}={}){
  const timers=new Map(),events={},redirects=[],classes=new Set();let now=0,sequence=0;
  const element=()=>({hidden:false,inert:false,textContent:'',dataset:{},
    classList:{add:c=>classes.add(c),remove:c=>classes.delete(c)},
    addEventListener(type,fn){this[type]=fn;},focus(){this.focused=true;}});
  const skip=element(),retry=element(),caption=element(),workspace=element();
  retry.hidden=true;
  const scene={...element(),dataset:{ceriumEntry:mode},querySelector:selector=>selector==='[data-entry-skip]'?skip:selector==='[data-entry-retry]'?retry:caption,contains:node=>node===skip};
  const location={origin:'http://cerium.test',pathname:mode==='workspace'?'/app.html':'/enter.html',search,hash:'',href:'http://cerium.test/'+(mode==='workspace'?'app.html':'enter.html')+search,replace:url=>redirects.push(url),reload:()=>redirects.push('reload')};
  const document={referrer,activeElement:null,querySelector:selector=>selector==='[data-cerium-entry]'?scene:selector==='#workspace'?workspace:null};
  const history={state:null,replaceState(state,unused,url){history.state=state;location.href=new URL(url,location.href).href;location.search=new URL(location.href).search;}};
  const context={document,location,history,URL,URLSearchParams,AbortController,AbortSignal,
    performance:{now:()=>now,getEntriesByType:()=>[{type:navType}]},
    setTimeout:(fn,delay=0)=>{const id=++sequence;timers.set(id,{fn,at:now+delay});return id;},clearTimeout:id=>timers.delete(id),
    matchMedia:()=>({matches:reduced}),fetch:fetcher,
    CeriumWorkspaceReady:readyBefore?'ready':undefined,
    addEventListener:(type,fn)=>{events[type]=fn;},removeEventListener:()=>{},
  };context.window=context;
  vm.runInNewContext(source,context);
  const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
  async function advance(ms){
    const end=now+ms;await flush();
    while(true){const pending=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!pending)break;
      now=pending[1].at;timers.delete(pending[0]);pending[1].fn();await flush();}
    now=end;await flush();
  }
  return {scene,skip,retry,caption,workspace,classes,context,redirects,location,history,advance};
}

test('slow initialization stays covered and offers recovery without claiming readiness',async()=>{
  const x=loader();x.skip.click();await x.advance(15000);
  assert.equal(x.scene.hidden,false);assert.equal(x.retry.hidden,false);
  assert.match(x.caption.textContent,/longer|connection/i);
  x.context.CeriumEntryLoader.complete();await x.advance(300);assert.equal(x.scene.hidden,true);
});
test('a completion signal sent before the deferred loader runs is retained',async()=>{
  const x=loader({readyBefore:true});await x.advance(3300);assert.equal(x.scene.hidden,true);
});
test('Skip intro releases a ready workspace without the animation delay',async()=>{
  const x=loader();x.context.CeriumEntryLoader.complete();x.skip.click();await x.advance(300);assert.equal(x.scene.hidden,true);
});
test('an intro handoff skips only the animation and still waits for initialized content',async()=>{
  const x=loader({search:'?view=all&ceriumIntro=done',referrer:'http://cerium.test/enter.html'});
  await x.advance(1000);assert.equal(x.scene.hidden,false);assert.equal(x.workspace.inert,true);
  x.context.CeriumEntryLoader.complete();await x.advance(300);assert.equal(x.scene.hidden,true);
  assert.equal(x.location.search,'?view=all');assert.equal(x.workspace.inert,false);
});
test('fresh direct entries and reloads do not reuse an old intro handoff',async()=>{
  for(const options of [{search:'?ceriumIntro=done'}, {search:'?ceriumIntro=done',referrer:'http://cerium.test/enter.html',navType:'reload'}]){
    const x=loader(options);assert.equal(x.scene.hidden,false);assert.ok(x.context.CeriumEntryLoader);
  }
});
test('the redirect validates next targets and retains safe query strings and fragments',async()=>{
  for(const [next,expected] of [['https://evil.test/steal','/app.html'],['//evil.test/app.html','/app.html'],['/verify.html','/app.html'],['/app.html?view=all#jobs','/app.html?view=all']]){
    const x=loader({mode:'redirect',search:'?next='+encodeURIComponent(next),reduced:true});await x.advance(1000);
    const target=new URL(x.redirects[0],x.location.origin);target.searchParams.delete('ceriumIntro');assert.equal(target.pathname+target.search,expected);
    if(next.includes('#jobs'))assert.equal(target.hash,'#jobs');
  }
});
test('signed-out entries return to sign-in, retaining the safe destination',async()=>{
  const x=loader({mode:'redirect',search:'?next='+encodeURIComponent('/app.html#invoices'),fetcher:async()=>({ok:true,json:async()=>({signedIn:false})})});await x.advance(1000);
  const target=new URL(x.redirects[0],x.location.origin);assert.equal(target.pathname,'/login.html');assert.equal(target.searchParams.get('returnTo'),'/app.html#invoices');
});

test('the CSS animation finishes before revealing initialized content',async()=>{
  const x=loader();x.context.CeriumEntryLoader.complete();await x.advance(1000);
  assert.equal(x.scene.hidden,false);await x.advance(2300);assert.equal(x.scene.hidden,true);
});
test('initialization failure immediately reveals the app recovery screen',async()=>{
  const x=loader();x.context.CeriumEntryLoader.fail();await x.advance(300);assert.equal(x.scene.hidden,true);
});
test('Skip intro waits for the session check and cannot skip sign-in',async()=>{
  let respond;const x=loader({mode:'redirect',fetcher:()=>new Promise(resolve=>{respond=resolve;})});
  x.skip.click();await x.advance(1000);assert.deepEqual(x.redirects,[]);
  respond({ok:true,json:async()=>({signedIn:false})});await x.advance(1000);
  assert.equal(new URL(x.redirects[0],x.location.origin).pathname,'/login.html');
});
test('a stalled session request aborts and hands control to the protected route',async()=>{
  let aborted=false;
  const x=loader({mode:'redirect',fetcher:(url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(new Error('Request aborted'));}))});
  await x.advance(7100);assert.equal(aborted,true);assert.equal(new URL(x.redirects[0],x.location.origin).pathname,'/app.html');
});
test('reduced-motion entries reveal ready content immediately',async()=>{
  const x=loader({reduced:true});assert.ok(x.classes.has('entry-instant'));x.context.CeriumEntryLoader.complete();await x.advance(1);assert.equal(x.scene.hidden,true);
});
