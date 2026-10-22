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
let m={x:-99,y:-99},cur={x:-99,y:-99,w:14,h:14,r:7},tg={x:-99,y:-99,w:14,h:14,r:7},hot=null,tilt=null,seen=false,isDown=false;
const clear=p=>{p.style.removeProperty('--rx');p.style.removeProperty('--ry');p.style.setProperty('--hl',0)};

function aim(){
  if(hot&&hot.isConnected&&!isDown){
    const r=hot.getBoundingClientRect();
    const cx=r.left+r.width/2;
    const cy=r.top+r.height/2;
    const br=parseFloat(getComputedStyle(hot).borderRadius)||12;
    if(r.width<=360&&r.height<=120){
      // Interactive morphing magnetic capsule wrapping the hovered element
      tg={
        x:cx+(m.x-cx)*.25,
        y:cy+(m.y-cy)*.25,
        w:r.width+10,
        h:r.height+10,
        r:Math.min(br+5,(r.height+10)/2)
      };
    }else{
      // Smooth spatial lens on large panels/cards
      tg={x:m.x,y:m.y,w:48,h:48,r:24};
    }
  }
}

function loop(){
  if(isDown){
    // When clicking or dragging: 100% 1:1 precision directly under pointer, zero displacement, zero northwest pull
    cur.x=m.x;cur.y=m.y;cur.w=12;cur.h=12;cur.r=6;
  }else if(hot&&hot.isConnected){
    aim();
    const k=rm?1:.38;
    for(const a of ['x','y','w','h','r'])cur[a]+=(tg[a]-cur[a])*k;
  }else{
    const k=rm?1:.65;
    tg={x:m.x,y:m.y,w:14,h:14,r:7};
    for(const a of ['x','y','w','h','r'])cur[a]+=(tg[a]-cur[a])*k;
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
  const gl=document.getElementById('gl'),rg=document.getElementById('rg');
  if(gl){gl.style.transform=`translate3d(${m.x}px,${m.y}px,0)`;gl.style.opacity='1';}
  if(rg){rg.style.transform=`translate3d(${m.x}px,${m.y}px,0)`;rg.style.opacity='1';}
  const t=e.target;if(!t.closest)return;
  const isInput=!!t.closest(T);
  c.classList.toggle('hide',isInput);
  const h=(isInput||isDown)?null:t.closest(S);
  c.classList.toggle('dk',!!t.closest('.en'));
  c.classList.toggle('hv',!!h);
  hot=h;
  if(!h){
    tg.x=m.x;tg.y=m.y;tg.w=14;tg.h=14;tg.r=7;
  }
  const p=t.closest(P);
  if(p!==tilt){if(tilt)clear(tilt);tilt=p;if(p)p.style.setProperty('--hl',1)}
  if(p&&!rm&&!isDown){
    const r=p.getBoundingClientRect(),x=(m.x-r.left)/r.width,y=(m.y-r.top)/r.height,d=r.width>600?1.2:3;
    p.style.setProperty('--mx',x*100+'%');p.style.setProperty('--my',y*100+'%');
    p.style.setProperty('--ry',((x-.5)*d).toFixed(2)+'deg');p.style.setProperty('--rx',((.5-y)*d).toFixed(2)+'deg');
  }
},{passive:true});

addEventListener('pointerdown',e=>{
  isDown=true;
  if(e&&typeof e.clientX==='number'){m.x=e.clientX;m.y=e.clientY;}
  hot=null;
  c.classList.remove('hv');
  c.classList.add('dn');
  cur.x=tg.x=m.x;cur.y=tg.y=m.y;
  const ri=document.getElementById('ri');
  if(ri)ri.classList.add('bg');
});
addEventListener('pointerup',e=>{
  isDown=false;
  if(e&&typeof e.clientX==='number'){m.x=e.clientX;m.y=e.clientY;}
  c.classList.remove('dn');
  const ri=document.getElementById('ri');
  if(ri)ri.classList.remove('bg');
  const t=e?e.target:document.elementFromPoint(m.x,m.y);
  if(t&&t.closest){
    const isInput=!!t.closest(T);
    c.classList.toggle('hide',isInput);
    const h=isInput?null:t.closest(S);
    c.classList.toggle('hv',!!h);
    hot=h;
  }
});
addEventListener('pointercancel',()=>{
  isDown=false;
  c.classList.remove('dn');
  const ri=document.getElementById('ri');
  if(ri)ri.classList.remove('bg');
});
window.addEventListener('blur',()=>{
  isDown=false;
  c.classList.remove('dn');
  const ri=document.getElementById('ri');
  if(ri)ri.classList.remove('bg');
});
document.addEventListener('mouseleave',()=>{
  c.classList.remove('v');
  isDown=false;
  c.classList.remove('dn');
  if(tilt){clear(tilt);tilt=null}
  const gl=document.getElementById('gl'),rg=document.getElementById('rg');
  if(gl)gl.style.opacity='0';
  if(rg)rg.style.opacity='0';
});

/* Staggered scroll entrance reveals for [data-rv] elements across all pages */
if(typeof document!=='undefined'&&'IntersectionObserver' in window){
  const rvElements=[].slice.call(document.querySelectorAll('[data-rv]'));
  const pgElem=document.getElementById('pg')||document.body;
  if(rvElements.length&&pgElem){
    pgElem.classList.add('rv-on');
    const io=new IntersectionObserver(entries=>{
      entries.forEach(entry=>{
        if(entry.isIntersecting){
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    },{threshold:0.18,rootMargin:'0px 0px -6% 0px'});
    rvElements.forEach(el=>io.observe(el));
  }
}
})();
