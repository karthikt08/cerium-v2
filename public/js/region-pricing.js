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
    if(!['US','IN'].includes(country))return; // Local anonymous preview uses default copy.
    const monthly=country==='IN'?'₹500':'$20';
    for(const element of document.querySelectorAll('[data-region-price]'))
      element.textContent=monthly;
    for(const element of document.querySelectorAll('[data-region-description]'))
      element.textContent=country==='IN'?'India edition · INR billing':'US edition · USD billing';
  }catch {
    // Cosmetic only. No payment amount may come from browser content.
  }
})();
