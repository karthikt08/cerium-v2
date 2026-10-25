/* The Cerium magnetic ring; pointer precision and native text editing stay intact. */
(() => {
  const fine=matchMedia('(hover:hover) and (pointer:fine)'),reduce=matchMedia('(prefers-reduced-motion:reduce)');
  const root=document.documentElement,c=document.createElement('div');c.className='workspace-cursor';c.setAttribute('aria-hidden','true');
  const controls='a,button,[role="button"],input[type="checkbox"],summary';
  let x=-50,y=-50,cx=-50,cy=-50,w=14,h=14,r=7,target=null,prevTarget=null,targetRadius=10,frame=0,down=false,active=false;
  function hide(){active=false;c.classList.remove('visible');root.classList.remove('has-workspace-cursor');if(frame)cancelAnimationFrame(frame);frame=0;}
  function targetAtPointer(fromEl){
    const el=fromEl||document.elementFromPoint(x,y);if(!el)return;
    target=el.closest?el.closest(controls):null;
    const text=el.closest?el.closest('input:not([type="checkbox"]),textarea,select,[contenteditable="true"]'):null;
    c.classList.toggle('text-input',!!text);
    if(text)target=null;
    if(target!==prevTarget){
      prevTarget=target;
      targetRadius=target?Math.min(parseFloat(getComputedStyle(target).borderRadius)||7,20)+3:10;
    }
    const host=(el.closest&&el.closest('dialog[open]'))||document.body;
    if(c.parentNode!==host)host.append(c);
  }
  function draw(){
    frame=0;if(!active)return;let tx=x,ty=y,tw=14,th=14,tr=7;
    if(down){tw=th=11;tr=5.5;cx=x;cy=y;}
    else if(target?.isConnected){
      const b=target.getBoundingClientRect();
      if(b.width<=340&&b.height<=80){
        tx=b.left+b.width/2+(x-b.left-b.width/2)*.08;
        ty=b.top+b.height/2+(y-b.top-b.height/2)*.08;
        tw=b.width+6;th=b.height+6;
        tr=targetRadius;
      }
    }
    const k=target?.isConnected && !down ? .55 : .86;
    cx+=(tx-cx)*k;cy+=(ty-cy)*k;w+=(tw-w)*k;h+=(th-h)*k;r+=(tr-r)*k;
    c.style.width=w+'px';c.style.height=h+'px';c.style.borderRadius=r+'px';
    c.style.transform=`translate3d(${cx-w/2}px,${cy-h/2}px,0)`;
    c.classList.toggle('over-control',!!target&&!down);
    c.classList.toggle('pressed',down);
    if(Math.abs(tx-cx)+Math.abs(ty-cy)+Math.abs(tw-w)+Math.abs(th-h)>.1)frame=requestAnimationFrame(draw);
  }
  function request(){if(!frame)frame=requestAnimationFrame(draw);}
  addEventListener('pointermove',e=>{
    if(!fine.matches||reduce.matches||e.pointerType==='touch'){hide();return;}
    x=e.clientX;y=e.clientY;
    if(!active){cx=x;cy=y;active=true;document.body.append(c);}
    targetAtPointer(e.target);
    c.classList.add('visible');
    root.classList.add('has-workspace-cursor');
    root.style.setProperty('--cursor-x',(x/innerWidth-.5).toFixed(3));
    root.style.setProperty('--cursor-y',(y/innerHeight-.5).toFixed(3));
    request();
  },{passive:true});
  addEventListener('pointerdown',e=>{if(!active)return;x=e.clientX;y=e.clientY;down=true;request();},{passive:true});
  addEventListener('pointerup',()=>{down=false;if(active){targetAtPointer();request();}},{passive:true});
  addEventListener('pointercancel',()=>{down=false;hide();});addEventListener('blur',()=>{down=false;hide();});
  document.addEventListener('mouseleave',hide);document.addEventListener('keydown',e=>{if(e.key==='Tab')hide();});
  document.addEventListener('scroll',()=>{if(active){targetAtPointer();request();}},{passive:true,capture:true});
  fine.addEventListener('change',hide);reduce.addEventListener('change',hide);
  // A closing top-layer dialog must not leave the pointer ring behind it.
  new MutationObserver(()=>{if(active){targetAtPointer();request();}}).observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});
})();
