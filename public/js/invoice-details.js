import {invoiceCountry,roundCurrency,currencyDigits} from './invoice-country.js';
import {lineItemsTotal} from './money.js';
const bad=message=>Object.assign(new Error(message),{code:'invalid_invoice',status:400});
const text=(value,max,label)=>{
  if(typeof value!=='string'||value.trim().length>max)throw bad(label+' must be text of at most '+max+' characters.');
  return value.trim();
};
const readDate=value=>{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))throw bad('Enter a valid supply date.');
  const d=new Date(value+'T12:00:00Z');
  if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==value)throw bad('Enter a valid supply date.');
  return value;
};
export function readInvoiceDetails(raw){
  if(!raw)return null;
  try{return JSON.parse(raw);}catch{return null;}
}
export function makeInvoiceDetails(user,items,p={},previous=null,{issued=false,issueDate}={}){
  const preset=invoiceCountry(previous?.country||user.country);
  const currency=previous?.currency||user.currency;
  const subtotal=lineItemsTotal(items);
  if(currencyDigits(currency)===0&&Math.abs(subtotal-Math.round(subtotal))>0.000001)
    throw bad(currency+' invoices require a whole-unit subtotal. Adjust the line items before saving.');
  const supplier=issued&&previous?.supplier?previous.supplier:{
    name:user.business_name||user.name||'',email:user.business_email||user.email||'',phone:user.phone||'',
    address:[user.business_address||user.location,user.business_city,user.business_region||user.us_state,user.business_postal_code||user.us_zip].filter(Boolean).join(', '),
  };
  const pick=(key,max,defaultValue='')=>text(p[key]??previous?.[key]??defaultValue,max,key);
  const supplierTaxId=pick('supplierTaxId',80);
  const customerTaxId=pick('customerTaxId',80);
  const supplyDate=readDate(p.supplyDate||previous?.supplyDate||issueDate);
  const taxNote=pick('taxNote',500);
  const paymentInstructions=pick('paymentInstructions',500);
  const input=p.taxLines??previous?.taxLines??[];
  if(!Array.isArray(input)||input.length>4)throw bad('Use up to four tax components.');
  if(preset.country==='IN'&&input.length)throw bad('Use the India GST fields for GST calculations.');
  const taxLines=input.map(row=>{
    const label=text(row?.label,40,'Tax name');
    const raw=row?.rate,rate=Number(raw);
    if(!label||!['string','number'].includes(typeof raw)||String(raw).trim()===''||!Number.isFinite(rate)||rate<0||rate>100||Math.abs(rate*10000-Math.round(rate*10000))>0.000001)
      throw bad('Tax rates must be between 0 and 100 with up to four decimal places.');
    return {label,rate,amount:roundCurrency(subtotal*rate/100,currency)};
  });
  if(taxLines.some(row=>row.rate>0)&&preset.country!=='US'&&!supplierTaxId)
    throw bad('Enter your business tax registration ID before charging tax.');
  const total=roundCurrency(subtotal+taxLines.reduce((sum,row)=>sum+row.amount,0),currency);
  if(!Number.isFinite(total)||total<0||total>200_000_000_000)throw bad('Invoice total is too large.');
  return {version:1,country:preset.country,currency,supplier,supplierTaxId,customerTaxId,supplyDate,taxNote,paymentInstructions,taxLines,subtotal,total};
}
