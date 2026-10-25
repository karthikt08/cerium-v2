// Scripts for the home page (kept outside index.html because the server blocks inline scripts).
// The preview data and the "who it's for" strip are written in index.html, so they show even if this file fails.
// This file only adds the interactive parts. It is a plain script (not a module), so it also runs if the file is opened directly.
(function(){
var $=function(s){return document.getElementById(s)};
var fm=function(v){return '$'+v.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})};
var st={ms:0,up:3840};
var T=[['Suggested match','Deposit of $2,110.00 yesterday → Invoice #1043'],['Matched.','Invoice #1043 is now marked paid.'],['No problem.','Nothing changes unless you confirm.']];

if($('td'))$('td').textContent=new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});

/* Live preview. Everything is updated in place, so no button or row is ever rebuilt under the mouse. */
function setMatch(){
  var m=st.ms===1,s=$('s43');
  $('m1').textContent=T[st.ms][0];$('m2').textContent=T[st.ms][1];
  $('ok').textContent=m?'Undo':'Confirm match';
  if(s){
    s.textContent=m?'Paid · matched':'Sent';
    s.className=m?'c g pop':'c b pop';
    setTimeout(function(){s.classList.remove('pop')},420);
  }
  var mc=document.querySelector('.mc');
  if(mc){
    if(m)mc.classList.add('matched');else mc.classList.remove('matched');
  }
}
function tw(to){
  var f=st.up,t0=performance.now();
  (function k(t){var p=Math.min(1,(t-t0)/800);st.up=f+(to-f)*(1-Math.pow(1-p,3));$('up').textContent=fm(st.up);if(p<1)requestAnimationFrame(k)})(t0);
}
if($('fl'))$('fl').addEventListener('change',function(e){
  var i=e.target;if(!i||i.type!=='checkbox')return;
  var tx=i.parentNode.querySelector('.tx');if(tx)tx.classList.toggle('d',i.checked);
  var fc=$('fc');
  if(fc){
    fc.textContent=$('fl').querySelectorAll('input:not(:checked)').length;
    fc.classList.remove('pulse');
    void fc.offsetWidth;
    fc.classList.add('pulse');
    setTimeout(function(){fc.classList.remove('pulse')},400);
  }
});
if($('ok'))$('ok').onclick=function(){st.ms=st.ms===1?0:1;setMatch();tw(st.ms===1?1730:3840)};
if($('no'))$('no').onclick=function(){st.ms=2;setMatch();tw(3840)};

/* Headings come alive when they scroll into view */
var rv=[].slice.call(document.querySelectorAll('[data-rv]'));
if('IntersectionObserver' in window&&rv.length){
  document.getElementById('pg').classList.add('rv-on');
  var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}})},{threshold:.35,rootMargin:'0px 0px -6% 0px'});
  rv.forEach(function(n){io.observe(n)});
}

/* Unified, zero-lag ambient parallax and chip drift on a single rAF tick */
if(matchMedia('(hover:hover) and (pointer:fine)').matches&&!matchMedia('(prefers-reduced-motion:reduce)').matches){
  var ambientFrame=0,mx=0,my=0,c1=$('c1'),c2=$('c2'),pg=$('pg')||document.documentElement;
  addEventListener('pointermove',function(e){
    if(e.pointerType==='touch')return;
    mx=(e.clientX/innerWidth-.5);
    my=(e.clientY/innerHeight-.5);
    if(!ambientFrame){
      ambientFrame=requestAnimationFrame(function(){
        ambientFrame=0;
        pg.style.setProperty('--px',mx.toFixed(3));
        pg.style.setProperty('--py',my.toFixed(3));
        if(c1)c1.style.transform='translate3d('+(mx*-24).toFixed(1)+'px,'+(my*-16).toFixed(1)+'px,0)';
        if(c2)c2.style.transform='translate3d('+(mx*22).toFixed(1)+'px,'+(my*14).toFixed(1)+'px,0)';
      });
    }
  },{passive:true});
}
})();
