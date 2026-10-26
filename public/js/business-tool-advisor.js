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

// Specialized business archetypes supplement the general workflow scorer.
// For a textile shop, distinguish retail, trade orders, tailoring, and manufacturing.
const TEXTILE_TERMS=/\b(?:textiles?|fabrics?|cloth(?:ing|es)?|garments?|sarees?|saris?|dress materials?|apparel|yarns?|silks?|cotton shop|draper(?:y|ies)|haberdashery|tailor(?:ing)?|stitching|seamstress|alterations?)\b/i;
const TEXTILE_WHOLESALE=/\b(?:wholesal(?:e|er|ers|ing)|bulk|b2b|distribut(?:e|or|ion)|suppl(?:y|ier|iers)|dealer|trade buyers?|reseller|large orders?)\b/i;
const TEXTILE_TAILOR=/\b(?:tailor(?:ing)?|stitch(?:ing|es)?|alterations?|custom.?made|made.to.measure|bespoke|sewing|outfit orders?)\b/i;
const TEXTILE_MANUFACTURING=/\b(?:manufactur(?:e|er|ing)|factories|factory|mill|weav(?:e|ing)|spin(?:ning)?|production plant)\b/i;
const COMMON_BIZ=/\b(?:shop|store|business|company|studio|agency|workshop|service|firm|practice|factory|boutique|retail|wholesale|merchant|trading|trader|seller|salon|restaurant|cafe|bakery)\b/i;
const BIZ_INTRO=/\b(?:i|we|my|our)\b.{0,35}\b(?:run|own|operate|sell|selling|make|manufacture|business|shop|store|studio|factory|workshop|company|supply)\b/i;
const TEXTILE_LIMIT='Cerium does not track textile stock, sizes, SKUs or barcode/POS sales; use a dedicated inventory/POS system for those tasks.';
const textileQuestion='Do you mostly serve walk-in retail customers, wholesale buyers, or custom tailoring orders? I can refine this setup.';
const textileModes={
  retail:{
    title:'textile shop',
    core:[
      ['invoices','Create customer invoices for fabric, clothing and other textile purchases.'],
      ['payments','Review payments received against customer invoices.']
    ],
    useful:[
      ['leads','Useful if you keep a list of repeat buyers or take customer enquiries.'],
      ['quotes','Useful for bulk fabric orders or custom orders that need price approval.']
    ]
  },
  wholesale:{
    title:'wholesale textile business',
    core:[
      ['quotes','Prepare itemized quotes for bulk fabric or garment orders.'],
      ['invoices','Bill wholesale customers for confirmed orders.'],
      ['payments','Review customer payments and invoice balances.']
    ],
    useful:[
      ['leads','Track trade enquiries and buyers before they order.'],
      ['followups','Keep track of repeat buyers and outstanding quotes.']
    ]
  },
  tailoring:{
    title:'tailoring and custom textile business',
    core:[
      ['jobs','Schedule fittings, alterations or commissioned work.'],
      ['quotes','Estimate the price of custom stitching or garments.'],
      ['invoices','Invoice customers when work is ready.']
    ],
    useful:[
      ['payments','Review payments and deposits recorded for invoices.'],
      ['followups','Track customer pickups, callbacks and next steps.']
    ]
  },
  manufacturing:{
    title:'textile manufacturing business',
    core:[
      ['quotes','Prepare proposals for customer production orders.'],
      ['invoices','Invoice buyers for fulfilled orders.'],
      ['payments','Review incoming invoice payments.']
    ],
    useful:[
      ['leads','Track potential distribution and wholesale customers.'],
      ['followups','Manage customer follow-ups and pending proposals.']
    ]
  }
};
function textileProfile(input){
  if(!TEXTILE_TERMS.test(input))return null;
  const mode=TEXTILE_TAILOR.test(input)?'tailoring':TEXTILE_MANUFACTURING.test(input)?'manufacturing':
    TEXTILE_WHOLESALE.test(input)?'wholesale':'retail';
  return {mode,profile:textileModes[mode]};
}
function recommendTextileTools(input,enabledModules,category){
  const {mode,profile}=textileProfile(input);
  const recommendations=[...profile.core.map(([id,reason])=>({id,reason,priority:'core'})),
    ...profile.useful.map(([id,reason])=>({id,reason,priority:'optional'}))].map(item=>({
      ...item,label:MODULES.get(item.id).label,
      currentlyEnabled:Array.isArray(enabledModules)&&enabledModules.includes(item.id)
    }));
  const followUp=mode==='retail'?textileQuestion:null;
  const note=mode==='retail'?'This covers billing and customer relationships, not a retail checkout.':
    'These cover the customer-facing workflow, not production, inventory or accounting.';
  return {
    type:'tool_recommendations',source:'advisor',needsMoreInfo:false,category,
    modules:recommendations.map(x=>x.id),recommendations,
    reply:'For a '+profile.title+', start with '+profile.core.map(x=>MODULES.get(x[0]).label).join(' and ')+'. '+note+' Review the suggestions before saving any changes.',
    followUp,followUpOptions:followUp?['Walk-in retail','Wholesale / bulk','Tailoring / custom orders']:[],
    limitations:[TEXTILE_LIMIT]
  };
}

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
    /\b(?:recommend|suggest)\b.{0,105}\b(?:useful|suitable|right|best|me|us|my|our|for me|for us)\b/i.test(text)||
    /\b(?:what|which)\b.{0,75}\b(?:tools?|features?|modules?|should i use|do i need)\b/i.test(text)||
    (BIZ_INTRO.test(text)&&(TEXTILE_TERMS.test(text)||COMMON_BIZ.test(text)))||
    /\b(?:tools?|modules?|features?)\b.{0,75}\b(?:for|fit|suit)\b.{0,75}\b(?:business|company|shop|studio|agency|trade)\b/i.test(text)||
    /\b(?:set.?up|organize|personalize|customize)\b.{0,30}\b(?:my|our)\b.{0,25}\b(?:business|company|workspace)\b/i.test(text)||
    /\b(?:i run|i own|we run|our business is)\b.{0,160}\b(?:which tools?|what tools?|what should i use|recommend|suggest)\b/i.test(text)||
    /^(?:i (?:run|own|operate|have)|we (?:run|own|operate)|my business is|our business is|i(?:'m| am) running)\b.{3,150}\b(?:business|company|shop|studio|salon|agency|bakery|restaurant|boutique|service|practice|store|plumbing|hvac|consulting|photography|grooming|gym)\b/i.test(text);
}
export function recommendBusinessTools({description='',trade='',category='other',enabledModules=[]}={}){
  const selectedCategory=isIndustry(category)?category:'other';
  const primary=String(description||'').slice(0,420);
  const input=(primary+' '+String(trade||'').slice(0,120)).trim();
  // Respect the user's explicit industry: do not mix a textile shop with an
  // unrelated saved workspace preset such as 'construction'.
  if(textileProfile(primary)||textileProfile(input))
    return recommendTextileTools(textileProfile(primary)?primary:input,enabledModules,selectedCategory);
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
  if(!evidence && /\b(?:run|own|operate|sell|selling|produce|make|manufacture)\b/i.test(primary)&&COMMON_BIZ.test(primary)){
    // Unknown but sufficiently described business: offer cautious universal
    // customer-facing tools rather than asking for the same description again.
    const ids=['invoices','payments','leads'];
    const reasons={
      invoices:'Useful if you invoice customers for products or services.',
      payments:'Useful if you review payments against customer invoices.',
      leads:'Optional for tracking repeat buyers and new enquiries.'
    };
    const recommendations=ids.map((id,i)=>({
      id,label:MODULES.get(id).label,reason:reasons[id],
      priority:i===2?'optional':'core',
      currentlyEnabled:Array.isArray(enabledModules)&&enabledModules.includes(id)
    }));
    return {type:'tool_recommendations',source:'advisor',needsMoreInfo:false,
      category:selectedCategory,modules:ids,recommendations,
      reply:'I can suggest a starting point based on what you sell or do. Start with customer billing and payment review if those are part of your workflow. You can review these tools before saving.',
      followUp:'Do you mainly sell products, book appointments, or take custom project orders? I can narrow the recommendations.',
      followUpOptions:[],limitations:[]};
  }
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
