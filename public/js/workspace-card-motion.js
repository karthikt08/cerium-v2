/* Landing-card reveal animation for Cerium's dynamically rendered workspace.
   Unlike landing home.js, the app replaces #page-body on navigation and refresh.
   Observe the workspace's own scrolling area and register new cards after renders.
   Leave forms, dialogs, invoices and dense table rows entirely alone. */
(() => {
  'use strict';
  const scrollRoot=document.getElementById('workspace-main');
  const host=document.getElementById('page-body');
  if(!scrollRoot||!host)return;

  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  const cardSelector=[
    ':scope > .overview-stage',
    '.metrics-grid > .metric',
    '.dashboard-grid > .panel',
    '.settings-grid .panel',
    '.jobs-stats > .jobs-stat',
    '.jobs-panel',
    '.jobs-bottom > .panel',
    '.quote-cards > .quote-card',
    '.board-column > .lead-card',
    '.reminders-stats > div',
    '.reminders-columns > .panel',
    '.overview-tools',
    '.overview-tool-links > .overview-tool-link',
    ':scope > .panel'
  ].join(',');
  let observer=null;
  let scheduled=false;
  const pending=new Set();

  const enabled=()=>('IntersectionObserver' in window)&&!reduced.matches;

  function reveal(card){
    card.classList.add('cerium-card-in');
    observer?.unobserve(card);
    pending.delete(card);
  }

  function disable(){
    if(observer)observer.disconnect();
    observer=null;
    for(const card of pending)reveal(card);
    pending.clear();
  }

  function register(){
    scheduled=false;
    if(!enabled()){disable();return;}
    if(!observer){
      observer=new IntersectionObserver(entries=>{
        for(const entry of entries)if(entry.isIntersecting)reveal(entry.target);
      },{root:scrollRoot,threshold:0.08,rootMargin:'0px 0px -12px 0px'});
    }
    // Retire nodes removed by a route change. The observer must not keep old
    // customer cards alive after the current page is replaced.
    for(const card of pending){
      if(!card.isConnected){
        observer.unobserve(card);
        pending.delete(card);
      }
    }
    const order=new Map();
    for(const card of host.querySelectorAll(cardSelector)){
      if(card.closest('dialog,[role="dialog"],.table-scroll,.data-table'))continue;
      if(card.classList.contains('cerium-card-reveal'))continue;
      const parent=card.parentElement;
      const i=order.get(parent)||0;
      order.set(parent,i+1);
      card.style.setProperty('--cerium-card-index',Math.min(i,5));
      card.classList.add('cerium-card-reveal');
      pending.add(card);
      observer.observe(card);
    }
  }

  function queue(){
    if(!scheduled){scheduled=true;requestAnimationFrame(register);}
  }

  // App.js re-renders page-body on every section change, refresh and update.
  // Watching child lists (not attributes) avoids retriggering the animation.
  const changes=new MutationObserver(records=>{
    if(records.some(record=>record.addedNodes.length))queue();
  });
  changes.observe(host,{childList:true,subtree:true});

  host.addEventListener('focusin',event=>{
    const card=event.target.closest?.('.cerium-card-reveal:not(.cerium-card-in)');
    if(card)reveal(card);
  });
  reduced.addEventListener('change',()=>{if(reduced.matches)disable();else queue();});
  queue();
})();
