// Marketing decisions based entirely on existing Cerium workspace records.
// Nothing here claims reach, impressions, ad conversions or campaign ROI.
const lower=value=>String(value||'').trim().replace(/\s+/g,' ').toLocaleLowerCase();
const dateKey=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||'').slice(0,10))?String(value).slice(0,10):'';
const oldEnough=(value,today,days=30)=>{
  const a=dateKey(value),b=dateKey(today);
  if(!a||!b)return false;
  const diff=(Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/86400000;
  return Number.isFinite(diff)&&diff>=days;
};
export function marketingInsights(ws={},today=new Date().toISOString().slice(0,10)){
  const leads=Array.isArray(ws.leads)?ws.leads:[];
  const reviews=Array.isArray(ws.reviews)?ws.reviews:[];
  const invoices=Array.isArray(ws.invoices)?ws.invoices:[];
  const followUps=Array.isArray(ws.followUps)?ws.followUps:[];
  const sourceCounts=new Map();
  for(const lead of leads){
    const source=String(lead?.source||'Unspecified').trim().slice(0,60)||'Unspecified';
    sourceCounts.set(source,(sourceCounts.get(source)||0)+1);
  }
  const sources=[...sourceCounts].map(([source,count])=>({source,count}))
    .sort((a,b)=>b.count-a.count||a.source.localeCompare(b.source)).slice(0,8);
  const paid=invoices.filter(x=>x?.status==='Paid'&&String(x?.customerName||'').trim());
  const buyers=new Map();
  for(const invoice of paid){
    const name=String(invoice.customerName).trim(),key=lower(name);
    const previous=buyers.get(key);
    const last=dateKey(invoice.paidAt)||dateKey(invoice.issueDate)||dateKey(invoice.dueDate);
    if(!previous)buyers.set(key,{name,paidInvoices:1,lastDate:last,customerEmail:String(invoice.customerEmail||'').trim()});
    else{
      previous.paidInvoices++;
      if(last>previous.lastDate){
        previous.lastDate=last;
        previous.name=name;
        previous.customerEmail=String(invoice.customerEmail||'').trim();
      }
    }
  }
  const pastCustomers=[...buyers.values()].sort((a,b)=>(b.lastDate||'').localeCompare(a.lastDate||''));
  const candidates=pastCustomers.filter(x=>oldEnough(x.lastDate,today)&&
    !followUps.some(f=>!f?.done&&lower(f.contactName)===lower(x.name))).slice(0,5);
  const requested=reviews.filter(x=>x?.status==='Sent'||x?.status==='Reviewed').length;
  const received=reviews.filter(x=>x?.status==='Reviewed').length;
  const unasked=reviews.filter(x=>x?.status==='Not Asked').length;
  const leadToBooking=leads.filter(x=>['Booked','Done'].includes(x?.stage)).length;
  const repeatCustomers=pastCustomers.filter(x=>x.paidInvoices>=2).length;
  const dueFollowUps=followUps.filter(x=>!x?.done&&dateKey(x.dueDate)&&dateKey(x.dueDate)<=today).length;
  const priorities=[];
  if(unasked)priorities.push({title:'Ask for reviews after completed work',reason:unasked+' review '+(unasked===1?'request is':'requests are')+' not yet marked as asked.',section:'reviews'});
  if(dueFollowUps)priorities.push({title:'Reconnect with customers waiting for a reply',reason:dueFollowUps+' follow-up '+(dueFollowUps===1?'task is':'tasks are')+' due.',section:'followups'});
  if(candidates.length)priorities.push({title:'Check in with past customers',reason:candidates.length+' past '+(candidates.length===1?'customer has':'customers have')+' a paid invoice older than 30 days and no open follow-up.',section:'followups'});
  if(!priorities.length)priorities.push({title:'Make the next review easy',reason:'Start by recording a review request after a completed job, or add a new customer enquiry.',section:'reviews'});
  return {
    totalLeads:leads.length,
    bookedLeads:leadToBooking,
    reviewRequests:requested,
    reviewsReceived:received,
    reviewsNotAsked:unasked,
    pastPaidCustomers:pastCustomers.length,
    repeatCustomers,
    dueFollowUps,
    sources,candidates,priorities,
    // No marketing ROI: no spend, attribution, visitor, or channel tracking exists.
    attributionAvailable:false
  };
}

const safeLine=(value,max=90)=>String(value||'').trim().replace(/[\r\n\t]+/g,' ').replace(/\s+/g,' ').slice(0,max);
export function draftMarketingCopy({kind='post',businessName='your business',service='',customerName=''}={}){
  const business=safeLine(businessName,90)||'our team';
  const offering=safeLine(service,100);
  const customer=safeLine(customerName,90);
  const salutation=customer?'Hi '+customer+',':'Hi,';
  if(kind==='review')return salutation+'\n\nThank you for choosing '+business+'. If you were happy with your experience, we would appreciate an honest review. Your feedback helps other people make informed choices.\n\nThank you,\n'+business;
  if(kind==='rebook')return salutation+'\n\nThank you for choosing '+business+' previously. We wanted to check whether you need any help with '+(offering||'our services')+' again. If so, just reply when it suits you.\n\nBest,\n'+business;
  if(kind==='update')return 'A quick update from '+business+':\n\n'+(offering?'We are here to help with '+offering+'.':'We are here when you need our services.')+'\n\nGet in touch to ask about availability and discuss what you need.';
  if(kind==='post')return 'Looking for help with '+(offering||'your next project')+'?\n\n'+business+' is here to answer your questions and help you plan your next step.\n\nGet in touch to learn more.';
  return '';
}
export function marketingFollowUp(customer,{today=new Date().toISOString().slice(0,10)}={}){
  const name=safeLine(customer?.name,90);
  if(!name||!dateKey(today))throw new Error('Choose a customer and due date.');
  return {
    contactName:name,
    channel:'Call',
    task:'Marketing check-in: ask whether the customer needs another service. Confirm contact preferences before reaching out.',
    dueDate:today
  };
}
