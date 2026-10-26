import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL('../public/'+path,import.meta.url),'utf8');
const script=read('js/workspace-card-motion.js');

test('workspace imports the card reveal engine once, without loading public landing scripts',()=>{
  const page=read('app.html');
  assert.equal((page.match(/src="js\/workspace-card-motion\.js" defer/g)||[]).length,1);
  assert.equal((page.match(/src="js\/workspace-cursor\.js" defer/g)||[]).length,1);
  assert.match(page,/href="css\/workspace-spark\.css"/);
  assert.doesNotMatch(page,/src="js\/home\.js"/,'landing scripts are not safe in the app');
});

test('workspace motion matches landing easing and keeps hover transitions functional',()=>{
  const css=read('css/workspace-spark.css');
  const home=read('css/home.css');
  assert.match(home,/card-reveal \.75s cubic-bezier\(\.2,\.8,\.2,1\)/);
  assert.match(css,/@keyframes cerium-workspace-card-reveal/);
  assert.match(css,/cerium-workspace-card-reveal \.75s cubic-bezier\(\.2,\.8,\.2,1\) both/);
  assert.match(css,/animation-delay:calc\(var\(--cerium-card-index,0\)\*\.085s\)/);
  assert.match(css,/from\{opacity:0;translate:0 28px\}/);
  assert.match(css,/to\{opacity:1;translate:0 0\}/);
  const keyframes=css.match(/@keyframes cerium-workspace-card-reveal\{[^}]*\}[^}]*\}/)?.[0]||'';
  assert.doesNotMatch(keyframes,/transform:/,'translate must not block CSS transform hover lift');
  assert.match(css,/\.dashboard-grid>.panel:hover \.panel-title h2::after\{width:100%\}/);
  assert.match(css,/\.app-page \.dashboard-grid>.panel:hover\{\s*transform:translateY\(-3px\) scale\(1\.004\)/);
  assert.match(css,/@media\(hover:hover\) and \(pointer:fine\)/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css,/@media print\{/);
  assert.match(css,/\.app-page \.cerium-card-reveal\{opacity:1!important;translate:none!important;animation:none!important/);
});

function motionHarness({reduced=false,supported=true}={}){
  const parent={};
  const cards=[];
  let io=null,mutation=null,focus=null,mediaChange=null;
  const media={matches:reduced,addEventListener(_type,fn){mediaChange=fn;}};
  const makeCard=()=> {
    const classes=new Set(),values={};
    const node={
      isConnected:true,parentElement:parent,
      classList:{contains:name=>classes.has(name),add:name=>classes.add(name)},
      style:{setProperty:(name,value)=>{values[name]=value;}},
      closest:()=>null,values,classes
    };
    cards.push(node);return node;
  };
  const root={};
  const host={
    querySelectorAll:()=>cards.filter(card=>card.isConnected),
    addEventListener:(name,fn)=>{if(name==='focusin')focus=fn;}
  };
  class MockIntersectionObserver{
    constructor(callback,options){this.callback=callback;this.options=options;this.observed=new Set();this.unobserved=new Set();this.disconnected=false;io=this;}
    observe(node){this.observed.add(node);}
    unobserve(node){this.observed.delete(node);this.unobserved.add(node);}
    disconnect(){this.disconnected=true;this.observed.clear();}
    enter(node){this.callback([{target:node,isIntersecting:true}]);}
  }
  class MockMutationObserver{
    constructor(callback){this.callback=callback;mutation=this;}
    observe(_target,options){this.options=options;}
    changed(){this.callback([{addedNodes:[{}]}]);}
  }
  const fakeWindow={matchMedia:()=>media};
  if(supported)fakeWindow.IntersectionObserver=MockIntersectionObserver;
  const fakeDoc={getElementById:(id)=>id==='workspace-main'?root:id==='page-body'?host:null};
  const context={window:fakeWindow,document:fakeDoc,IntersectionObserver:MockIntersectionObserver,
    MutationObserver:MockMutationObserver,requestAnimationFrame:(fn)=>{fn();return 1;}};
  runInNewContext(script,context,{timeout:1000});
  return {makeCard,cards,get io(){return io;},get mutation(){return mutation;},
    setReduced(value){media.matches=value;mediaChange();},focusCard(card){focus({target:{closest:()=>card}})}};
}

test('scroll reveal observes dynamic cards in the app scroll root and staggers siblings',()=>{
  // The mock makes new cards visible only after the same IntersectionObserver
  // event that a real workspace scroll dispatches.
  const h=motionHarness();
  const first=h.makeCard(),second=h.makeCard();
  h.mutation.changed();
  assert.equal(h.io.options.root!==null,true);
  assert.equal(h.io.options.threshold,.08);
  assert.equal(h.io.observed.size,2);
  assert.equal(first.classes.has('cerium-card-reveal'),true);
  assert.equal(first.classes.has('cerium-card-in'),false);
  assert.equal(first.values['--cerium-card-index'],0);
  assert.equal(second.values['--cerium-card-index'],1);
  h.io.enter(first);
  assert.equal(first.classes.has('cerium-card-in'),true);
  assert.equal(h.io.observed.has(first),false,'reveal once; do not continuously reanimate');
  assert.equal(h.io.observed.has(second),true);
  h.focusCard(second);
  assert.equal(second.classes.has('cerium-card-in'),true,'keyboard focus reveals hidden card');
});

test('route refresh re-registers new cards and releases removed elements',()=>{
  const h=motionHarness(),old=h.makeCard();
  h.mutation.changed();
  assert.equal(h.io.observed.has(old),true);
  old.isConnected=false;
  const current=h.makeCard();
  h.mutation.changed();
  assert.equal(h.io.observed.has(old),false);
  assert.equal(h.io.observed.has(current),true);
  h.io.enter(current);
  assert.equal(current.classes.has('cerium-card-in'),true);
});

test('reduced motion and unsupported browsers do not hide cards',()=>{
  const reduced=motionHarness({reduced:true});
  const a=reduced.makeCard();reduced.mutation.changed();
  assert.equal(reduced.io,null);
  assert.equal(a.classes.has('cerium-card-reveal'),false);
  const unsupported=motionHarness({supported:false});
  const b=unsupported.makeCard();unsupported.mutation.changed();
  assert.equal(unsupported.io,null);
  assert.equal(b.classes.has('cerium-card-reveal'),false);
  const enabled=motionHarness(),c=enabled.makeCard();
  enabled.mutation.changed();enabled.setReduced(true);
  assert.equal(c.classes.has('cerium-card-in'),true,'reduced-motion toggle reveals pending cards');
  assert.equal(enabled.io.disconnected,true,'previous observer is disconnected on reduced motion');
  assert.equal(enabled.io.observed.size,0,'observer no longer tracks any cards');
});

test('the dynamic observer excludes modal, print, and table rows',()=>{
  for(const name of ['.table-scroll','.data-table',"dialog,[role=\"dialog\"]"]){
    assert.ok(script.includes(name),'missing exclusion '+name);
  }
  assert.match(script,/changes\.observe\(host,\{childList:true,subtree:true\}\)/);
  assert.match(script,/observer\.unobserve\(card\)/);
  assert.doesNotMatch(script,/addEventListener\('pointermove'/,'reuse magnetic cursor, never duplicate pointer tracking');
});
