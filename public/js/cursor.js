/* Cerium spatial cursor + panel depth. Replaces the old cursor.js. */
(()=>{
if(window.__spCur||!matchMedia('(hover:hover) and (pointer:fine)').matches)return;
window.__spCur=1;
const rm=matchMedia('(prefers-reduced-motion:reduce)').matches;
const root=document.documentElement,c=document.createElement('div');
c.className='sp-cur';c.setAttribute('aria-hidden','true');
const S='a,button,[role=button],summary,label[for],select,input[type=submit],input[type=checkbox],input[type=radio]';
const T='input:not([type=submit]):not([type=checkbox]):not([type=radio]),textarea';
const P='a.cd,a.acard,a.panel,[role=button].cd,[role=button].acard,[role=button].panel,.brief-preview-card[role=button]';
let m={x:-99,y:-99},cur={x:-99,y:-99,w:12,h:12,r:6},tg={x:-99,y:-99,w:12,h:12,r:6},hot=null,tilt=null,seen=false;
const clear=p=>{p.style.removeProperty('--rx');p.style.removeProperty('--ry');p.style.setProperty('--hl',0)};
function aim(){
  if(hot&&hot.isConnected){
    const r=hot.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;
    const br=parseFloat(getComputedStyle(hot).borderRadius)||10;
    tg={x:cx+(m.x-cx)*.12,y:cy+(m.y-cy)*.12,w:r.width+10,h:r.height+10,r:Math.min(br+6,(r.height+10)/2)};
  }
}
function loop(){
  if(hot&&hot.isConnected){
    aim();
    const k=rm?1:.35;
    for(const a of ['x','y','w','h','r'])cur[a]+=(tg[a]-cur[a])*k;
  }else if(c.classList.contains('tx')){
    cur.x=m.x;cur.y=m.y;cur.w=2;cur.h=24;cur.r=1;
  }else{
    /* On non-clickable elements: zero budge, zero drift, zero lag */
    cur.x=m.x;cur.y=m.y;cur.w=12;cur.h=12;cur.r=6;
  }
  c.style.width=cur.w+'px';c.style.height=cur.h+'px';c.style.borderRadius=cur.r+'px';
  c.style.transform=`translate3d(${cur.x-cur.w/2}px,${cur.y-cur.h/2}px,0)`;
  requestAnimationFrame(loop);
}
addEventListener('pointermove',e=>{
  m.x=e.clientX;m.y=e.clientY;
  if(!seen){seen=true;cur.x=tg.x=m.x;cur.y=tg.y=m.y;document.body.appendChild(c);root.classList.add('sp-on');loop();}
  c.classList.add('v');
  root.style.setProperty('--px',(m.x/innerWidth-.5).toFixed(3));
  root.style.setProperty('--py',(m.y/innerHeight-.5).toFixed(3));
  const t=e.target;if(!t.closest)return;
  const tx=t.closest(T),h=tx?null:t.closest(S);
  c.classList.toggle('dk',!!t.closest('.en'));
  c.classList.toggle('tx',!!tx);
  c.classList.toggle('hv',!!h);
  hot=h;
  if(!h&&!tx){
    tg.x=m.x;tg.y=m.y;tg.w=12;tg.h=12;tg.r=6;
    cur.x=m.x;cur.y=m.y;cur.w=12;cur.h=12;cur.r=6;
  }
  const p=t.closest(P);
  if(p!==tilt){if(tilt)clear(tilt);tilt=p;if(p)p.style.setProperty('--hl',1)}
  if(p&&!rm){
    const r=p.getBoundingClientRect(),x=(m.x-r.left)/r.width,y=(m.y-r.top)/r.height,d=r.width>600?1.6:4.5;
    p.style.setProperty('--mx',x*100+'%');p.style.setProperty('--my',y*100+'%');
    p.style.setProperty('--ry',((x-.5)*d).toFixed(2)+'deg');p.style.setProperty('--rx',((.5-y)*d).toFixed(2)+'deg');
  }
},{passive:true});
addEventListener('pointerdown',()=>c.classList.add('dn'));
addEventListener('pointerup',()=>c.classList.remove('dn'));
document.addEventListener('mouseleave',()=>{c.classList.remove('v');if(tilt){clear(tilt);tilt=null}});
})();
