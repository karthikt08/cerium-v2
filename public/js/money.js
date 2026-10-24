// Quantities and rates are validated to at most two decimals before use.
// Accumulate integer hundredths-of-cents, then round the document total once.
export function lineItemsTotal(items) {
  const hundredthsOfCents=items.reduce((sum,item)=>
    sum+Math.round(Number(item.qty)*100)*Math.round(Number(item.rate)*100),0);
  if(!Number.isSafeInteger(hundredthsOfCents))throw new RangeError('Invoice total is too large.');
  return Math.round(hundredthsOfCents/100)/100;
}
