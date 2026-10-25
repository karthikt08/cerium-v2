// Quantities and rates are validated to at most two decimals before use.
// Accumulate integer hundredths-of-cents, then round the document total once.
export function lineItemsTotal(items) {
  const hundredthsOfCents=items.reduce((sum,item)=>
    sum+Math.round(Number(item.qty)*100)*Math.round(Number(item.rate)*100),0);
  if(!Number.isSafeInteger(hundredthsOfCents))throw new RangeError('Invoice total is too large.');
  return Math.round(hundredthsOfCents/100)/100;
}

// Printed rows show whole cents while the document rounds once after summing.
// Disclose the difference so the displayed rows reconcile with the saved total.
export function lineItemsRoundingAdjustment(items,total=lineItemsTotal(items)){
  const rowCents=items.reduce((sum,item)=>sum+Math.round(lineItemsTotal([item])*100),0);
  return (Math.round(total*100)-rowCents)/100;
}
