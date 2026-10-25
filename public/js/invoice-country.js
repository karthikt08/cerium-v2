// Country presentation presets, not automatic tax advice. The issuer chooses
// rates and supplies registration details. No tax registration is inferred.
const euro='AT BE BG HR CY EE FI FR DE GR IE IT LV LT LU MT NL PT SK SI ES AD MC SM VA ME XK'.split(' ');
const eu='AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES'.split(' ');
const currencyHints={US:'USD',IN:'INR',GB:'GBP',AU:'AUD',CA:'CAD',NZ:'NZD',ZA:'ZAR',NG:'NGN',KE:'KES',BR:'BRL',MX:'MXN',
  CN:'CNY',JP:'JPY',KR:'KRW',SG:'SGD',MY:'MYR',ID:'IDR',PH:'PHP',TH:'THB',VN:'VND',BD:'BDT',PK:'PKR',NP:'NPR',LK:'LKR',
  AE:'AED',SA:'SAR',QA:'QAR',KW:'KWD',BH:'BHD',OM:'OMR',CH:'CHF',NO:'NOK',SE:'SEK',DK:'DKK',PL:'PLN',CZ:'CZK',HU:'HUF',RO:'RON'};
for(const country of euro)currencyHints[country]='EUR';
export const invoiceCurrencyHint=country=>currencyHints[country]||null;
export const INVOICE_CURRENCIES=Object.freeze(Intl.supportedValuesOf('currency'));
export const validInvoiceCurrency=currency=>typeof currency==='string'&&INVOICE_CURRENCIES.includes(currency);
// Keep existing India GST/UPI workflows INR-only. US historical INR remains a
// flagged legacy workspace rather than accidentally becoming writable.
export const validWorkspaceCurrency=(country,currency)=>country==='IN'?currency==='INR':
  country==='US'?currency==='USD':validInvoiceCurrency(currency);
export const currencyDigits=currency=>new Intl.NumberFormat('en',{style:'currency',currency}).resolvedOptions().maximumFractionDigits;
export const roundCurrency=(value,currency)=>{const factor=10**currencyDigits(currency);return Math.round((Number(value)+Number.EPSILON)*factor)/factor;};
export function invoiceCountry(country='US'){
  const vat=country==='GB'||eu.includes(country);
  const labels=country==='IN'?['GST','GSTIN']:country==='US'?['Sales tax','Tax registration ID']:
    country==='AU'?['GST','ABN']:country==='CA'?['GST/HST','GST/HST registration number']:
    ['NZ','SG'].includes(country)?['GST','GST registration number']:vat?['VAT','VAT registration number']:['Tax','Tax registration ID'];
  const locale={US:'en-US',IN:'en-IN',GB:'en-GB',AU:'en-AU',CA:'en-CA',NZ:'en-NZ',DE:'de-DE',FR:'fr-FR',ES:'es-ES',IT:'it-IT',BR:'pt-BR',JP:'ja-JP',CN:'zh-CN',KR:'ko-KR',NL:'nl-NL',PT:'pt-PT'}[country]||'en-GB';
  return {country,locale,taxLabel:labels[0],taxIdLabel:labels[1],paper:country==='US'||country==='CA'?'Letter':'A4',
    guidance:country==='US'?'Check state and local sales-tax rules for this supply.':country==='CA'?'Check the province and place of supply; add GST/HST and any separate provincial tax as separate rows.':
    country==='AU'?'Use your ABN and confirm GST registration before charging GST.':vat?'Review VAT registration, supply date and any exemption or reverse-charge wording. National electronic-invoicing rules may also apply.':
    'Confirm the applicable tax registration, rates and local invoice requirements before issuing.'};
}
export function invoiceMoney(value,currency='USD',country='US'){
  const safe=validInvoiceCurrency(currency)?currency:'USD';
  // Never hide historical fractions, even in currencies normally shown whole.
  const digits=Math.max(currencyDigits(safe),Number.isInteger(Number(value))?0:2);
  return new Intl.NumberFormat(invoiceCountry(country).locale,{style:'currency',currency:safe,currencyDisplay:'code',minimumFractionDigits:digits,maximumFractionDigits:Math.max(digits,3)}).format(Number(value)||0).replace(/\u00a0/g,' ');
}
export function invoiceDate(value,country){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return '—';
  return new Intl.DateTimeFormat(invoiceCountry(country).locale,{year:'numeric',month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z'));
}
