import API from './api.js';

const el=id=>document.getElementById(id);
const msg=el('message'),start=el('start-form'),check=el('code-form'),
  payment=el('mandate-panel'),phone=el('phone');
let busy=false, mode='phone', candidate=null, details=null;

function setMessage(text,isError=false){
  msg.textContent=text;
  msg.classList.toggle('error',isError);
}
function detect(raw) {
  const digits=String(raw||'').replace(/[\s().-]/g,'');
  if(/^\+91[6-9][0-9]{9}$/.test(digits))return 'IN';
  if(/^\+1[2-9][0-9]{9}$/.test(digits))return 'US';
  return null;
}
function updatePreview(){
  candidate=detect(phone.value);
  const label=candidate==='IN'?'India · INR · ₹500/month':candidate==='US'?'US · USD · $20/month':'Enter a valid +91 Indian mobile number or +1 US number.';
  el('edition-preview').textContent=candidate?'Proposed edition: '+label:label;
  el('country-confirm-text').textContent=candidate==='IN'
    ?'I confirm my business is based in India and I control this mobile number.'
    :candidate==='US'
      ?'I confirm my business is based in the United States and I control this number (not Canada or another +1 territory).'
      :'I confirm my business is based in the selected country and I control this number.';
  el('country-confirm').checked=false;
}
phone.addEventListener('input',updatePreview);
function setBusy(on){busy=on;for(const b of document.querySelectorAll('button'))b.disabled=on;}
async function view(){
  const me=await API.getMe();
  if(!me.signedIn){location.replace('/login.html?returnTo='+encodeURIComponent('/app.html'));return;}
  details=await API.getBillingIdentity();
  mode=details.accessMode||'phone';
  if(details.workspaceUnlocked){location.replace('/app.html');return;}
  start.hidden=Boolean(details.verified);
  check.hidden=!details.pending;
  payment.hidden=!(details.verified&&mode==='phone_and_mandate');
  if(details.verified&&mode==='phone_and_mandate'){
    if(!details.checkoutConfigured){
      el('mandate-button').disabled=true;
      setMessage('Your phone is verified. Paid trial authorization is not yet available for this edition; contact CERIUM support.');
    }else{
      el('mandate-button').disabled=false;
      el('mandate-info').textContent=(details.country==='IN'?'India edition · ₹500/month':'US edition · $20/month')+
        '. Authorize the mandate now; the first monthly charge is scheduled after the remaining 15-day trial period.';
      setMessage('Phone confirmed. One final step: authorize your payment method.');
    }
    return;
  }
  if(!details.providerReady){
    start.hidden=true;
    setMessage('Phone verification is not configured on this server. Contact CERIUM support. Workspace access is not enabled yet.',true);
    return;
  }
  if(details.verified){setMessage('Phone confirmed. Preparing your workspace…');location.replace('/app.html');return;}
  setMessage(details.mode==='development'?'Local test: SMS is simulated. Use code 000000 after requesting it.':'Phone verification is required before opening your workspace.');
}
start.addEventListener('submit',async e=>{
  e.preventDefault();if(busy)return;
  const country=detect(phone.value);
  if(!country){setMessage('Enter a supported Indian or US phone number first.',true);return;}
  if(!el('country-confirm').checked){setMessage('Confirm your actual business country first.',true);return;}
  setBusy(true);
  try{
    const out=await API.startBillingPhone(phone.value,true,country);
    await view();
    setMessage(out.mode==='development'?'Local test: enter code 000000.':'Code requested for '+out.phoneMasked+'.');
    el('code')?.focus();
  }catch(err){setMessage(err.message||'Unable to send a code.',true)}
  finally{setBusy(false)}
});
check.addEventListener('submit',async e=>{
  e.preventDefault();if(busy)return;
  setBusy(true);
  try{
    const out=await API.verifyBillingPhone(el('code').value.trim());
    setMessage('Verified: '+(out.country==='IN'?'India · INR':'United States · USD')+'.');
    await view();
  }catch(err){setMessage(err.message||'Unable to verify the code.',true)}
  finally{setBusy(false)}
});
el('mandate-button').addEventListener('click',async()=>{
  if(busy)return;
  const checkout=window.CeriumBilling?.startSubscriptionCheckout;
  if(typeof checkout!=='function'){setMessage('Secure checkout is not available. Refresh and try again.',true);return;}
  setBusy(true);
  try{
    await checkout({
      onComplete:async()=>{setBusy(false);try{await view()}catch(err){setMessage(err.message,true)}},
      onError:err=>{setBusy(false);setMessage(err.message||'Mandate authorization was not completed.',true)}
    });
  }catch(err){setBusy(false);setMessage(err.message,true)}
});
updatePreview();
view().catch(err=>setMessage(err.message||'Could not load verification state.',true));