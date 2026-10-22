// Scripts for the contact page (moved out of contact.html so the page can block inline scripts).
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
