// Scripts for the contact page (moved out of contact.html so the page can block inline scripts).
(function(){
  var gl=document.getElementById('gl'),rg=document.getElementById('rg'),ri=document.getElementById('ri');
  if(!matchMedia('(hover:hover)').matches||matchMedia('(prefers-reduced-motion:reduce)').matches)return;
  var q=0,p;
  addEventListener('mousemove',function(e){p=e;if(q)return;q=requestAnimationFrame(function(){
    q=0;var t='translate('+p.clientX+'px,'+p.clientY+'px)';
    gl.style.transform=t;rg.style.transform=t;gl.style.opacity=1;rg.style.opacity=1;
    ri.className=(p.target.closest&&p.target.closest('a,button,label'))?'bg':'';
  })});
  document.documentElement.addEventListener('mouseleave',function(){gl.style.opacity=0;rg.style.opacity=0});
})();
/* Contact form: opens the visitor's email app with the message ready. */
(function(){
  var f=document.getElementById('cf'),s=document.getElementById('fs');
  if(!f)return;
  f.addEventListener('submit',function(e){
    e.preventDefault();
    var d=new FormData(f),to=f.getAttribute('action').replace('mailto:','');
    var subject='Cerium: '+d.get('topic');
    var body='Name: '+d.get('name')+'\r\nEmail: '+d.get('email')+'\r\n\r\n'+d.get('message');
    window.location.href='mailto:'+to+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body);
    s.textContent='Your email app should open with your message ready. If nothing happens, write to '+to+'.';
    s.hidden=false;
  });
})();
