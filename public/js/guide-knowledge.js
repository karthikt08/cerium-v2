// Shared, safe knowledge base for navigation. No customer or invoice data is needed.
export const GUIDE_TOPICS = Object.freeze([
  {section:'invoices', title:'Invoices',
   keywords:['invoice','invoices','billing a customer','bill a customer','print pdf','download pdf','pdf','due date','net 15','net 30','payment terms','terms of payment','gst invoice','tax breakdown','tax rate','line item','invoice terms','tax declaration','receipt','billing','bill','statement','receivables','accounts receivable','sales tax','balance due','unpaid balance','cgst','sgst','igst','past due invoice','delinquent client'],
   answer:'Open Invoices to create a customer invoice, enter the job and line items, and use the invoice preview to print or save a PDF. WhatsApp, SMS and email buttons open message drafts for you to review and send. Indian INR invoices support a saved UPI payment link and QR code. Unregistered businesses can issue commercial invoices without a GSTIN or GST charges.',
   steps:'Open Invoices → New invoice → Complete the details → Preview → Print / save PDF.'},
  {section:'leads', title:'Leads',
   keywords:['import','spreadsheet','csv','excel','xlsx','leads','lead','prospect','pipeline','customer enquiry','customer inquiry','column mapping','deduplication','contact import','bulk import','crm','contacts','client list','inquiries','prospects','customer database','sales pipeline'],
   answer:'Leads is where you capture enquiries and track progress from New to Quoted, Booked and Done. You can also import existing customer and lead rows from a spreadsheet.',
   steps:'Open Leads → Add a lead or Import spreadsheet → Review the imported columns before confirming.'},
  {section:'quotes', title:'Estimates & quotes',
   keywords:['estimate','estimates','quote','quotes','quotation','proposal','approval','pricing a job','accepted quote','quote conversion','approved quote','convert estimate','bid','pricing','cost estimate','bidding','change order','scope of work','markup','job costing','itemized pricing'],
   answer:'Build an estimate in Estimates & quotes, send it for customer approval, and turn an accepted estimate into scheduled work.',
   steps:'Open Estimates & quotes → Create estimate → Check items and prices → Send for approval.'},
  {section:'jobs', title:'Jobs & dispatch',
   keywords:['job','jobs','dispatch','schedule','calendar','crew','technician','appointment','assign','conflict','double booking','overlap','reschedule','crew dispatch','work order','service call','booking','installer','mechanic','subcontractor','site visit','cancel appointment'],
   answer:'Jobs & dispatch helps schedule work and assign crew members. Check the date and team before confirming a job.',
   steps:'Open Jobs & dispatch → Create job → Set the date and crew → Save.'},
  {section:'reminders', title:'Payment reminders',
   keywords:['payment reminder','payment reminders','invoice reminder','reminders','remind payment','overdue reminder','chase payment','follow up payment','unpaid reminder','reminder schedule','late payment','escalate overdue','past due','chase','dunning','collections','late notice'],
   answer:'Payment reminders handles approved reminders about unpaid invoices. Review the recipient, timing and message before scheduling.',
   steps:'Open Payment reminders → Choose the invoice → Review the timing → Schedule.'},
  {section:'followups', title:'Follow-ups',
   keywords:['follow up','follow-up','followups','follow-ups','callback','call back','call customer','to do','todo','task','crew instructions','confirmation task','reminder task','agenda','customer check-in','next step'],
   answer:'Follow-ups keeps track of callbacks and next steps with customers. Set a clear task and due date.',
   steps:'Open Follow-ups → New follow-up → Set a task and date → Save.'},
  {section:'payments', title:'Payments',
   keywords:['payment','payments','deposit','bank match','reconcile','reconciliation','paid','bank transaction','partial payment','split payment','deposit matching','unmatched deposit','bank feed','wire','check','cash deposit','down payment','retainer','settlement','undo match'],
   answer:'Payments helps review paid invoices and match bank deposits to invoices. Bank matching is a review step: only confirm a match when the payer and amount are correct.',
   steps:'Open Payments → Review the deposit and invoice → Confirm only a correct match.'},
  {section:'reviews', title:'Reviews',
   keywords:['review','reviews','google review','rating','testimonial','feedback request','customer review','review invitation','completed job review','feedback workflow','5 star','ratings','reputation','testimonials','customer satisfaction'],
   answer:'Reviews helps you ask customers for feedback after a completed job and track responses.',
   steps:'Open Reviews → Choose a finished job/customer → Review the request.'},
  {section:'marketing', title:'Marketing',
   keywords:['marketing','promotion','rebook','re-book','get more reviews','social media','business profile','customer retention','lead sources'],
   answer:'Marketing helps plan customer outreach, draft messages for review before sharing, follow up with past paid customers, and inspect real lead and review activity. It does not automatically publish or send messages.',
   steps:'Open Marketing → Choose Get found and chosen, Re-book and re-engage, or Track performance.'},
  {section:'settings', title:'Settings',
   keywords:['setting','settings','profile','business address','subscription','plan','country','currency','customize','customise','tools','export','privacy','data','gst declaration','tax settings','data export','accounting export','backup','business details','gstin','tax id'],
   answer:'Settings contains business details, subscriptions, workspace customization and data controls. Hiding a tool does not delete its records.',
   steps:'Open Settings → Choose the relevant section. Use Customize tools to adjust the visible modules.'},
  {section:'support', title:'Help & feedback',
   keywords:['help','support','bug','contact','founder','problem','report an issue','technical support','assistance','customer service'],
   answer:'You can contact Cerium’s founders from Help & feedback. For account or billing problems, send a description without sharing passwords or card numbers.',
   steps:'Open Help & feedback → Write your message → Review the email draft.'},
  {section:'overview', title:'Overview',
   keywords:['overview','dashboard','home','getting started','start','navigate','where can i go','what can i do','daily summary','workspace stats','agenda','daily briefing','today summary','what is pending','what needs attention'],
   answer:'Overview summarizes your business day. Use the left navigation to move between leads, jobs, quotes, invoices, payments and other tools.',
   steps:'Open Overview → Review the summary → Select a tool in the sidebar.'}
]);
export const GUIDE_SECTIONS = Object.freeze(GUIDE_TOPICS.map(topic=>topic.section));
const matchText=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function pickGuide(question, currentSection='overview') {
  const text=matchText(question);
  // These shipped invoice tasks can otherwise be mistaken for Settings or
  // Payments, or missed by the older navigation classifier altogether.
  if(/\b(?:whatsapp|sms|upi|qr code|payment qr|scan to pay|without (?:a )?gstin|no gstin|not gst registered|unregistered business)\b/.test(text)&&
    !/\b(?:quotes?|estimates?|marketing|reviews?|leads?|reminders?)\b/.test(text))
    return {...GUIDE_TOPICS.find(topic=>topic.section==='invoices'),matched:true};
  let best=null,score=0;
  for(const topic of GUIDE_TOPICS){
    let points=0;
    for(const term of topic.keywords){
      const target=matchText(term);
      if(target && (' '+text+' ').includes(' '+target+' '))points+=Math.max(1,target.split(' ').length*3);
    }
    if(points>score){best=topic;score=points;}
  }
  const fallback=GUIDE_TOPICS.find(topic=>topic.section===currentSection)||GUIDE_TOPICS[GUIDE_TOPICS.length-1];
  return {...(best||fallback), matched:Boolean(best)};
}
