import {COUNTRY_CALLING_CODES} from './country-codes.js';

export {COUNTRY_CALLING_CODES};
export const validCountry=code=>typeof code==='string'&&Object.hasOwn(COUNTRY_CALLING_CODES,code);
const names=new Intl.DisplayNames(['en'],{type:'region'});
export const countryName=code=>validCountry(code)?names.of(code):'Unknown country';
export const COUNTRY_OPTIONS=Object.freeze(Object.keys(COUNTRY_CALLING_CODES)
  .map(value=>Object.freeze({value,label:countryName(value),callingCode:COUNTRY_CALLING_CODES[value]}))
  .sort((a,b)=>a.label.localeCompare(b.label,'en')));
export const currencyForCountry=country=>validCountry(country)?(country==='IN'?'INR':'USD'):null;
export const billingPlan=country=>validCountry(country)?{
  country,currency:currencyForCountry(country),monthlyPrice:country==='IN'?500:20,minorUnits:country==='IN'?50000:2000
}:null;
export const matchesBillingCurrency=(country,currency)=>validCountry(country)&&currency===currencyForCountry(country);
export const editionLabel=country=>country==='IN'?'India edition · INR':country==='US'?'US edition · USD':'Global edition · USD';
export const phonePlaceholder=country=>country==='IN'?'98765 43210':country==='US'?'(415) 555-0123':'National number or +country code';
