/* CERIUM workspace entry. The animation never grants authentication or access. */
(function () {
  'use strict';
  const scene=document.querySelector('[data-cerium-entry]');
  if(!scene||scene.hidden)return;
  const skip=scene.querySelector('[data-entry-skip]'),retry=scene.querySelector('[data-entry-retry]');
  const caption=scene.querySelector('.entry-caption'),mode=scene.dataset.ceriumEntry;
  const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches||false;
  const validNext=value=>{
    if(!value||!value.startsWith('/')||value.startsWith('//'))return '/app.html';
    try{
      const u=new URL(value,location.origin);
      return u.origin===location.origin&&['/app', '/app.html'].includes(u.pathname)?u.pathname+u.search+u.hash:'/app.html';
    }catch{return '/app.html';}
  };
  const next=validNext(new URLSearchParams(location.search).get('next'));
  let handoff=false;
  if(mode==='workspace'){
    const current=new URL(location.href);
    if(current.searchParams.has('ceriumIntro')){
      try{
        const referrer=new URL(document.referrer);
        handoff=current.searchParams.get('ceriumIntro')==='done'&&referrer.origin===location.origin&&referrer.pathname==='/enter.html'&&
          performance.getEntriesByType('navigation')[0]?.type==='navigate';
      }catch{}
      current.searchParams.delete('ceriumIntro');
      history.replaceState(history.state,'',current.pathname+current.search+current.hash);
    }
  }
  const workspace=document.querySelector('#workspace'),skipLink=document.querySelector('.skip-link');
  const wasInert=workspace?.inert||false,linkWasInert=skipLink?.inert||false;
  if(workspace)workspace.inert=true;
  if(skipLink)skipLink.inert=true;
  let ready=false,introDone=handoff||reduced,finished=false,introTimer,workspaceTimer;
  function restore(){
    scene.hidden=true;
    if(workspace)workspace.inert=wasInert;
    if(skipLink)skipLink.inert=linkWasInert;
    if(scene.contains(document.activeElement)){
      const target=document.querySelector(workspace&&!workspace.hidden?'#workspace-main':'#business-step-title')||document.querySelector('#retry-workspace-entry');
      target?.focus();
    }
  }
  function exit(){
    if(finished||!ready||!introDone)return;
    finished=true;clearTimeout(introTimer);clearTimeout(workspaceTimer);
    window.removeEventListener('cerium:workspace-ready',onReady);
    if(mode==='redirect'){
      // One navigation marker avoids replaying the intro. It contains no user data,
      // is consumed immediately, and never bypasses the app's readiness checks.
      const target=new URL(next,location.origin);target.searchParams.set('ceriumIntro','done');
      location.replace(target.pathname+target.search+target.hash);
    }else{
      scene.classList.add('is-leaving');setTimeout(restore,reduced||handoff?0:260);
    }
  }
  function schedule(){
    if(!ready||!introDone||finished)return;
    
    exit();
  }
  function finishIntro(instant=false){
    introDone=true;clearTimeout(introTimer);
    if(instant)scene.classList.add('entry-instant');
    schedule();
  }
  function complete(){ready=true;clearTimeout(workspaceTimer);schedule();}
  function fail(){ready=true;introDone=true;scene.classList.add('entry-instant');schedule();}
  function onReady(){
    if(window.CeriumWorkspaceReady==='ready')complete();
    else if(window.CeriumWorkspaceReady==='failed')fail();
  }
  skip?.addEventListener('click',()=>{
    finishIntro(true);
    if(!ready&&mode==='workspace')caption.textContent='Finishing workspace setup…';
  });
  retry?.addEventListener('click',()=>location.reload());
  if(mode==='workspace'){
    window.CeriumEntryLoader={complete,fail};
    window.addEventListener('cerium:workspace-ready',onReady);
    workspaceTimer=setTimeout(()=>{
      if(ready||finished)return;
      caption.textContent='Opening your workspace is taking longer. Check your connection and try again.';
      if(retry)retry.hidden=false;
      finishIntro(true); // Keep the cover in place until the application is ready.
    },12000);
    onReady(); // Initialization may have finished before this deferred script loaded.
  }
  if(introDone)finishIntro(true);
  else introTimer=setTimeout(()=>finishIntro(),1600);
  if(mode==='redirect'){
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),7000);
    Promise.resolve().then(()=>fetch('/api/me',{credentials:'same-origin',cache:'no-store',signal:controller.signal}))
      .then(res=>{if(!res.ok)throw new Error('Session unavailable');return res.json();})
      .then(me=>{
        if(!me.signedIn){finished=true;clearTimeout(introTimer);location.replace('/login.html?returnTo='+encodeURIComponent(next));return;}
        complete();
      })
      .catch(()=>{ready=true;introDone=true;schedule();})
      .finally(()=>clearTimeout(timeout));
  }
})();
