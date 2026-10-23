// Displays the server-approved regional price; the browser never chooses billing.
// Server-side /api/billing/subscription validates the actual Razorpay plan.
(async function(){
  try {
    const response=await fetch('/api/region',{credentials:'same-origin',cache:'no-store'});
    if(!response.ok)return; // the server may be restricting access.
    const region=await response.json();
    if(!region.country)return; // Local development: no inferred country.
    const monthly=region.country==='IN'?'₹500':'$20';
    for(const element of document.querySelectorAll('[data-region-price]'))
      element.textContent=monthly;
    for(const element of document.querySelectorAll('[data-region-description]'))
      element.textContent=region.country==='IN'?'India edition · INR billing':'US edition · USD billing';
  } catch {
    // Display only; checkout never trusts this value.
  }
})();
