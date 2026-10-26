// A business without an Indian GSTIN must still be able to use Cerium invoices.
// Historical issued GST documents retain their original supplier identity.
export function indiaInvoiceMode(account={},invoice={}){
  if(account.country!=='IN')return 'international';
  const currentGstin=String(account.gstin||'').trim();
  const issuedGstin=String(invoice.supplierGstin||'').trim();
  if(currentGstin||(issuedGstin&&invoice.status!=='Draft'))return 'gst';
  return 'commercial';
}
// Never submit tax-only fields for an unregistered supplier, including when
// editing a draft that still contains old GST inputs after deregistration.
export function prepareIndiaInvoicePayload(values,mode){
  if(mode!=='commercial')return values;
  return {...values,gstRate:0,customerGstin:'',hsnSac:'',placeOfSupply:''};
}
