import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL('../public/'+path,import.meta.url),'utf8');

function navigationHarness({width=1280,stored='false',storageAllowed=true}={}){
  const app=read('js/app.js');
  const start=app.indexOf('// Desktop navigation can collapse completely;');
  const end=app.indexOf("window.addEventListener('hashchange'",start);
  assert.ok(start>=0&&end>start,'controller should have a standalone navigation handler');
  const script=app.slice(start,end);
  const listeners=new Map();
  const focused=[];
  const makeClassList=()=>{
    const classes=new Set();
    return {
      add:value=>classes.add(value),
      remove:value=>classes.delete(value),
      contains:value=>classes.has(value),
      toggle(value,force){
        if(force===true)classes.add(value);
        else if(force===false)classes.delete(value);
        else if(classes.has(value))classes.delete(value);
        else classes.add(value);
        return classes.has(value);
      }
    };
  };
  const node=()=>({
    inert:false,
    hidden:false,
    classList:makeClassList(),
    attrs:new Map(),
    setAttribute(key,value){this.attrs.set(key,value);},
    getAttribute(key){return this.attrs.get(key);},
    addEventListener(event,callback){listeners.set(this.id+':'+event,callback);},
    focus(){focused.push(this.id);}
  });
  const elements=Object.fromEntries(['workspace','sidebar','sidebar-collapse-toggle','menu-toggle','nav-backdrop','main-frame'].map(id=>[id,Object.assign(node(),{id})]));
  elements['nav-backdrop'].hidden=true;
  elements.sidebar.querySelector=()=>({focus(){focused.push('nav-current');}});
  const saved=new Map([['cerium:sidebar-collapsed',stored]]);
  const scope={
    innerWidth:width,
    $:id=>elements[id],
    localStorage:{
      getItem:key=>{if(!storageAllowed)throw Error('storage blocked');return saved.get(key)??null;},
      setItem:(key,value)=>{if(!storageAllowed)throw Error('storage blocked');saved.set(key,value);}
    },
    window:{addEventListener:(event,callback)=>listeners.set('window:'+event,callback)}
  };
  runInNewContext(script+'\nglobalThis.nav={syncSidebarLayout,collapseSidebar,expandSidebar,openNavigation,closeNavigation};',scope);
  return {scope,elements,focused,saved,nav:scope.nav,click:id=>listeners.get(id+':click')(),resize:width=>{scope.innerWidth=width;listeners.get('window:resize')();}};
}

test('the sidebar has an accessible three-line toggle and the full-width desktop layout',()=>{
  const html=read('app.html'),css=read('css/workspace.css');
  assert.match(html,/id="sidebar-collapse-toggle"[^>]*aria-label="Hide sidebar"[^>]*aria-controls="sidebar"/);
  assert.match(html,/id="menu-toggle"[^>]*aria-controls="sidebar"/);
  assert.match(html,/id="sidebar-collapse-toggle"[\s\S]*?<use href="#i-menu"/);
  assert.match(css,/\.workspace\.is-sidebar-collapsed\{grid-template-columns:minmax\(0,1fr\)\}/);
  assert.match(css,/\.workspace\.is-sidebar-collapsed>\.sidebar\{display:none\}/);
  assert.match(css,/\.workspace\.is-sidebar-collapsed \.mobile-menu\{display:inline-flex/);
  assert.match(css,/@media\(max-width:760px\)/,'existing mobile drawer remains');
});

test('desktop hamburger hides sidebar, expands the workspace and restores it with keyboard focus',()=>{
  const h=navigationHarness(),{elements,nav}=h;
  nav.syncSidebarLayout();
  assert.equal(elements.workspace.classList.contains('is-sidebar-collapsed'),false);
  assert.equal(elements.sidebar.inert,false);
  h.click('sidebar-collapse-toggle');
  assert.equal(elements.workspace.classList.contains('is-sidebar-collapsed'),true);
  assert.equal(elements.sidebar.inert,true);
  assert.equal(elements['menu-toggle'].getAttribute('aria-label'),'Show sidebar');
  assert.equal(elements['menu-toggle'].getAttribute('aria-expanded'),'false');
  assert.equal(h.saved.get('cerium:sidebar-collapsed'),'true');
  assert.equal(h.focused.at(-1),'menu-toggle');
  h.click('menu-toggle');
  assert.equal(elements.workspace.classList.contains('is-sidebar-collapsed'),false);
  assert.equal(elements.sidebar.inert,false);
  assert.equal(h.saved.get('cerium:sidebar-collapsed'),'false');
  assert.equal(h.focused.at(-1),'sidebar-collapse-toggle');
});

test('saved desktop preference survives a resize without hiding the mobile overlay',()=>{
  const h=navigationHarness({stored:'true'});
  h.nav.syncSidebarLayout();
  assert.equal(h.elements.workspace.classList.contains('is-sidebar-collapsed'),true);
  h.resize(390);
  assert.equal(h.elements.workspace.classList.contains('is-sidebar-collapsed'),false);
  assert.equal(h.elements.sidebar.inert,true);
  h.click('menu-toggle');
  assert.equal(h.elements.sidebar.classList.contains('is-open'),true);
  assert.equal(h.elements['nav-backdrop'].hidden,false);
  assert.equal(h.elements['main-frame'].inert,true);
  assert.equal(h.elements['menu-toggle'].getAttribute('aria-expanded'),'true');
  h.click('sidebar-collapse-toggle');
  assert.equal(h.elements.sidebar.classList.contains('is-open'),false);
  assert.equal(h.elements['main-frame'].inert,false);
  assert.equal(h.focused.at(-1),'menu-toggle');
  h.resize(1200);
  assert.equal(h.elements.workspace.classList.contains('is-sidebar-collapsed'),true);
  h.click('menu-toggle');
  assert.equal(h.elements.workspace.classList.contains('is-sidebar-collapsed'),false);
});

test('collapse still functions when browser storage is unavailable',()=>{
  const h=navigationHarness({storageAllowed:false});
  h.nav.syncSidebarLayout();
  h.click('sidebar-collapse-toggle');
  assert.equal(h.elements.workspace.classList.contains('is-sidebar-collapsed'),true);
  h.click('menu-toggle');
  assert.equal(h.elements.workspace.classList.contains('is-sidebar-collapsed'),false);
});
