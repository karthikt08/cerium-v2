import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {initializeSidebarResize,clampSidebarWidth,SIDEBAR_WIDTH_KEY} from '../public/js/sidebar-resize.js';
const read=path=>fs.readFileSync(new URL('../public/'+path,import.meta.url),'utf8');
const css=read('css/workspace-layout.css'),html=read('app.html'),
  app=read('js/app.js'),typography=read('css/typography.css');

test('resizable sidebar adjusts workspace grid instead of overlaying main interface',()=>{
  assert.match(css, /\.app-page \.workspace:not\(\.sidebar-collapsed\)\s*\{\s*grid-template-columns:var\(--cerium-sidebar-width\) minmax\(0,1fr\);/);
  assert.match(css, /\.app-page \.workspace \.main-frame\s*\{[^}]*min-width:0;/);
  assert.match(css, /\.app-page \.workspace \.content-scroll\s*\{[^}]*min-width:0;/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /\.sidebar-resize-handle\s*\{\s*display:none!important;/);
  assert.match(css, /\.workspace\.sidebar-collapsed \.sidebar-resize-handle\s*\{\s*display:none;/);
  assert.match(css, /\.workspace\.sidebar-resizing\s*\{\s*transition:none!important;/);
  assert.match(html, /id="sidebar-resize-handle" role="separator" aria-orientation="vertical"/);
  assert.match(html, /aria-label="Resize sidebar" aria-controls="sidebar main-frame"/);
  assert.match(html, /tabindex="0"/);
  assert.match(app, /import \{initializeSidebarResize\} from '\.\/sidebar-resize\.js'/);
  assert.match(app, /initializeSidebarResize\(\{workspace:\$\('workspace'\),handle:\$\('sidebar-resize-handle'\)\}\);/);
  assert.match(app, /const SIDEBAR_COLLAPSE_KEY='cerium\.sidebar\.collapsed'/);
});

test('sidebar bounds preserve usable workspace at narrow and wide desktop widths',()=>{
  assert.equal(clampSidebarWidth(480,1600),420);
  assert.equal(clampSidebarWidth(50,1600),200);
  assert.equal(clampSidebarWidth(300,900),300);
  assert.equal(clampSidebarWidth(410,900),380); // 520px minimum for content
  assert.equal(clampSidebarWidth(420,761),241);
  assert.equal(clampSidebarWidth('260',1440),260);
  assert.equal(clampSidebarWidth(NaN,1440),200);
});

test('drag, keyboard, collapse-safe interaction and stored preference behave correctly',()=>{
  const oldWindow=globalThis.window,oldStorage=globalThis.localStorage;
  const storage=new Map();
  const events=new Map(),windowEvents=new Map(),attrs=new Map(),styles=new Map();
  const classes=new Set();
  let captured=null;
  const workspace={
    style:{setProperty:(name,value)=>styles.set(name,value)},
    classList:{
      contains:name=>classes.has(name),
      add:name=>classes.add(name),
      remove:name=>classes.delete(name)
    },
    getBoundingClientRect:()=>({left:0})
  };
  const handle={
    addEventListener:(name,fn)=>events.set(name,fn),
    removeEventListener:name=>events.delete(name),
    setAttribute:(name,value)=>attrs.set(name,value),
    setPointerCapture:id=>{captured=id;},
    hasPointerCapture:id=>captured===id,
    releasePointerCapture:id=>{if(captured===id)captured=null;}
  };
  globalThis.window={
    innerWidth:1300,
    addEventListener:(name,fn)=>windowEvents.set(name,fn),
    removeEventListener:name=>windowEvents.delete(name)
  };
  globalThis.localStorage={
    getItem:key=>storage.get(key)??null,
    setItem:(key,value)=>storage.set(key,value),
    removeItem:key=>storage.delete(key)
  };
  try{
    const cleanup=initializeSidebarResize({workspace,handle});
    assert.equal(styles.get('--cerium-sidebar-width'),'224px');
    let prevented=false;
    events.get('pointerdown')({pointerId:7,isPrimary:true,button:0,preventDefault:()=>{prevented=true;}});
    assert.ok(prevented);
    assert.ok(classes.has('sidebar-resizing'));
    events.get('pointermove')({pointerId:7,clientX:356});
    assert.equal(styles.get('--cerium-sidebar-width'),'356px');
    events.get('pointerup')({pointerId:7});
    assert.ok(!classes.has('sidebar-resizing'));
    assert.equal(storage.get(SIDEBAR_WIDTH_KEY),'356');

    events.get('keydown')({key:'ArrowLeft',shiftKey:true,preventDefault(){}});
    assert.equal(styles.get('--cerium-sidebar-width'),'332px');
    events.get('keydown')({key:'End',shiftKey:false,preventDefault(){}});
    assert.equal(styles.get('--cerium-sidebar-width'),'420px');
    assert.equal(attrs.get('aria-valuenow'),'420');
    assert.equal(storage.get(SIDEBAR_WIDTH_KEY),'420');

    // Small desktop must leave at least 520px for content; preserve preferred
    // size to restore it when the viewport becomes wide again.
    globalThis.window.innerWidth=900;
    windowEvents.get('resize')();
    assert.equal(styles.get('--cerium-sidebar-width'),'380px');
    assert.equal(attrs.get('aria-valuemax'),'380');
    globalThis.window.innerWidth=1600;
    windowEvents.get('resize')();
    assert.equal(styles.get('--cerium-sidebar-width'),'420px');

    classes.add('sidebar-collapsed');
    events.get('pointerdown')({pointerId:8,isPrimary:true,button:0,preventDefault(){}});
    assert.equal(captured,null,'collapsed sidebar remains unaffected by dragging');
    classes.delete('sidebar-collapsed');

    events.get('dblclick')();
    assert.equal(storage.has(SIDEBAR_WIDTH_KEY),false);
    assert.equal(styles.get('--cerium-sidebar-width'),'224px');
    cleanup();
    assert.ok(!windowEvents.has('resize'));
  }finally{
    globalThis.window=oldWindow;
    globalThis.localStorage=oldStorage;
  }
});

test('landing ambience reaches every workspace page without recoloring functional cards',()=>{
  const landing=read('css/spatial.css');
  for(const hue of ['117,83,255','237,124,255','89,203,219']){
    assert.ok(landing.includes(hue),'landing glow missing '+hue);
    assert.ok(css.includes(hue),'workspace background missing landing glow '+hue);
  }
  assert.match(css, /linear-gradient\(180deg,#eef0f5 0%,#e3e7ee 100%\)/);
  assert.match(css, /\.app-page \.workspace \.content-scroll\s*\{[^}]*background:transparent!important;/);
  assert.match(css, /\.app-page \.workspace \.main-frame\s*\{[^}]*background:transparent!important;/);
  assert.match(css, /backdrop-filter:blur\(18px\)/);
  assert.ok(typography.includes('@import url("./workspace-layout.css");'));
  assert.ok(typography.indexOf('workspace-layout.css')>typography.indexOf('workspace-title-glow.css'));
  assert.ok(!html.includes('css/spatial.css'),'public stylesheet must not be imported into app');
  assert.doesNotMatch(css, /:is\(\.panel,\.metric\)|\.invoice-document|\.data-table/);
  assert.match(css, /@media print/);
  assert.doesNotMatch(css, /color-scheme:dark|background:#10131a/);
});
