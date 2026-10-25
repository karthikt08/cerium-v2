// India edition tax helpers. A draft calculator, not GSTN/IRP filing.
export const INDIAN_STATES = Object.freeze({
  '01':'Jammu and Kashmir','02':'Himachal Pradesh','03':'Punjab','04':'Chandigarh',
  '05':'Uttarakhand','06':'Haryana','07':'Delhi','08':'Rajasthan','09':'Uttar Pradesh',
  '10':'Bihar','11':'Sikkim','12':'Arunachal Pradesh','13':'Nagaland','14':'Manipur',
  '15':'Mizoram','16':'Tripura','17':'Meghalaya','18':'Assam','19':'West Bengal',
  '20':'Jharkhand','21':'Odisha','22':'Chhattisgarh','23':'Madhya Pradesh',
  '24':'Gujarat','26':'Dadra and Nagar Haveli and Daman and Diu','27':'Maharashtra',
  '29':'Karnataka','30':'Goa','31':'Lakshadweep','32':'Kerala','33':'Tamil Nadu',
  '34':'Puducherry','35':'Andaman and Nicobar Islands','36':'Telangana','37':'Andhra Pradesh',
  '38':'Ladakh'
});
export const INDIA_STATE_OPTIONS=Object.entries(INDIAN_STATES).map(([value,label])=>({value,label:label+' ('+value+')'}));
export const validIndianState=code=>code===''||Object.hasOwn(INDIAN_STATES,String(code));
export const validGSTIN=value=>{
  const id=String(value||'').trim().toUpperCase();
  return !id||(/^[0-3][0-9][A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[A-Z0-9]$/.test(id)&&Object.hasOwn(INDIAN_STATES,id.slice(0,2)));
};
export const validUpiVpa=value=>{
  const v=String(value||'').trim();
  return !v||(/^[a-zA-Z0-9._-]{2,128}@[a-zA-Z0-9.-]{2,64}$/.test(v)&&v.length<=194);
};
export const safeGSTrate=value=>(typeof value==='number'||(typeof value==='string'&&value.trim()!==''))&&Number.isFinite(Number(value))&&Number(value)>=0&&Number(value)<=40&&Math.abs(Math.round(Number(value)*100)-Number(value)*100)<0.000001;
export const rupees=n=>Math.round((Number(n)+Number.EPSILON)*100)/100;
export function gstBreakdown(subtotal,rate,supplierState,placeOfSupply){
  if(!validIndianState(supplierState)||!supplierState||!validIndianState(placeOfSupply)||!placeOfSupply)throw new Error('Choose supplier and place-of-supply states.');
  if(!safeGSTrate(rate)||!Number.isFinite(Number(subtotal))||Number(subtotal)<0)throw new Error('Enter a valid taxable amount and GST rate.');
  const taxable=rupees(subtotal), r=Number(rate);
  const taxablePaise=Math.round(taxable*100),rateHundredths=Math.round(r*100);
  const numerator=taxablePaise*rateHundredths;
  if(!Number.isSafeInteger(numerator))throw new Error('Taxable amount is too large.');
  const taxPaise=Math.round(numerator/10000),fullTax=taxPaise/100;
  const interstate=supplierState!==placeOfSupply;
  const unionTerritory=new Set(['04','26','31','34','35','38']).has(supplierState);
  const centralPaise=interstate?0:Math.round(taxPaise/2);
  const cgst=centralPaise/100;
  const sgst=interstate?0:(taxPaise-centralPaise)/100;
  const igst=interstate?fullTax:0;
  return {taxable,gstRate:r,cgst,sgst:unionTerritory?0:sgst,utgst:unionTerritory?sgst:0,igst,total:(taxablePaise+taxPaise)/100};
}
