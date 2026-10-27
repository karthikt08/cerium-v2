// Record counts for category badges and feature tabs.
// These are totals for ONE specific feature, not mixtures of unrelated
// attention metrics (such as active leads + due follow-ups).
// Return null for views without a meaningful list of records.
export function featureRecordCount(feature,workspace){
  if(!feature||!workspace)return null;
  const rows=(key)=>Array.isArray(workspace[key])?workspace[key]:[];
  let records,label;
  switch(feature.id){
    case 'leads': records=rows('leads');label='lead';break;
    case 'followups': records=rows('followUps');label='follow-up';break;
    case 'quotes': records=rows('quotes');label='estimate';break;
    case 'invoices': records=rows('invoices');label='invoice';break;
    case 'payments': records=rows('invoices').filter(i=>i.status==='Paid');label='paid invoice';break;
    case 'reminders': records=rows('reminders');label='reminder';break;
    case 'dues': records=rows('paymentDues');label='custom due';break;
    case 'bank': records=rows('bankTransactions').filter(t=>t.status==='pending_match');label='unmatched deposit';break;
    case 'reviews': records=rows('reviews');label='review request';break;
    case 'crew': records=rows('crew');label='crew member';break;
    default: return null;
  }
  const count=records.length;
  return {count,label:count+' '+label+(count===1?'':'s')};
}

// For a group, the number always means the number of records in the actual
// feature linked by that group; never the sum of heterogeneous record types.
// A category with no list-like destination receives no ambiguous badge.
export function categoryRecordCount(feature,workspace){
  return featureRecordCount(feature,workspace);
}
