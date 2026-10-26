// Read-only, explainable tool recommendations for businesses of any trade.
// The engine runs locally; no customer records, paid AI API or trained model needed.
// Suggestions are about Cerium's existing tools, not newly invented features.
import {WORKSPACE_MODULES,defaultModules,isIndustry} from './industry-workspaces.js';

const MODULES=new Map(WORKSPACE_MODULES.map(x=>[x.id,x]));
const MODULE_REASONS=Object.freeze({
  jobs:'Plan appointments, field visits and work assignments.',
  leads:'Keep track of enquiries and potential customers.',
  quotes:'Prepare itemized estimates for customer approval.',
  followups:'Keep callbacks and next steps from getting lost.',
  invoices:'Create and review invoices for completed work.',
  payments:'Review received payments and invoice reconciliation.',
  reminders:'Prepare payment follow-ups; automatic delivery depends on configuration.',
  reviews:'Request customer feedback after completing work.'
});
// Examples cover service, retail and professional businesses outside the original
// contractor-specific preset categories. We only suggest existing modules.
const BUSINESS_PATTERNS=[
  {name:'appointment-based services',regex:/salon|barber|beauty|spa\b|nail studio|massage|fitness|personal train|yoga|tutor|music lesson|language class|pet groom|dog groom|daycare|photograph|portrait|videograph/i,modules:['jobs','leads','followups','invoices','payments','reviews']},
  {name:'shops and retail',regex:/retail|boutique|clothing store|fashion shop|online store|e.?commerce|shopkeeper|grocery|supermarket|bakery|cafe|coffee shop|restaurant|food stall|food truck|flower shop|florist|bookshop/i,modules:['invoices','payments','leads','reviews']},
  {name:'project-based creative work',regex:/creative agency|marketing agency|advertis|graphic design|web design|software development|architect|interior design|video production|wedding plan|event plan|cater|custom furniture|woodwork/i,modules:['leads','quotes','jobs','followups','invoices','payments']},
  {name:'repeat local services',regex:/clean|janitor|laundr|car detail|mobile detail|auto detail|car wash|pool service|landscap|pest control|security service|dog walk|pet sit|maintenance/i,modules:['jobs','leads','invoices','payments','reviews','followups']},
  {name:'professional services',regex:/consult|accountan|bookkeep|freelanc|coaching|recruit|law firm|legal service|financial advisor|translation service|public relat/i,modules:['leads','quotes','followups','invoices','payments']},
  {name:'field repairs and installations',regex:/plumb|electric|hvac|refrigerat|construction|contractor|handyman|mechanic|repair|install|roof|paint|carpentr|renovat/i,modules:['jobs','quotes','invoices','payments','leads','reviews']}
];
const WORKFLOWS=[
  {regex:/appoint|bookings?|reservations?|schedule|calendar|dispatch|crew|technician|site visit|visits?|field work|shifts?|class sessions?|lessons?|deliveries|on.?site/i,modules:['jobs'],reason:'You described appointments, bookings or scheduled work.'},
  {regex:/enquir|inquir|new clients?|new customers?|potential customers?|prospects?|leads?|marketing|sales pipeline|customer acquisition|excel|spreadsheet|csv|contacts? list/i,modules:['leads'],reason:'You want to capture enquiries or bring in customer contacts.'},
  {regex:/quotes?|quotations?|estimates?|proposals?|project pric|bids?|price before|custom orders?|scope of work/i,modules:['quotes'],reason:'You price work or seek approval before starting.'},
  {regex:/follow.?up|callbacks?|call clients?|check.?ins?|customer messages?|next steps?|chase prospects?/i,modules:['followups'],reason:'You need to remember customer follow-ups and next steps.'},
  {regex:/invoices?|bill(?:ing)? (?:customers?|clients?)|charge (?:customers?|clients?)|bill(?:ing)? for|receivables?/i,modules:['invoices'],reason:'You bill customers and need clear invoices.'},
  {regex:/payments?|deposits?|bank transfer|reconcil|money received|paid invoices?|transactions?|cash flow/i,modules:['payments'],reason:'You track money received from customers.'},
  {regex:/overdue|late pay|unpaid invoices?|payment reminders?|collect debts?|chase payments?|due notices?/i,modules:['reminders'],reason:'You need to follow up about outstanding payments.'},
  {regex:/reviews?|ratings?|testimonials?|feedback|reputation|google review/i,modules:['reviews'],reason:'You want to collect post-service customer feedback.'}
];
const LIMITATIONS=[
  {regex:/retail|boutique|store|shop|restaurant|cafe|bakery|grocery|e.?commerce|stock|inventory|pos\b|point of sale/i,
    text:'Cerium is not a point-of-sale, inventory or online-ordering system.'},
  {regex:/doctor|clinic|patient|hospital|therapy|medical|dental|healthcare/i,
    text:'Cerium is not a clinical record, medical scheduling compliance or patient-management system.'},
  {regex:/payroll|salary|wage|employee attendance|hr system/i,
    text:'Cerium does not provide payroll or full HR management.'},
  {regex:/delivery tracking|gps|route optimization|fleet management/i,
    text:'Cerium does not provide live fleet tracking or route optimization.'}
];
const INTRO=/\b(?:suggest|recommend|which|what|best|necessary|essential|ideal|suitable|choose|pick|need|should)\b.{0,95}\b(?:tools?|modules?|features?|workspace|cerium)\b/i;
export function isToolRecommendationRequest(question=''){
  const text=String(question||'').slice(0,420);
  return INTRO.test(text)||
    /\b(?:tools?|modules?|features?)\b.{0,75}\b(?:for|fit|suit)\b.{0,75}\b(?:business|company|shop|studio|agency|trade)\b/i.test(text)||
    /\b(?:set.?up|organize|personalize|customize)\b.{0,30}\b(?:my|our)\b.{0,25}\b(?:business|company|workspace)\b/i.test(text)||
    /\b(?:i run|i own|we run|our business is)\b.{0,160}\b(?:which tools?|what tools?|what should i use|recommend|suggest)\b/i.test(text)||
    /^(?:i (?:run|own|operate|have)|we (?:run|own|operate)|my business is|our business is|i(?:'m| am) running)\b.{3,150}\b(?:business|company|shop|studio|salon|agency|bakery|restaurant|boutique|service|practice|store|plumbing|hvac|consulting|photography|grooming|gym)\b/i.test(text);
}
export function recommendBusinessTools({description='',trade='',category='other',enabledModules=[]}={}){
  const selectedCategory=isIndustry(category)?category:'other';
  const input=(String(description||'').slice(0,420)+' '+String(trade||'').slice(0,120)).trim();
  const scored=new Map();
  const detected=[];
  let evidence=0;
  function add(id,score,reason){
    if(!MODULES.has(id))return;
    const row=scored.get(id)||{id,label:MODULES.get(id).label,score:0,reasons:[]};
    row.score+=score;
    if(reason&&!row.reasons.includes(reason))row.reasons.push(reason);
    scored.set(id,row);
  }
  if(selectedCategory!=='other'){
    const categoryName=selectedCategory.replace(/[-_]/g,' ');
    for(const id of defaultModules(selectedCategory))add(id,1.4,'A useful starting point for '+categoryName+' businesses.');
    evidence++;
  }
  for(const pattern of BUSINESS_PATTERNS){
    if(pattern.regex.test(input)){
      detected.push(pattern.name);
      for(const id of pattern.modules)add(id,2,'Commonly useful for '+pattern.name+'.');
      evidence++;
      break; // Prioritize the strongest business type, then individual workflows.
    }
  }
  for(const workflow of WORKFLOWS){
    if(workflow.regex.test(input)){
      for(const id of workflow.modules)add(id,3.2,workflow.reason);
      evidence++;
    }
  }
  const limitations=LIMITATIONS.filter(x=>x.regex.test(input)).map(x=>x.text);
  if(!evidence){
    return {
      type:'tool_recommendations',source:'advisor',needsMoreInfo:true,
      reply:'Tell me what kind of business you run and how you work—for example, whether you book appointments, send estimates, invoice customers or collect reviews. I can then recommend the Cerium tools that fit.',
      category:selectedCategory,modules:[],recommendations:[],limitations
    };
  }
  const recommendations=[...scored.values()]
    .sort((a,b)=>b.score-a.score||WORKSPACE_MODULES.findIndex(x=>x.id===a.id)-WORKSPACE_MODULES.findIndex(x=>x.id===b.id))
    .slice(0,6).map(({id,label,reasons})=>({id,label,reason:reasons.find(x=>x.startsWith('You '))||reasons.find(x=>!x.startsWith('A useful starting point'))||reasons[0]||MODULE_REASONS[id],
      currentlyEnabled:Array.isArray(enabledModules)&&enabledModules.includes(id)}));
  const summary=detected.length?'For your '+detected[0]+' business, I would start with these Cerium tools.':
    'Based on the business work you described, I recommend these Cerium tools.';
  return {
    type:'tool_recommendations',source:'advisor',needsMoreInfo:false,
    reply:summary+' Review the suggestions, then choose which tools to show in Settings. Nothing has been changed.',
    category:selectedCategory,modules:recommendations.map(x=>x.id),recommendations,
    limitations
  };
}
