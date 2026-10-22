/* Magnetic ring, trailing spotlight and card depth. Idle frames stop automatically. */
(() => {
  'use strict';
  if (window.__spCur) return;
  window.__spCur = true;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const pointer = matchMedia('(hover: hover) and (pointer: fine)');
  const root = document.documentElement;
  const cursor = document.createElement('div');
  cursor.className = 'sp-cur'; cursor.setAttribute('aria-hidden', 'true');
  let glow = document.getElementById('gl');
  if (!glow) { glow = document.createElement('div'); glow.className = 'gl'; glow.id = 'gl'; glow.innerHTML = '<i></i>'; glow.setAttribute('aria-hidden', 'true'); (document.getElementById('pg') || document.body).appendChild(glow); }
  const controls = 'a,button:not(:disabled),[role=button],summary,input[type=checkbox],input[type=radio]';
  const cards = '.kpi-card,.launch-card,.launch-stat,.cd,.kanban-card,.acard,.pcard';
  let frame = 0, hot = null, card = null, down = false, seen = false;
  let mouse = {x:-100,y:-100}, current = {x:-100,y:-100,w:14,h:14,r:7};
  function clearCard() { if (card) { card.style.removeProperty('--rx'); card.style.removeProperty('--ry'); card.style.removeProperty('--sx'); card.style.removeProperty('--sy'); card.classList.remove('pointer-lit'); } card = null; }
  function hide() { cancelAnimationFrame(frame); frame = 0; seen = false; hot = null; down = false; cursor.classList.remove('v','hv','dn'); glow.style.opacity = '0'; root.classList.remove('sp-on'); clearCard(); }
  function tick() {
    frame = 0;
    if (!seen || document.hidden || motion.matches || !pointer.matches) return;
    let target = {x:mouse.x,y:mouse.y,w:14,h:14,r:7};
    if (!down && hot?.isConnected) {
      const b = hot.getBoundingClientRect();
      if (b.width < 360 && b.height < 120) target = {x:b.left+b.width/2+(mouse.x-b.left-b.width/2)*.15,y:b.top+b.height/2+(mouse.y-b.top-b.height/2)*.15,w:b.width+8,h:b.height+8,r:Math.min(parseFloat(getComputedStyle(hot).borderRadius)+4 || 12,(b.height+8)/2)};
    }
    if (down) target = {x:mouse.x,y:mouse.y,w:10,h:10,r:5};
    let distance = 0;
    for (const k of ['x','y','w','h','r']) { const d = target[k]-current[k]; current[k] += d * (down ? 1 : .3); distance += Math.abs(d); }
    cursor.style.width = current.w+'px'; cursor.style.height = current.h+'px'; cursor.style.borderRadius = current.r+'px';
    cursor.style.transform = `translate3d(${current.x-current.w/2}px,${current.y-current.h/2}px,0)`;
    if (distance > .15) frame = requestAnimationFrame(tick);
  }
  function start() { if (!frame) frame = requestAnimationFrame(tick); }
  function move(e) {
    if (motion.matches || !pointer.matches || e.pointerType === 'touch') return;
    mouse = {x:e.clientX,y:e.clientY};
    const dialog = e.target.closest?.('dialog[open]');
    const parent = dialog || document.body;
    if (cursor.parentNode !== parent) parent.appendChild(cursor);
    if (!seen) { current.x=mouse.x; current.y=mouse.y; seen=true; root.classList.add('sp-on'); }
    const typing = !!e.target.closest?.('input:not([type=checkbox]):not([type=radio]),textarea,select,[contenteditable]');
    hot = !typing && !down ? e.target.closest?.(controls) : null;
    cursor.classList.toggle('v', !typing); cursor.classList.toggle('hv', !!hot);
    glow.style.opacity = dialog ? '0' : '1'; glow.style.transform = `translate3d(${mouse.x}px,${mouse.y}px,0)`;
    root.style.setProperty('--px',(mouse.x/innerWidth-.5).toFixed(3)); root.style.setProperty('--py',(mouse.y/innerHeight-.5).toFixed(3));
    const nextCard = e.target.closest?.(cards);
    if (card !== nextCard) { clearCard(); card=nextCard; }
    if (card) {
      const b=card.getBoundingClientRect(), x=(mouse.x-b.left)/b.width-.5, y=(mouse.y-b.top)/b.height-.5;
      card.classList.add('pointer-lit');
      card.style.setProperty('--rx',(-y*1.6).toFixed(2)+'deg'); card.style.setProperty('--ry',(x*1.6).toFixed(2)+'deg');
      card.style.setProperty('--sx',(-x*12).toFixed(1)+'px'); card.style.setProperty('--sy',(12-y*8).toFixed(1)+'px');
    }
    start();
  }
  addEventListener('pointermove',move,{passive:true});
  addEventListener('pointerdown',e=>{ if (!seen) return; down=true; mouse={x:e.clientX,y:e.clientY}; cursor.classList.add('dn'); start(); },{passive:true});
  addEventListener('pointerup',e=>{down=false;cursor.classList.remove('dn');move(e);},{passive:true});
  addEventListener('pointercancel',hide); addEventListener('blur',hide);
  document.addEventListener('mouseleave',hide); document.addEventListener('visibilitychange',()=>{if(document.hidden)hide();});
  document.addEventListener('scroll',()=>{hot=null;clearCard();start();},{passive:true,capture:true});
  document.addEventListener('close',()=>{hide();document.body.appendChild(cursor);},true);
  document.addEventListener('keydown',e=>{if(e.key==='Tab')hide();});
  motion.addEventListener('change',hide); pointer.addEventListener('change',hide);
  // Content is visible by default; reveal effects cannot leave a tab blank.
  document.querySelectorAll('[data-rv]').forEach(el=>el.classList.add('in'));
})();
