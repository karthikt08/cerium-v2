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
    matches:/\b(?:from|turn|convert|after|process|workflow)\b.{0,110}\b(?:lead|prospect|quote|estimate)\b.{0,115}\b(?:invoice|payment|paid)\b/i,
    reply:'For a customer-to-payment workflow: capture the lead, prepare a quote, schedule the approved work, create an invoice, then review the payment.',
    actions:['leads','quotes','jobs','invoices','payments']
  },
  {
    matches:/\b(?:import|excel|csv|spreadsheet)\b.{0,130}\b(?:quote|estimate|proposal)\b/i,
    reply:'First import your contacts in Leads. Then open Estimates & quotes to prepare a quote for the customer.',
    actions:['leads','quotes']
  },
  {
    matches:/\b(?:schedul|jobs?|appointments?|work)\b.{0,90}\b(?:invoic|bill(?:ing)?)\b/i,
    reply:'Schedule the work in Jobs & dispatch, then create the customer invoice in Invoices after reviewing the completed work.',
    actions:['jobs','invoices']
  },
  {
    matches:/\b(?:unpaid|overdue|late payment)\b.{0,70}\b(?:remind|follow.?up|chase)\b/i,
    reply:'First check the invoice in Invoices. Then use Payment reminders to prepare a follow-up, subject to your delivery settings.',
    actions:['invoices','reminders']
  }
];
export function workflowReply(question){
  const text=String(question||'').trim().slice(0,420);
  const plan=WORKFLOWS.find(item=>item.matches.test(text));
  if(!plan)return null;
  return {
    type:'workflow',source:'guide',reply:plan.reply,
    section:null,title:null,steps:null,
    actions:plan.actions.filter(section=>GUIDE_SECTIONS.includes(section))
      .map(section=>({section,title:TOPICS.get(section).title}))
  };
}

const TASKS=[
  {section:'invoices',match:/\b(?:pdf|download|print|save (?:an? )?invoice)\b/i,
    answer:'To save an invoice as a PDF, open Invoices, preview the invoice, then choose Print / save PDF.'},
  {section:'leads',match:/\b(?:excel|xlsx|csv|spreadsheet|import|upload)\b/i,
    answer:'You can bring existing contacts into Leads. Choose Import spreadsheet, map the columns, then review before confirming.'},
  {section:'jobs',match:/\b(?:schedule|calendar|book|appointment|assign|dispatch|crew)\b/i,
    answer:'Open Jobs & dispatch to schedule a job, choose a date and assign your crew.'},
  {section:'quotes',match:/\b(?:quote|estimate|quotation|proposal|bid)\b/i,
    answer:'In Estimates & quotes, create an estimate, review the line items and send it for customer approval.'},
  {section:'reminders',match:/\b(?:overdue|late payment|payment reminders?|chase payment)\b/i,
    answer:'Payment reminders helps prepare follow-ups for unpaid invoices. Review the recipient, timing and delivery setup first.'},
  {section:'settings',match:/\b(?:customiz|customis|hide tool|show tool|which modules)\b/i,
    answer:'Open Settings → Customize tools to choose the modules shown in your workspace. Your records remain safe when you hide a tool.'},
  {section:'followups',match:/\b(?:callback|follow.?up|to.do)\b/i,
    answer:'Use Follow-ups to create a callback or next-step task with a due date.'},
  {section:'reviews',match:/\b(?:review|testimonial|feedback|rating)\b/i,
    answer:'Use Reviews to prepare a customer feedback request after a completed job.'},
  {section:'payments',match:/\b(?:bank match|reconcil|deposit|paid)\b/i,
    answer:'Open Payments to review incoming deposits and match them to the correct invoice.'}
];
export function conciseGuideResponse(question,topic,source='guide'){
  if(!topic||!GUIDE_SECTIONS.includes(topic.section))return unknownGuideResponse();
  const task=TASKS.find(item=>item.section===topic.section&&item.match.test(question));
  const brief=task?.answer||topic.answer.split(/(?<=[.!?])\s+/)[0];
  return {reply:brief,steps:topic.steps,section:topic.section,title:topic.title,source,matched:true};
}
