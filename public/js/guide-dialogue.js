// Shared conversation controls for Ask Cerium (server and offline preview).
// Neither a greeting nor an unsupported question should route to the current tab.
import {GUIDE_TOPICS, GUIDE_SECTIONS, pickGuide} from './guide-knowledge.js';

const TOPICS=new Map(GUIDE_TOPICS.map(topic=>[topic.section,topic]));
const response=(kind,reply)=>({type:'conversation',kind,reply,section:null,title:null,steps:null,source:'guide'});
export const GUIDE_UNKNOWN="I don't want to point you to the wrong place. Tell me what you're trying to do in Cerium, or ask which tools would suit your business.";

export function unknownGuideResponse(){
  return response('unknown',GUIDE_UNKNOWN);
}
// Resolve short follow-ups using the previous task, including workflows that
// span several sections. Only bounded user text is retained, never model output
// or workspace records. Explicit new questions always take precedence.
const DETAIL_FOLLOWUP=/^(?:(?:and|please|can you|could you) )*(?:how (?:do|can|should) i (?:do|use|start|set up) (?:that|it|this)|how does (?:that|it|this) work|(?:show me|give me|what are) (?:the )?steps|(?:walk|take) me through(?: (?:that|it|this))?|(?:explain|describe)(?: (?:that|it|this))?(?: more| in (?:more )?detail| step by step)?|(?:tell me )?more(?: detail| details)?|steps|step by step|how exactly|what(?:'s| is) the next step|what (?:now|next)|where (?:is|do i find) (?:that|it|this))(?: please)?$/i;
export function resolveGuideQuestion(question,{lastQuestion=null}={}){
  const text=String(question||'').trim();
  const followup=text.replace(/[.!?]+$/g,'').replace(/\s+/g,' ');
  if(!DETAIL_FOLLOWUP.test(followup)||typeof lastQuestion!=='string'||lastQuestion.length>420||
    /[\u0000-\u001f]/.test(lastQuestion))return text;
  const previous=lastQuestion.trim();
  if(!previous||conversationReply(previous))return text;
  return workflowReply(previous)||pickGuide(previous).matched?previous:text;
}
export function conversationReply(question,{lastSection=null}={}){
  const text=String(question||'').toLowerCase().trim()
    .replace(/[.!?]+$/g,'').replace(/\s+/g,' ');
  const prior=GUIDE_SECTIONS.includes(lastSection)?TOPICS.get(lastSection):null;
  if(/^(?:h+i+|hey+|hello+|yo+|hiya|good morning|good afternoon|good evening)(?: there| cerium| everyone)?$/.test(text))
    return response('greeting',"Hey! What are you working on today? I can help you find a feature, walk through a task, or recommend tools for your business.");
  if(/^(?:thanks|thank you|thx|ty|cheers)(?: so much| a lot| for your help)?$/.test(text))
    return response('thanks',"You're welcome! What's next?");
  if(/^(?:bye|goodbye|see you|later)$/.test(text))
    return response('thanks',"See you! Ask whenever you need help inside Cerium.");
  if(/^(?:what (?:advanced )?tasks? (?:can|do) you (?:do|handle|support)|what workflows? (?:can|do) you (?:support|guide|help with)|show me (?:advanced )?workflows?|how can you help with (?:my )?operations?)$/i.test(text))
    return response('capabilities',"I can walk you through multi-step operations like converting approved quotes to scheduled jobs and invoices, reconciling partial payments, GST invoice tax drafting, bulk spreadsheet imports, crew conflict dispatch, and customer review requests. What would you like to do?");
  if(/^(?:help|help me|what can you do|what do you do|who are you|what is cerium|what does cerium do|what can cerium do|tell me about cerium|how can cerium help me|how can cerium help my business|why use cerium|how does this work|show me what you can do|what can i ask you|start over|menu)$/.test(text))
    return response('capabilities',"I can guide you to Cerium features, explain workflows like invoices or spreadsheet imports, and suggest tools for your type of business. What would you like to do?");
  if(/^(?:how are you|how's it going|what's up|sup)$/.test(text))
    return response('greeting',"I'm here and ready to help with Cerium. Need to find something or set up your business tools?");
  if(/^(?:not helpful|that(?:'s| is) wrong|wrong answer|you(?:'re| are) wrong|wtf|what the hell|huh|that makes no sense|try again)$/.test(text))
    return response('clarify',"That answer missed the point. Tell me the task you want to complete, and I'll find the right tool—or say when Cerium doesn't support it.");

  // Intelligent multi-turn conversational follow-ups based on prior verified section
  const explicit=pickGuide(text);
  if(prior&&(!explicit.matched||explicit.section===prior.section)){
    if(prior.section==='payments'&&/\b(?:partial|different amount|mismatch|(?:not|doesn'?t) match|undo|wrong (?:invoice|match|amount))\b/i.test(text)){
      return {...response('followup',"Use Payments → Payment Ledger & Allocation to record partial payments or split allocations. Void a ledger receipt with a reason to reverse it. Bank Matching has no Undo match control; review the linked invoice and contact Help & Support for an incorrect bank match."),section:'payments',title:prior.title};
    }
    if(prior.section==='invoices'&&/\b(?:terms?|net 15|net 30|due on receipt|tax rate|cgst|sgst|igst)\b/i.test(text)){
      return {...response('followup',"In Invoices, you can choose payment terms (Due on receipt, Net 15, Net 30) and apply line-item tax rates. Use Preview to inspect the computed tax subtotals."),section:'invoices',title:prior.title};
    }
    if(prior.section==='quotes'&&/\b(?:change order|scope|revised|approval link)\b/i.test(text)){
      return {...response('followup',"In Estimates & quotes, draft or edit the proposal line items, preview the estimate, and share the customer approval link."),section:'quotes',title:prior.title};
    }
    if(prior.section==='jobs'&&/\b(?:reschedule|reassign|conflict|double book)\b/i.test(text)){
      return {...response('followup',"In Jobs & dispatch, click the scheduled appointment to change the date, time, or assigned technician to resolve calendar conflicts."),section:'jobs',title:prior.title};
    }
  }

  if(DETAIL_FOLLOWUP.test(text)){
    if(!prior)return response('clarify',"Which part of Cerium are you asking about—leads, jobs, invoices, or something else?");
    return {...response('followup',"For "+prior.title+": "+prior.steps),section:prior.section,title:prior.title,steps:null};
  }
  if(/^(?:can you (?:do|make|send|save|change|delete|create|finish) (?:that|it)(?: for me)?|do it for me|please do it for me)$/.test(text))
    return prior?
      {...response('permissions',"I can show you how in "+prior.title+", but I can't change your records or send anything for you."),section:prior.section,title:prior.title}:
      response('permissions',"I can guide you through actions in Cerium, but I can't edit records, send invoices or take payments on your behalf.");
  if(/^(?:yes|yeah|yep|sure|okay|ok|no|nah)$/.test(text))
    return response('clarify',"Tell me what you'd like to do next, or describe your business so I can recommend the right tools.");
  if(/^(?:how (?:can|do) i grow my business|how (?:do|can) i get more (?:customers|clients|leads))$/.test(text))
    return response('capabilities',"Cerium can help you track leads, keep up with follow-ups and request customer reviews. Tell me your type of business and I'll suggest a starting workflow.");
  return null;
}

// Cross-feature workflows make the guide useful when a task spans several screens.
// Every destination is an existing, allowlisted Cerium section; no execution occurs.
const WORKFLOWS=[
  // 1. Existing full customer lifecycle: lead -> quote -> job -> invoice -> payment
  {
    matches:/\b(?:from|turn|convert|after|process|workflow)\b.{0,110}\b(?:lead|prospect)\b.{0,115}\b(?:invoice|payment|paid)\b/i,
    reply:'For a customer-to-payment workflow: capture the lead, prepare a quote, schedule the approved work, create an invoice, then review the payment.',
    actions:['leads','quotes','jobs','invoices','payments'],
    steps:'Open Leads → Capture new enquiry → Open Estimates & quotes → Prepare proposal → Open Jobs & dispatch → Schedule approved work → Open Invoices → Bill customer → Open Payments → Match deposit.'
  },
  // 2. Specific accepted quote conversion: quote -> job -> invoice
  {
    matches:/\b(?:accepted|approved?|won)\b.{0,70}\b(?:quote|estimate|proposal)s?\b.{0,70}\b(?:job|schedul\w*|invoic\w*|bill\w*)\b/i,
    reply:'Review the approved estimate in Estimates & quotes, schedule the assigned crew in Jobs & dispatch, then generate the final invoice in Invoices once the job is completed.',
    actions:['quotes','jobs','invoices'],
    steps:'Open Estimates & quotes → Confirm customer approval → Open Jobs & dispatch → Schedule crew & date → Open Invoices → Generate customer invoice.'
  },
  // 3. Convert quote/estimate to scheduled job
  {
    matches:/\b(?:convert|turn|move)\b.{0,50}\b(?:quote|estimate|proposal)s?\b.{0,50}\b(?:into|to)\b.{0,40}\b(?:job|appointment|schedul\w*)\b/i,
    reply:'Confirm the customer accepted the estimate in Estimates & quotes, then open Jobs & dispatch to book the appointment and assign your crew.',
    actions:['quotes','jobs'],
    steps:'Open Estimates & quotes → Mark quote accepted → Open Jobs & dispatch → Create job & assign crew.'
  },
  // 4. Import contacts and prepare quotes (existing)
  {
    matches:/\b(?:import|excel|csv|spreadsheet)\b.{0,130}\b(?:quote|estimate|proposal)s?\b/i,
    reply:'First import your contacts in Leads. Then open Estimates & quotes to prepare a quote for the customer.',
    actions:['leads','quotes'],
    steps:'Open Leads → Import spreadsheet → Map columns & confirm → Open Estimates & quotes → Prepare proposal.'
  },
  // 5. Bulk spreadsheet import & scheduling / dispatch
  {
    matches:/\b(?:import|excel|csv|spreadsheet|migrate|bulk)\b.{0,90}\b(?:lead|contact|customer)s?\b.{0,90}\b(?:job|schedul\w*|dispatch)\b/i,
    reply:'Import contacts via Leads → Import spreadsheet, map customer columns and review duplicate flags, then book scheduled appointments in Jobs & dispatch.',
    actions:['leads','jobs'],
    steps:'Open Leads → Import spreadsheet → Map columns & verify duplicates → Open Jobs & dispatch → Book appointments.'
  },
  // 6. Schedule work and invoice (existing)
  {
    matches:/\b(?:schedul\w*|jobs?|appointments?|work)\b.{0,90}\b(?:invoic\w*|bill(?:ing)?)\b/i,
    reply:'Schedule the work in Jobs & dispatch, then create the customer invoice in Invoices after reviewing the completed work.',
    actions:['jobs','invoices'],
    steps:'Open Jobs & dispatch → Book & complete work → Open Invoices → Create invoice with line items.'
  },
  // 7. Partial payments, bank deposit matching & reconciliation
  {
    matches:/\b(?:partial payment|split payment|deposit match|bank match|reconcil\w*)\b.{0,90}\b(?:deposit|payment|invoice|transaction|balance|bank)s?\b/i,
    reply:'Open Billing & Payments → Payments → Payment Ledger & Allocation. Record a verified receipt, choose invoice allocation amounts, and confirm. You can record partial payments, split a receipt across invoices or allocate unused funds later. Bank Matching separately supports recorded deposits equal to an invoice total.',
    actions:['invoices','payments'],
    steps:'Open Payments → Payment Ledger & Allocation → Record verified payment → Enter allocations → Confirm.'
  },
  // 8. Overdue invoices & payment reminder escalation
  {
    matches:/\b(?:unpaid|overdue|late payment|chase payment|escalat\w*)\b.{0,70}\b(?:remind\w*|follow.?up|chase|notif\w*)\b/i,
    reply:'First check the invoice in Invoices. Then use Payment reminders to prepare a follow-up, subject to your delivery settings.',
    actions:['invoices','reminders'],
    steps:'Open Invoices → Check overdue balance → Open Payment reminders → Review timing & message → Schedule approved reminder.'
  },
  // 9. GST / tax invoice draft preparation & tax breakdown
  {
    matches:/\b(?:gst|tax|vat|tax declaration|tax rate)s?\b.{0,90}\b(?:invoic\w*|bill\w*|breakdown|draft)s?\b/i,
    reply:'Verify your business GST declaration and tax ID in Settings → Business profile, then create or review line-item tax rates in Invoices. Use Preview to inspect the tax breakdown before saving the PDF.',
    actions:['settings','invoices'],
    steps:'Open Settings → Business profile → Check tax/GST info → Open Invoices → Set tax rates on items → Preview breakdown → Save PDF.'
  },
  // 10. Crew dispatch & schedule conflict resolution
  {
    matches:/\b(?:crew|technician|worker|staff|dispatch)s?\b.{0,90}\b(?:conflict\w*|overlap\w*|double book\w*|assign\w*|reassign\w*)\b/i,
    reply:'Check technician assignments and resolve overlapping appointments in Jobs & dispatch, then record customer confirmations or crew tasks in Follow-ups.',
    actions:['jobs','followups'],
    steps:'Open Jobs & dispatch → Check calendar & resolve overlaps → Open Follow-ups → Save crew instructions or customer confirmation.'
  },
  // 11. Customer review request after completed job
  {
    matches:/\b(?:complet\w*|finish\w*|done)\b.{0,70}\b(?:job|work|appointment)s?\b.{0,70}\b(?:review|rating|testimonial|feedback)s?\b/i,
    reply:'Mark the appointment Completed in Jobs & dispatch, then open Reviews to copy a request for your own messaging app and record its status.',
    actions:['jobs','reviews'],
    steps:'Open Jobs & dispatch → Mark job Completed → Open Reviews → Copy request → Send it in your own app → Mark requested.'
  },
  // 12. Reverse review order match: review request after job
  {
    matches:/\b(?:review|rating|testimonial|feedback)s?\b.{0,70}\b(?:after|once|when)\b.{0,70}\b(?:job|work|complet\w*|finish\w*)s?\b/i,
    reply:'Mark the appointment Completed in Jobs & dispatch, then open Reviews to copy a request for your own messaging app and record its status.',
    actions:['jobs','reviews'],
    steps:'Open Jobs & dispatch → Mark job Completed → Open Reviews → Copy request → Send it in your own app → Mark requested.'
  },
  // 13. End-of-month reconciliation & tax data export
  {
    matches:/\b(?:end of month|month end|closeout|close out|bookkeep\w*|accountant)\b.{0,90}\b(?:reconcil\w*|export\w*|report\w*|audit|data)\b/i,
    reply:'Audit open balances in Invoices, confirm matched bank deposits in Payments, then open Settings → Data & export to download your verified accounting records.',
    actions:['invoices','payments','settings'],
    steps:'Open Invoices → Check open balances → Open Payments → Match deposits → Open Settings → Data & export → Download verified export.'
  },
  // 14. Daily operating briefing / what to do today
  {
    matches:/\b(?:what (?:should|do) i (?:do|focus on) today|what(?:'s| is) pending|daily (?:summary|briefing|routine)|where (?:do|should) i start today|daily operations)\b/i,
    reply:'Review today\'s metrics in Overview, check scheduled crew visits in Jobs & dispatch, action callbacks in Follow-ups, and review overdue balances in Invoices.',
    actions:['overview','jobs','followups','invoices'],
    steps:'Open Overview → Check daily KPIs → Open Jobs & dispatch → Review today\'s schedule → Open Follow-ups → Action due callbacks → Open Invoices → Review overdue bills.'
  },
  // 15. Customer upfront deposit workflow
  {
    matches:/\b(?:deposit|down payment|retainer)\b.{0,80}\b(?:before (?:starting )?work|upfront|quote|estimate)\b/i,
    reply:'Include deposit terms in Estimates & quotes, issue an initial invoice in Invoices, and match the customer deposit in Payments before scheduling in Jobs & dispatch.',
    actions:['quotes','invoices','payments','jobs'],
    steps:'Open Estimates & quotes → Add deposit terms → Open Invoices → Send deposit invoice → Open Payments → Match deposit → Open Jobs & dispatch → Schedule crew.'
  },
  // 16. Change order / extra scope workflow
  {
    matches:/\b(?:change order|scope change)\b|\b(?:extra work|added scope|revised estimate)\b.{0,80}\b(?:bill|invoice|job|quote)\b/i,
    reply:'Draft a revised estimate in Estimates & quotes for customer approval, adjust the schedule in Jobs & dispatch, then add the approved change order items to Invoices.',
    actions:['quotes','jobs','invoices'],
    steps:'Open Estimates & quotes → Draft change order → Get approval → Open Jobs & dispatch → Adjust schedule → Open Invoices → Add line items.'
  },
  // 17. Delinquent client / past due escalation protocol
  {
    matches:/\b(?:delinquent|won't pay|refuses to pay|unpaid client)\b/i,
    reply:'Verify the balance in Invoices, dispatch a formal reminder in Payment reminders, schedule a phone call in Follow-ups, and record any partial settlements in Payments.',
    actions:['invoices','reminders','followups','payments'],
    steps:'Open Invoices → Verify balance & dates → Open Payment reminders → Send reminder → Open Follow-ups → Schedule phone call → Open Payments → Match settlement.'
  },
  // 18. Estimate vs invoice clarification
  {
    matches:/\b(?:difference between (?:an? )?(?:estimate|quote) and (?:an? )?invoice|estimate vs invoice|quote vs invoice)\b/i,
    reply:'Estimates are proposals sent before work begins to agree on scope and price. Invoices are payment requests sent during or after work with payment terms and taxes.',
    actions:['quotes','invoices'],
    steps:'Estimates & quotes: agree on price before work → Invoices: request payment after work.'
  },
  // 19. Smart Disambiguations:
  {
    matches:/^(?:pricing|how do i price|bidding)$/i,
    reply:'Are you preparing a quote for a prospective customer, or reviewing line items and taxes on an invoice?',
    actions:['quotes','invoices'],
    steps:'Choose Estimates & quotes for proposals or Invoices for completed billing.'
  },
  {
    matches:/^(?:billing|bills)$/i,
    reply:'Would you like to draft a customer invoice, or review incoming bank deposit payments?',
    actions:['invoices','payments'],
    steps:'Choose Invoices to bill clients or Payments to match bank deposits.'
  },
  {
    matches:/^(?:scheduling|schedule|calendar)$/i,
    reply:'Would you like to schedule crew appointments on the calendar, or schedule automated payment reminders?',
    actions:['jobs','reminders'],
    steps:'Choose Jobs & dispatch for crew work or Payment reminders for late invoices.'
  },
  {
    matches:/^(?:taxes|gst|tax setup)$/i,
    reply:'Would you like to configure your business tax details in Settings, or add tax breakdown rates to an Invoice?',
    actions:['settings','invoices'],
    steps:'Choose Settings for GST registration or Invoices for line-item tax rates.'
  }
];

export function workflowReply(question){
  const text=String(question||'').trim().slice(0,420);
  // A question about issuing an invoice without GST registration must not get
  // the generic GST workflow telling the user to enter a tax ID.
  if(/\b(?:without (?:a )?gstin|no gstin|not gst[- ]?registered|unregistered|non[- ]registered)\b/i.test(text))return null;
  const plan=WORKFLOWS.find(item=>item.matches.test(text));
  if(!plan)return null;
  return {
    type:'workflow',source:'guide',reply:plan.reply,
    section:null,title:null,steps:plan.steps||null,
    actions:plan.actions.filter(section=>GUIDE_SECTIONS.includes(section))
      .map(section=>({section,title:TOPICS.get(section).title}))
  };
}

const TASKS=[
  // Invoices
  {section:'invoices',priority:5,match:/\b(?:without (?:a )?gstin|no gstin|not gst[- ]?registered|not registered|unregistered|non[- ]registered)\b/i,
    answer:'You can create a regular commercial invoice without a GSTIN. Leave the business GSTIN blank in Settings; Cerium uses the no-GST invoice form and does not charge GST. Add a GSTIN only if your business is registered.',
    steps:'Open Settings → Check your Business profile → Leave GSTIN blank if unregistered → Open Invoices → Create a commercial invoice → Preview before sharing.'},
  {section:'invoices',priority:4,match:/\b(?:upi|qr code|payment qr|scan to pay)\b/i,
    answer:'For an Indian business issuing an INR invoice, Cerium can show a UPI link and QR code using the UPI ID saved on that invoice. A QR code opens a payment request; verify receipt before marking the invoice paid.',
    steps:'Open Settings → Check your UPI ID → Open Invoices → Preview an unpaid INR invoice → Check the UPI link and QR code.'},
  {section:'invoices',priority:3,match:/\b(?:whatsapp|sms|text message|email|share|send it)\b/i,
    answer:'Open the invoice preview and choose WhatsApp, SMS, or email to open a message draft. Check the recipient and message, then send it from your messaging app. Attach the saved PDF yourself if needed; Cerium does not send it automatically.',
    steps:'Open Invoices → Preview the invoice → Choose WhatsApp, SMS, or email → Review the message draft → Send from your messaging app.'},
  {section:'invoices',match:/\b(?:pdf|download|print|save (?:an? )?invoice)\b/i,
    answer:'To save an invoice as a PDF, open Invoices, preview the invoice, then choose Print / save PDF.',
    steps:'Open Invoices → Preview the invoice you want → Choose Print / save PDF → Choose Save as PDF in the print dialog.'},
  {section:'invoices',match:/\b(?:gst|tax rate|tax declaration|tax breakdown|hsn|sac|cgst|sgst|igst)\b/i,
    answer:'In Invoices, review the available tax fields and the invoice preview. Mixed per-item rates and statutory tax filing are not supported.'},
  {section:'invoices',match:/\b(?:payment terms?|net 15|net 30|due on receipt|terms of payment)\b/i,
    answer:'Choose Due on receipt for service visits to speed up cash flow, or Net 15/Net 30 for commercial contracts. Set your terms under Invoices when drafting a bill.'},
  {section:'invoices',match:/\b(?:past due|delinquent|overdue invoice|unpaid client|won't pay|refuses to pay)\b/i,
    answer:'In Invoices, check the overdue days and balance, then use Payment reminders to schedule an approved follow-up or log a callback in Follow-ups.'},

  // Leads
  {section:'leads',match:/\b(?:excel|xlsx|csv|spreadsheet|import|upload)\b/i,
    answer:'You can bring existing contacts into Leads. Choose Import spreadsheet, map the columns, then review before confirming.',
    steps:'Open Leads → Choose Import spreadsheet → Select your file → Map its columns → Review errors and duplicates → Confirm the import.'},
  {section:'leads',match:/\b(?:column map|deduplicat|duplicate|clean contacts)\b/i,
    answer:'In Leads, choose Import spreadsheet to map columns, inspect highlighted duplicate rows, and review before confirming.'},
  {section:'leads',match:/\b(?:pipeline|lead stages?|move lead|crm stages?)\b/i,
    answer:'In Leads, advance enquiries across stages: New → Quoted → Booked → Done. When a customer agrees to a proposal, mark the lead Quoted or Booked.'},

  // Jobs
  {section:'jobs',match:/\b(?:schedule|calendar|book|appointment|assign|dispatch|crew)\b/i,
    answer:'Open Jobs & dispatch to schedule a job, choose a date and assign your crew.'},
  {section:'jobs',match:/\b(?:conflict|overlap|reassign|technician status|dispatch board)\b/i,
    answer:'In Jobs & dispatch, check assigned team members on the calendar and adjust appointments to avoid crew conflicts.'},
  {section:'jobs',match:/\b(?:reschedul\w*|cancel (?:a )?job|postpone|change date|move appointment)\b/i,
    priority:2,answer:'In Jobs & dispatch, select the appointment to change the date, time, or assigned technician. Use Follow-ups to note customer confirmations.',
    steps:'Open Jobs & dispatch → Select the existing appointment → Adjust the date, time, or crew → Check for conflicts → Save your changes.'},

  // Quotes
  {section:'quotes',match:/\b(?:quote|estimate|quotation|proposal|bid)\b/i,
    priority:-1,answer:'In Estimates & quotes, create an estimate, review the line items and send it for customer approval.'},
  {section:'quotes',match:/\b(?:change order|extra work|extra material|scope change|added scope)\b/i,
    answer:'When scope changes, revise your proposal in Estimates & quotes for customer sign-off, update Jobs & dispatch, then add the extra line items to Invoices.'},
  {section:'quotes',match:/\b(?:job cost\w*|markup|profit margin|labor and material|price a job)\b/i,
    answer:'In Estimates & quotes, itemize labor hours and material costs separately with your standard markup to keep pricing transparent and profitable.'},

  // Reminders
  {section:'reminders',match:/\b(?:overdue|late payment|payment reminders?|chase payment)\b/i,
    answer:'Payment reminders helps prepare follow-ups for unpaid invoices. Review the recipient, timing and delivery setup first.'},

  // Settings
  {section:'settings',match:/\b(?:customiz|customis|hide tool|show tool|which modules)\b/i,
    answer:'Open Settings → Customize tools to choose the modules shown in your workspace. Your records remain safe when you hide a tool.'},
  {section:'settings',match:/\b(?:export|backup|download data|csv export|accountant)\b/i,
    answer:'Open Settings → Data & export to download your saved records as JSON.'},
  {section:'settings',match:/\b(?:gst setup|gst declaration|gstin|interstate|intrastate)\b/i,
    answer:'Under Settings → Business profile, enter your GSTIN and home state. In Invoices, tax rates on line items will calculate CGST/SGST or IGST automatically.'},

  // Follow-ups
  {section:'followups',match:/\b(?:callback|follow.?up|to.do)\b/i,
    answer:'Use Follow-ups to create a callback or next-step task with a due date.'},

  // Reviews
  {section:'reviews',match:/\b(?:review|testimonial|feedback|rating)\b/i,
    priority:-1,answer:'Use Reviews to prepare a customer feedback request after a completed job.'},
  {section:'reviews',match:/\b(?:more (?:google )?reviews|5[- ]star|boost reviews|best time to ask for review)\b/i,
    answer:'Request reviews within 24 hours of completing work. In Reviews, choose the finished job and send the feedback link while the experience is fresh.'},

  // Payments
  {section:'payments',match:/\b(?:bank match|reconcil|deposit|paid)\b/i,
    answer:'Open Payments to review incoming deposits and match them to the correct invoice.'},
  {section:'payments',match:/\b(?:partial|split payment|unmatched)\b/i,
    answer:'Use Payments → Payment Ledger & Allocation for partial payments and split allocations. Record the verified amount, select issued invoices and confirm each allocation. Void a receipt with a reason to reverse its allocations. Bank Matching separately supports deposits equal to an invoice total.'},
  {section:'payments',match:/\b(?:upfront deposit|down payment|retainer|deposit before work)\b/i,
    answer:'Specify deposit terms on your quote, issue an initial invoice in Invoices, and record the incoming deposit in Payments to track the remaining balance.'},
  {section:'payments',match:/\b(?:undo match|wrong invoice matched|unmatch)\b/i,
    priority:2,answer:'There is no Undo match control currently. Review the linked invoice and contact Help & Support before correcting an incorrect match.',
    steps:'Open Bank Matching → Review the matched deposit and linked invoice → Contact Help & Support before correcting an incorrect match.'}
];

export function conciseGuideResponse(question,topic,source='guide'){
  if(!topic||!GUIDE_SECTIONS.includes(topic.section))return unknownGuideResponse();
  const task=TASKS.filter(item=>item.section===topic.section&&item.match.test(question))
    .sort((a,b)=>(b.priority||0)-(a.priority||0)||
      (String(question).match(b.match)?.[0].length||0)-(String(question).match(a.match)?.[0].length||0))[0];
  const brief=task?.answer||topic.answer;
  return {reply:brief,location:topic.location,steps:task?.steps||(topic.location+' → '+topic.steps.replace(/^Open [^→]+→\s*/,'')),section:topic.section,title:topic.title,source,matched:true};
}

export function verifiedGuideTask(question){
  const topic=pickGuide(question);
  return topic.matched&&TASKS.some(task=>task.section===topic.section&&task.priority>=3&&task.match.test(question))
    ?conciseGuideResponse(question,topic):null;
}
