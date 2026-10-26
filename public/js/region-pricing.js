import {billingPlan} from './countries.js';
const paintAnnual=plan=>{
  if(!plan)return;
  const symbol=plan.currency==='INR'?'₹':String.fromCharCode(36);
  for(const el of document.querySelectorAll('[data-region-annual-price]'))el.textContent=symbol+(plan.monthlyPrice*11);
  for(const el of document.querySelectorAll('[data-region-annual-savings]'))el.textContent=symbol+plan.monthlyPrice;
};
// Public prices are suggested by the backend. For an already signed-in user,
// show the account's stored billing edition rather than their current IP.
// Checkout ALWAYS validates currency and price server-side.
(async function(){
  try {
    const session=await fetch('/api/me',{credentials:'same-origin',cache:'no-store'});
    const account=session.ok?await session.json():null;
    let country=account?.signedIn&&account.user?.country||null;
    if(!country){
      const response=await fetch('/api/region',{credentials:'same-origin',cache:'no-store'});
      if(!response.ok)return;
      const region=await response.json();
      country=region.country;
    }
    if(typeof country!=='string'||!/^[A-Z]{2}$/.test(country))return; // Local anonymous preview uses default copy.
    const plan=billingPlan(country);
    if(picker?.value)return; // A visitor's explicit preview wins over a late network response.
    const monthly=(plan.currency==='INR'?'₹':'$')+plan.monthlyPrice;
    paintAnnual(plan);
    for(const element of document.querySelectorAll('[data-region-price]'))
      element.textContent=monthly;
    for(const element of document.querySelectorAll('[data-region-description]'))
      element.textContent=country==='IN'?'India price · INR billing':plan.discountPercent?plan.discountPercent+'% country discount · USD billing':'Standard price · USD billing';
  }catch {
    // Cosmetic only. No payment amount may come from browser content.
  }
})();

const picker=document.getElementById('pricing-country');
if(picker){
  const {COUNTRY_OPTIONS,priceLabel}=await import('./countries.js');
  for(const country of COUNTRY_OPTIONS){const option=document.createElement('option');option.value=country.value;option.textContent=country.label;picker.append(option);}
  picker.addEventListener('change',()=>{
    const plan=billingPlan(picker.value);if(!plan)return;
    paintAnnual(plan);
    for(const element of document.querySelectorAll('[data-region-price]'))element.textContent=(plan.currency==='INR'?'₹':'$')+plan.monthlyPrice;
    for(const element of document.querySelectorAll('[data-region-description]'))element.textContent='Country price preview · '+plan.currency+' billing';
    document.getElementById('country-price-result').textContent=priceLabel(picker.value)+'/month'+(plan.discountPercent?' · '+plan.discountPercent+'% off the $20 standard price':'')+'. Same features in every country. Confirmed at business setup.';
  });
}
