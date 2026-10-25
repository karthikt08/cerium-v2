import API from './api.js';
import {COUNTRY_OPTIONS,validCountry,countryName,phonePlaceholder} from './countries.js';

const el=id=>document.getElementById(id);
const msg=el('message'),start=el('start-form'),check=el('code-form'),
  payment=el('mandate-panel'),phone=el('phone'),countrySelect=el('country');
let busy=false, mode='phone', details=null, initialized=false;
for(const country of COUNTRY_OPTIONS){
  const option=document.createElement('option');
  option.value=country.value;option.textContent=country.label+' (+'+country.callingCode+')';
  countrySelect.append(option);
}

function setMessage(text,isError=false){
  msg.textContent=text;
  msg.classList.toggle('error',isError);
}
function updatePreview(){
  const country=countrySelect.value;
  el('edition-preview').textContent=validCountry(country)
    ?countryName(country)+' · '+(country==='IN'?'₹500 INR/month':'$20 USD/month')+' after your 15-day trial.'
    :'Select your country to see your monthly price.';
  phone.placeholder=phonePlaceholder(country);
  el('country-confirm-text').textContent='I confirm my business is based in '+
    (validCountry(country)?countryName(country):'the selected country')+' and I control this number.';
  el('country-confirm').checked=false;
}
phone.addEventListener('input',updatePreview);
countrySelect.addEventListener('change',updatePreview);
function setBusy(on){
  busy=on;for(const b of document.querySelectorAll('button'))b.disabled=on;
  if(details?.verified&&!details.checkoutConfigured)el('mandate-button').disabled=true;
}
async function view(){
  const me=await API.getMe();
  if(!me.signedIn){location.replace('/login.html?returnTo='+encodeURIComponent('/app.html'));return;}
  details=await API.getBillingIdentity();
  if(!initialized){
    const country=details.pendingCountry||details.country;
    countrySelect.value=validCountry(country)?country:'';updatePreview();initialized=true;
  }
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
      el('mandate-info').textContent=countryName(details.country)+' · '+(details.country==='IN'?'₹500 INR/month':'$20 USD/month')+
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
  const country=countrySelect.value;
  if(!validCountry(country)){setMessage('Select your business country first.',true);return;}
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
    setMessage('Verified: '+countryName(out.country)+' · '+out.currency+'.');
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
    // Razorpay returns as soon as the hosted modal opens. Let customers retry
    // if they close it; only provider-confirmed authorization unlocks access.
    setBusy(false);
  }catch(err){setBusy(false);setMessage(err.message,true)}
});
updatePreview();
view().catch(err=>setMessage(err.message||'Could not load verification state.',true));
