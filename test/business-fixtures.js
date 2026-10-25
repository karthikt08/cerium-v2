import assert from 'node:assert/strict';

export const businessDetails=(country='US')=>({
  name:'Test Owner',businessName:'Example Services',trade:'Repairs',businessEmail:'business@example.com',
  businessAddress:'12 Example Street',businessCity:'Example City',businessRegion:'',
  businessPostalCode:country==='IN'?'600001':country==='US'?'94105':'',
  country,timeZone:country==='IN'?'Asia/Kolkata':country==='US'?'America/Los_Angeles':'UTC',
  usState:country==='US'?'CA':'',indiaState:country==='IN'?'33':'',
  gstRegistration:country==='IN'?'not_registered':'',gstin:'',confirmBusinessDetails:true
});
export async function completeBusiness(t,b,country){
  const me=await b.me();country||=me.user.country;
  const response=await b.req('/api/business/profile',{method:'POST',csrf:me.csrfToken,json:businessDetails(country)});
  assert.equal(response.status,200,await response.clone().text());
  return response.json();
}
