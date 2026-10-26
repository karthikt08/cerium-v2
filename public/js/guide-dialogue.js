// Shared conversation controls for Ask Cerium (server and offline preview).
// Neither a greeting nor an unsupported question should route to the current tab.
import {GUIDE_TOPICS, GUIDE_SECTIONS} from './guide-knowledge.js';

const TOPICS=new Map(GUIDE_TOPICS.map(topic=>[topic.section,topic]));
const response=(kind,reply)=>({type:'conversation',kind,reply,section:null,title:null,steps:null,source:'guide'});
export const GUIDE_UNKNOWN="I don't want to point you to the wrong place. Tell me what you're trying to do in Cerium, or ask which tools would suit your business.";

export function unknownGuideResponse(){
  return response('unknown',GUIDE_UNKNOWN);
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
  if(/^(?:how (?:do|can|should) i (?:do|use|start|set up) (?:that|it)|how does (?:that|it) work|walk me through (?:that|it)|what(?:'s| is) the next step|what (?:now|next)|where (?:is|do i find) (?:that|it))$/.test(text)){
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
  {
    matches:/\b(?:from|turn|convert|after|process|workflow)\b.{0,110}\b(?:lead|prospect)\b.{0,115}\b(?:invoice|payment|paid)\b/i,
    reply:'For a customer-to-payment workflow: capture the lead, prepare a quote, schedule the approved work, create an invoice, then review the payment.',
    actions:['leads','quotes','jobs','invoices','payments'],
    steps:'Open Leads → Capture new enquiry → Open Estimates & quotes → Prepare proposal → Open Jobs & dispatch → Schedule approved work → Open Invoices → Bill customer → Open Payments → Match deposit.'
  },
  {
    matches:/\b(?:accepted|approved?|won)\b.{0,70}\b(?:quote|estimate|proposal)s?\b.{0,70}\b(?:job|schedul\w*|invoic\w*|bill\w*)\b/i,
    reply:'Review the approved estimate in Estimates & quotes, schedule the assigned crew in Jobs & dispatch, then generate the final invoice in Invoices once the job is completed.',
    actions:['quotes','jobs','invoices'],
    steps:'Open Estimates & quotes → Confirm customer approval → Open Jobs & dispatch → Schedule crew & date → Open Invoices → Generate customer invoice.'
  },
  {
    matches:/\b(?:convert|turn|move)\b.{0,50}\b(?:quote|estimate|proposal)s?\b.{0,50}\b(?:into|to)\b.{0,40}\b(?:job|appointment|schedul\w*)\b/i,
    reply:'Confirm the customer accepted the estimate in Estimates & quotes, then open Jobs & dispatch to book the appointment and assign your crew.',
    actions:['quotes','jobs'],
    steps:'Open Estimates & quotes → Mark quote accepted → Open Jobs & dispatch → Create job & assign crew.'
  },
  {
    matches:/\b(?:import|excel|csv|spreadsheet)\b.{0,130}\b(?:quote|estimate|proposal)s?\b/i,
    reply:'First import your contacts in Leads. Then open Estimates & quotes to prepare a quote for the customer.',
    actions:['leads','quotes'],
    steps:'Open Leads → Import spreadsheet → Map columns & confirm → Open Estimates & quotes → Prepare proposal.'
  },
  {
    matches:/\b(?:import|excel|csv|spreadsheet|migrate|bulk)\b.{0,90}\b(?:lead|contact|customer)s?\b.{0,90}\b(?:job|schedul\w*|dispatch)\b/i,
    reply:'Import contacts via Leads → Import spreadsheet, map customer columns and review duplicate flags, then book scheduled appointments in Jobs & dispatch.',
    actions:['leads','jobs'],
    steps:'Open Leads → Import spreadsheet → Map columns & verify duplicates → Open Jobs & dispatch → Book appointments.'
  },
  {
    matches:/\b(?:schedul\w*|jobs?|appointments?|work)\b.{0,90}\b(?:invoic\w*|bill(?:ing)?)\b/i,
    reply:'Schedule the work in Jobs & dispatch, then create the customer invoice in Invoices after reviewing the completed work.',
    actions:['jobs','invoices'],
    steps:'Open Jobs & dispatch → Book & complete work → Open Invoices → Create invoice with line items.'
  },
  {
    matches:/\b(?:partial payment|split payment|deposit match|bank match|reconcil\w*)\b.{0,90}\b(?:deposit|payment|invoice|transaction|balance|bank)s?\b/i,
    reply:'Check the unpaid balance in Invoices, review incoming bank transactions in Payments, and confirm the match. Cerium records partial payments and updates the remaining balance automatically.',
    actions:['invoices','payments'],
    steps:'Open Invoices → Check invoice balance → Open Payments → Review bank deposit → Match to invoice → Remaining balance updates.'
  },
  {
    matches:/\b(?:unpaid|overdue|late payment|chase payment|escalat\w*)\b.{0,70}\b(?:remind\w*|follow.?up|chase|notif\w*)\b/i,
    reply:'First check the invoice in Invoices. Then use Payment reminders to prepare a follow-up, subject to your delivery settings.',
    actions:['invoices','reminders'],
    steps:'Open Invoices → Check overdue balance → Open Payment reminders → Review timing & message → Schedule approved reminder.'
  },
  {
    matches:/\b(?:gst|tax|vat|tax declaration|tax rate)s?\b.{0,90}\b(?:invoic\w*|bill\w*|breakdown|draft)s?\b/i,
    reply:'Verify your business GST declaration and tax ID in Settings → Business profile, then create or review line-item tax rates in Invoices. Use Preview to inspect the tax breakdown before saving the PDF.',
    actions:['settings','invoices'],
    steps:'Open Settings → Business profile → Check tax/GST info → Open Invoices → Set tax rates on items → Preview breakdown → Save PDF.'
  },
  {
    matches:/\b(?:crew|technician|worker|staff|dispatch)s?\b.{0,90}\b(?:conflict\w*|overlap\w*|double book\w*|assign\w*|reassign\w*)\b/i,
    reply:'Check technician assignments and resolve overlapping appointments in Jobs & dispatch, then record customer confirmations or crew tasks in Follow-ups.',
    actions:['jobs','followups'],
    steps:'Open Jobs & dispatch → Check calendar & resolve overlaps → Open Follow-ups → Save crew instructions or customer confirmation.'
  },
  {
    matches:/\b(?:complet\w*|finish\w*|done)\b.{0,70}\b(?:job|work|appointment)s?\b.{0,70}\b(?:review|rating|testimonial|feedback)s?\b/i,
    reply:'Mark the completed appointment Done in Jobs & dispatch, then open Reviews to select the customer, verify the review link, and send the feedback request.',
    actions:['jobs','reviews'],
    steps:'Open Jobs & dispatch → Mark job Done → Open Reviews → Select customer/job → Verify review link → Send request.'
  },
  {
    matches:/\b(?:review|rating|testimonial|feedback)s?\b.{0,70}\b(?:after|once|when)\b.{0,70}\b(?:job|work|complet\w*|finish\w*)s?\b/i,
    reply:'Mark the completed appointment Done in Jobs & dispatch, then open Reviews to select the customer, verify the review link, and send the feedback request.',
    actions:['jobs','reviews'],
    steps:'Open Jobs & dispatch → Mark job Done → Open Reviews → Select customer/job → Verify review link → Send request.'
  },
  {
    matches:/\b(?:end of month|month end|closeout|close out|bookkeep\w*|accountant)\b.{0,90}\b(?:reconcil\w*|export\w*|report\w*|audit|data)\b/i,
    reply:'Audit open balances in Invoices, confirm matched bank deposits in Payments, then open Settings → Data & export to download your verified accounting records.',
    actions:['invoices','payments','settings'],
    steps:'Open Invoices → Check open balances → Open Payments → Match deposits → Open Settings → Data & export → Download verified export.'
  }
];

export function workflowReply(question){
  const text=String(question||'').trim().slice(0,420);
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
  {section:'invoices',match:/\b(?:pdf|download|print|save (?:an? )?invoice)\b/i,
    answer:'To save an invoice as a PDF, open Invoices, preview the invoice, then choose Print / save PDF.'},
  {section:'invoices',match:/\b(?:gst|tax rate|tax declaration|tax breakdown|hsn|sac)\b/i,
    answer:'In Invoices, set tax rate percentages per line item and check the tax summary in invoice preview.'},
  {section:'leads',match:/\b(?:excel|xlsx|csv|spreadsheet|import|upload)\b/i,
    answer:'You can bring existing contacts into Leads. Choose Import spreadsheet, map the columns, then review before confirming.'},
  {section:'leads',match:/\b(?:column map|deduplicat|duplicate|clean contacts)\b/i,
    answer:'In Leads, choose Import spreadsheet to map columns, inspect highlighted duplicate rows, and review before confirming.'},
  {section:'jobs',match:/\b(?:schedule|calendar|book|appointment|assign|dispatch|crew)\b/i,
    answer:'Open Jobs & dispatch to schedule a job, choose a date and assign your crew.'},
  {section:'jobs',match:/\b(?:conflict|overlap|reassign|technician status|dispatch board)\b/i,
    answer:'In Jobs & dispatch, check assigned team members on the calendar and adjust appointments to avoid crew conflicts.'},
  {section:'quotes',match:/\b(?:quote|estimate|quotation|proposal|bid)\b/i,
    answer:'In Estimates & quotes, create an estimate, review the line items and send it for customer approval.'},
  {section:'reminders',match:/\b(?:overdue|late payment|payment reminders?|chase payment)\b/i,
    answer:'Payment reminders helps prepare follow-ups for unpaid invoices. Review the recipient, timing and delivery setup first.'},
  {section:'settings',match:/\b(?:customiz|customis|hide tool|show tool|which modules)\b/i,
    answer:'Open Settings → Customize tools to choose the modules shown in your workspace. Your records remain safe when you hide a tool.'},
  {section:'settings',match:/\b(?:export|backup|download data|csv export|accountant)\b/i,
    answer:'Open Settings → Data & export to download your complete verified records in CSV and JSON formats.'},
  {section:'followups',match:/\b(?:callback|follow.?up|to.do)\b/i,
    answer:'Use Follow-ups to create a callback or next-step task with a due date.'},
  {section:'reviews',match:/\b(?:review|testimonial|feedback|rating)\b/i,
    answer:'Use Reviews to prepare a customer feedback request after a completed job.'},
  {section:'payments',match:/\b(?:bank match|reconcil|deposit|paid)\b/i,
    answer:'Open Payments to review incoming deposits and match them to the correct invoice.'},
  {section:'payments',match:/\b(?:partial|split payment|undo match|unmatched)\b/i,
    answer:'Payments handles partial and full deposit matching. If a deposit is partially paid, Cerium updates the invoice balance automatically.'}
];

export function conciseGuideResponse(question,topic,source='guide'){
  if(!topic||!GUIDE_SECTIONS.includes(topic.section))return unknownGuideResponse();
  const task=TASKS.find(item=>item.section===topic.section&&item.match.test(question));
  const brief=task?.answer||topic.answer.split(/(?<=[.!?])\s+/)[0];
  return {reply:brief,steps:topic.steps,section:topic.section,title:topic.title,source,matched:true};
}
