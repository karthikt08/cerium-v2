import {validCountry} from './countries.js';
import {validIndianState,validGSTIN} from './india-market.js';
import {validUsState,validUsZip,validUsTimeZone,validBusinessTimeZone} from './us-market.js';

export class BusinessProfileError extends Error {
  constructor(fields){
    super(Object.values(fields)[0]||'Complete your business details.');
    this.code='invalid_business_profile';this.status=400;this.fields=fields;
  }
}

export function profileFromUser(user){
  if(!user)return null;
  return {
    name:user.name||'',businessName:user.business_name||'',trade:user.trade||'',
    businessEmail:user.business_email||user.email||'',businessAddress:user.business_address||'',
    businessCity:user.business_city||'',businessRegion:user.business_region||'',
    businessPostalCode:user.business_postal_code||user.us_zip||'',
    country:user.country,timeZone:user.time_zone||'',usState:user.us_state||'',
    indiaState:user.india_state||'',gstin:user.gstin||'',
    gstRegistration:user.gst_registration||(user.gstin?'registered':''),
    completedAt:user.business_profile_completed_at||0
  };
}

export function validateBusinessProfile(input,country,onlyFields=null){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new BusinessProfileError({form:'Enter your business details.'});
  const fields={},out={};
  for(const [key,label,max,required] of [
    ['name','Contact name',120,true],['businessName','Business name',120,true],
    ['trade','Industry or service',120,true],['businessEmail','Business email',254,true],
    ['businessAddress','Business address',160,true],['businessCity','City or locality',80,true],
    ['businessRegion','State or region',80,false],['businessPostalCode','Postal code',20,false],
    ['timeZone','Business time zone',80,true],['usState','US state',2,false],
    ['indiaState','Indian state',2,false],['gstin','GSTIN',15,false],
    ['gstRegistration','GST registration status',20,false]
  ]){
    const value=input[key]??'';
    if(typeof value!=='string'||value.trim().length>max||/[\u0000-\u001f\u007f]/.test(value)){
      fields[key]=label+' must be text of at most '+max+' characters.';out[key]='';continue;
    }
    out[key]=value.trim();
    if(required&&!out[key])fields[key]='Enter your '+label.toLowerCase()+'.';
  }
  if(!validCountry(country)||(input.country!==undefined&&input.country!==country))fields.country='Use your verified business country.';
  if(out.businessEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.businessEmail))fields.businessEmail='Enter a valid business email address.';
  out.businessEmail=out.businessEmail.toLowerCase();
  if(out.timeZone&&!validBusinessTimeZone(out.timeZone))fields.timeZone='Choose a valid business time zone.';
  if(country==='US'){
    if(!out.usState||!validUsState(out.usState))fields.usState='Choose your US state.';
    if(!out.businessPostalCode||!validUsZip(out.businessPostalCode))fields.businessPostalCode='Enter a valid ZIP code.';
    if(!out.timeZone||!validUsTimeZone(out.timeZone))fields.timeZone='Choose your US business time zone.';
  }
  if(country==='IN'){
    if(!out.indiaState||!validIndianState(out.indiaState))fields.indiaState='Choose your Indian state or union territory.';
    if(!/^[1-9]\d{5}$/.test(out.businessPostalCode))fields.businessPostalCode='Enter a valid six-digit PIN code.';
    if(!['registered','not_registered'].includes(out.gstRegistration))fields.gstRegistration='Confirm whether your business is GST-registered.';
    out.gstin=out.gstin.toUpperCase();
    if(out.gstRegistration==='registered'&&(!out.gstin||!validGSTIN(out.gstin)||out.gstin.slice(0,2)!==out.indiaState))
      fields.gstin='Enter a valid GSTIN matching your business state.';
    if(out.gstRegistration==='not_registered'&&out.gstin)fields.gstin='Remove the GSTIN or select GST-registered.';
    out.timeZone='Asia/Kolkata';
  }else{out.indiaState='';out.gstin='';out.gstRegistration='not_applicable';}
  if(country!=='US')out.usState='';
  const relevant=onlyFields?Object.fromEntries(Object.entries(fields).filter(([key])=>onlyFields.includes(key)||key==='country')):fields;
  if(Object.keys(relevant).length)throw new BusinessProfileError(relevant);
  return {...out,country};
}

export function businessProfileComplete(user){
  if(!user?.business_profile_completed_at)return false;
  try{validateBusinessProfile(profileFromUser(user),user.country);return true;}catch{return false;}
}

export const BUSINESS_SETUP_FIELDS=Object.freeze({
  basics:['name','businessName','trade','businessEmail'],
  address:['businessAddress','businessCity','businessRegion','businessPostalCode','timeZone','usState','indiaState'],
  tax:['gstRegistration','gstin']
});
export const businessSetupSteps=country=>country==='IN'?['basics','address','tax','review']:['basics','address','review'];

export function advanceBusinessSetup(setup,step,input,country){
  const steps=businessSetupSteps(country),index=steps.indexOf(step),current=steps.indexOf(setup.step);
  if(index<0||step==='review'||index>current)
    throw new BusinessProfileError({form:'Complete the current setup step before continuing.'});
  if(!input||typeof input!=='object'||Array.isArray(input))throw new BusinessProfileError({form:'Enter your business details.'});
  const allowed=BUSINESS_SETUP_FIELDS[step];
  if(Object.keys(input).some(key=>!allowed.includes(key)))throw new BusinessProfileError({form:'Only update the fields in this setup step.'});
  const merged={...setup.draft,...input,country};
  const normalized=validateBusinessProfile(merged,country,allowed);
  const draft={...setup.draft,country};
  for(const key of allowed)draft[key]=normalized[key];
  return {step:steps[index+1],draft};
}
