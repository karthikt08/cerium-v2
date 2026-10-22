// Scripts for the home page (moved out of index.html so the page can block inline scripts).
(function(){
var $=function(s){return document.getElementById(s)};
var st={ms:0,up:3840,done:[false,false]};
var fm=function(v){return '$'+v.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})};
var F=[['Maria G.','Faucet quote · 10:30 AM'],['Dan’s Diner','Water heater estimate · 1:00 PM']];
var T=[['Suggested match','Deposit of $2,110.00 yesterday → Invoice #1043'],['Matched.','Invoice #1043 is now marked paid.'],['No problem.','Nothing changes unless you confirm.']];
var TR=['Plumbers','Electricians','Landscapers','House cleaners','Painters','HVAC techs','Handymen','Movers','Photographers','Pet groomers'];
$('td').textContent=new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
$('mq').innerHTML=TR.concat(TR).map(function(t){return '<span>'+t+'</span>'}).join('');
function draw(){
  var m=st.ms===1;
  $('fl').innerHTML=F.map(function(f,i){return '<label><input type="checkbox" data-i="'+i+'"'+(st.done[i]?' checked':'')+'><span class="tx'+(st.done[i]?' d':'')+'">'+f[0]+'<small>'+f[1]+'</small></span></label>'}).join('');
  $('fc').textContent=st.done.filter(function(d){return !d}).length;
  $('il').innerHTML=[['#1041 Rivera','$1,250.00','Overdue','c o'],['#1042 Patel','$480.00','Sent','c b'],['#1043 Lindqvist','$2,110.00',m?'Paid · matched':'Sent',m?'c g':'c b'],['#1044 Okafor','$95.00','Paid · manual','c']].map(function(r){return '<p><span>'+r[0]+'</span><b>'+r[1]+'</b><em class="'+r[3]+'">'+r[2]+'</em></p>'}).join('');
  $('m1').textContent=T[st.ms][0];$('m2').textContent=T[st.ms][1];$('ok').textContent=m?'Undo':'Confirm match';
}
function tw(to){var f=st.up,t0=performance.now();(function k(t){var p=Math.min(1,(t-t0)/800);st.up=f+(to-f)*(1-Math.pow(1-p,3));$('up').textContent=fm(st.up);if(p<1)requestAnimationFrame(k)})(t0)}
$('fl').addEventListener('change',function(e){var i=e.target.dataset.i;st.done[i]=!st.done[i];draw()});
$('ok').onclick=function(){st.ms=st.ms===1?0:1;draw();tw(st.ms===1?1730:3840)};
$('no').onclick=function(){st.ms=2;draw();tw(3840)};
draw();
if(matchMedia('(hover:hover)').matches&&!matchMedia('(prefers-reduced-motion:reduce)').matches){
  var q=0,p;
  addEventListener('mousemove',function(e){p=e;if(q)return;q=requestAnimationFrame(function(){
    q=0;var x=p.clientX,y=p.clientY,px=x/innerWidth-.5,py=y/innerHeight-.5,t='translate('+x+'px,'+y+'px)';
    $('gl').style.transform=t;$('rg').style.transform=t;$('gl').style.opacity=1;$('rg').style.opacity=1;
    $('ri').className=(p.target.closest&&p.target.closest('a,button,label'))?'bg':'';
    $('mk').style.transform='perspective(1100px) rotateY('+px*10+'deg) rotateX('+(-py*8)+'deg)';
    $('c1').style.transform='translate('+px*-34+'px,'+py*-22+'px)';
    $('c2').style.transform='translate('+px*30+'px,'+py*20+'px)';
  })});
  document.documentElement.addEventListener('mouseleave',function(){$('gl').style.opacity=0;$('rg').style.opacity=0});
}
})();
