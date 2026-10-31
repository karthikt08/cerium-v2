/* Desktop-only, accessible sidebar resize. The grid owns the layout, so
   every workspace page automatically uses the space left after resizing.
   Local preference is private to the browser and never sent to the server. */
export const SIDEBAR_WIDTH_KEY='cerium.sidebar.width';
export const MIN_SIDEBAR_WIDTH=200;
export const MAX_SIDEBAR_WIDTH=420;
const MAIN_MIN_WIDTH=520;

export function clampSidebarWidth(width,viewportWidth){
  const viewport=Number.isFinite(Number(viewportWidth))?Number(viewportWidth):1440;
  const maximum=Math.max(MIN_SIDEBAR_WIDTH,Math.min(MAX_SIDEBAR_WIDTH,viewport-MAIN_MIN_WIDTH));
  const candidate=Number(width);
  const value=Number.isFinite(candidate)?Math.round(candidate):MIN_SIDEBAR_WIDTH;
  return Math.max(MIN_SIDEBAR_WIDTH,Math.min(maximum,value));
}

export function initializeSidebarResize({workspace,handle}){
  if(!workspace||!handle)return ()=>{};
  const desktop=()=>window.innerWidth>760;
  const fallback=()=>window.innerWidth<=1150?200:224;
  let saved=null;
  try{
    const raw=localStorage.getItem(SIDEBAR_WIDTH_KEY);
    const number=raw===null?NaN:Number(raw);
    if(Number.isFinite(number)&&number>=MIN_SIDEBAR_WIDTH&&number<=MAX_SIDEBAR_WIDTH)saved=number;
  }catch{}
  let preferred=saved;
  let activePointer=null;
  let currentWidth=0;
  const sync=()=>{
    const bound=Math.max(MIN_SIDEBAR_WIDTH,Math.min(MAX_SIDEBAR_WIDTH,window.innerWidth-MAIN_MIN_WIDTH));
    currentWidth=clampSidebarWidth(preferred??fallback(),window.innerWidth);
    workspace.style.setProperty('--cerium-sidebar-width',currentWidth+'px');
    handle.setAttribute('aria-valuemin',String(MIN_SIDEBAR_WIDTH));
    handle.setAttribute('aria-valuemax',String(bound));
    handle.setAttribute('aria-valuenow',String(currentWidth));
    handle.setAttribute('aria-valuetext',currentWidth+' pixels');
  };
  const setWidth=value=>{
    preferred=clampSidebarWidth(value,window.innerWidth);
    sync();
  };
  const save=()=>{
    if(preferred===null)return;
    try{localStorage.setItem(SIDEBAR_WIDTH_KEY,String(preferred));}catch{}
  };
  const endPointer=event=>{
    if(activePointer===null||event.pointerId!==activePointer)return;
    activePointer=null;
    workspace.classList.remove('sidebar-resizing');
    if(handle.hasPointerCapture?.(event.pointerId))handle.releasePointerCapture(event.pointerId);
    save();
  };
  const onPointerDown=event=>{
    if(!desktop()||workspace.classList.contains('sidebar-collapsed')||!event.isPrimary||event.button!==0)return;
    event.preventDefault();
    activePointer=event.pointerId;
    workspace.classList.add('sidebar-resizing');
    handle.setPointerCapture(event.pointerId);
  };
  const onPointerMove=event=>{
    if(event.pointerId!==activePointer)return;
    setWidth(event.clientX-workspace.getBoundingClientRect().left);
  };
  const onKeyDown=event=>{
    if(!desktop()||workspace.classList.contains('sidebar-collapsed'))return;
    const step=event.shiftKey?24:12;
    const next={
      ArrowLeft:()=>currentWidth-step,
      ArrowRight:()=>currentWidth+step,
      Home:()=>MIN_SIDEBAR_WIDTH,
      End:()=>MAX_SIDEBAR_WIDTH
    }[event.key];
    if(!next)return;
    event.preventDefault();
    setWidth(next());
    save();
  };
  const onDoubleClick=()=>{
    if(!desktop()||workspace.classList.contains('sidebar-collapsed'))return;
    preferred=null;
    try{localStorage.removeItem(SIDEBAR_WIDTH_KEY);}catch{}
    sync();
  };
  handle.addEventListener('pointerdown',onPointerDown);
  handle.addEventListener('pointermove',onPointerMove);
  handle.addEventListener('pointerup',endPointer);
  handle.addEventListener('pointercancel',endPointer);
  handle.addEventListener('lostpointercapture',event=>{
    if(activePointer===event.pointerId){
      activePointer=null;
      workspace.classList.remove('sidebar-resizing');
      save();
    }
  });
  handle.addEventListener('keydown',onKeyDown);
  handle.addEventListener('dblclick',onDoubleClick);
  window.addEventListener('resize',sync);
  sync();
  return ()=>{
    handle.removeEventListener('pointerdown',onPointerDown);
    handle.removeEventListener('pointermove',onPointerMove);
    handle.removeEventListener('pointerup',endPointer);
    handle.removeEventListener('pointercancel',endPointer);
    handle.removeEventListener('keydown',onKeyDown);
    handle.removeEventListener('dblclick',onDoubleClick);
    window.removeEventListener('resize',sync);
  };
}
