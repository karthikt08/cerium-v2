import assert from 'node:assert/strict';
import {BUSINESS_SETUP_FIELDS,businessSetupSteps} from '../server/business-profile.js';

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
  await prepareBusiness(t,b,country);
  const response=await b.req('/api/business/setup/complete',{method:'POST',csrf:me.csrfToken,json:{confirmBusinessDetails:true,revision:(await (await b.req('/api/business/setup')).json()).revision}});
  assert.equal(response.status,200,await response.clone().text());
  return response.json();
}
export async function prepareBusiness(t,b,country,patch={}){
  const me=await b.me();country||=me.user.country;
  const data={...businessDetails(country),...patch};
  for(const step of businessSetupSteps(country).filter(step=>step!=='review')){
    const fields=Object.fromEntries(BUSINESS_SETUP_FIELDS[step].map(key=>[key,data[key]]));
    const response=await b.req('/api/business/setup',{method:'POST',csrf:me.csrfToken,json:{step,fields}});
    assert.equal(response.status,200,await response.clone().text());
  }
}
