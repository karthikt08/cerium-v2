// Cerium industry playbooks — aligned with the 10 categories in industry-workspaces.js.
// This file describes customer-facing tools that really exist in the product;
// it is NOT trade-specific regulatory, technical, tax or accounting advice.
import {INDUSTRY_PROFILES,WORKSPACE_MODULES,isIndustry} from './industry-workspaces.js';

const VALID=new Set(WORKSPACE_MODULES.map(m=>m.id));
const labels=new Map(WORKSPACE_MODULES.map(m=>[m.id,m.label]));
const tip=(id,reason)=>({id,reason});

// Each profile has a concrete service workflow, four or fewer essentials, and
// optional tools that make sense for that industry. No invented integrations.
export const CERIUM_INDUSTRY_PLAYBOOKS=Object.freeze({
  construction:{
    title:'construction & renovation business',
    core:[
      tip('quotes','Price labor, materials and project scope before a client approves the work.'),
      tip('jobs','Organize booked projects, site visits, dates and crew assignments.'),
      tip('invoices','Create customer invoices with itemized project charges.'),
      tip('payments','Review received deposits and payments against project invoices.')
    ],
    optional:[
      tip('leads','Track new renovation enquiries before quoting a project.'),
      tip('followups','Remember site-survey callbacks and quotes awaiting a decision.')
    ],
    workflow:'Enquiry → estimate → schedule site work → invoice → review payment.',
    followUp:'Do you mostly handle one-off renovations, ongoing construction projects, or maintenance contracts?',
    followUpOptions:['One-off renovations','Larger projects','Maintenance contracts'],
    limitations:['Cerium is not a construction drawing, permitting, materials procurement or payroll system.']
  },
  plumbing:{
    title:'plumbing business',
    core:[
      tip('jobs','Schedule emergency repairs, installations and customer call-outs.'),
      tip('quotes','Estimate labor and parts before larger repair or installation work.'),
      tip('invoices','Bill customers for completed plumbing visits and installations.'),
      tip('payments','Review payment records against your plumbing invoices.')
    ],
    optional:[
      tip('followups','Remember callbacks for repairs, return visits or customer decisions.'),
      tip('reviews','Request feedback after a completed service visit.')
    ],
    workflow:'Customer call → job or estimate → service visit → invoice → review payment.',
    followUp:'Do you mostly handle emergency call-outs, planned installations, or maintenance visits?',
    followUpOptions:['Emergency call-outs','Planned installations','Maintenance visits'],
    limitations:['Cerium does not manage plumbing parts inventory or issue regulatory inspection certificates.']
  },
  electrical:{
    title:'electrical services business',
    core:[
      tip('jobs','Schedule electrical service calls, inspections and installation visits.'),
      tip('quotes','Quote rewiring, panels, fittings and larger electrical projects.'),
      tip('invoices','Prepare itemized bills for completed electrical work.'),
      tip('payments','Reconcile recorded customer payments with invoices.')
    ],
    optional:[
      tip('leads','Track prospective wiring or installation customers before booking.'),
      tip('reviews','Collect feedback after a completed electrical job.')
    ],
    workflow:'Customer enquiry → estimate → schedule electrician → invoice → review payment.',
    followUp:'Is most of your work residential repairs, new installations, or commercial projects?',
    followUpOptions:['Residential repairs','New installations','Commercial projects'],
    limitations:['Cerium does not replace electrical compliance, test certificates or safety inspection software.']
  },
  hvac:{
    title:'HVAC & refrigeration business',
    core:[
      tip('jobs','Organize technician visits for repairs, servicing and installations.'),
      tip('quotes','Estimate air-conditioning, heating or refrigeration installation costs.'),
      tip('invoices','Invoice repair visits, service work and completed installations.'),
      tip('payments','Check customer payments and invoice reconciliation.')
    ],
    optional:[
      tip('followups','Track service callbacks and future maintenance conversations.'),
      tip('reminders','Prepare follow-ups for overdue service invoices if needed.')
    ],
    workflow:'Service enquiry → appointment or estimate → technician visit → invoice → payment review.',
    followUp:'Do you focus on installation projects, breakdown repairs, or maintenance servicing?',
    followUpOptions:['Installations','Breakdown repairs','Maintenance servicing'],
    limitations:['Cerium does not monitor HVAC equipment remotely or manage spare-parts inventory.']
  },
  cleaning:{
    title:'cleaning & maintenance business',
    core:[
      tip('jobs','Schedule home cleans, property maintenance or site visits.'),
      tip('invoices','Invoice customers for cleaning visits or contracted work.'),
      tip('payments','Review recorded payments for completed services.'),
      tip('reviews','Ask for customer feedback after a completed cleaning service.')
    ],
    optional:[
      tip('followups','Remember renewal conversations and repeat-customer callbacks.'),
      tip('leads','Organize new enquiries for domestic or commercial cleaning.')
    ],
    workflow:'Enquiry → schedule cleaning → finish visit → invoice → request feedback.',
    followUp:'Do you primarily do one-time cleaning, regular weekly visits, or commercial contracts?',
    followUpOptions:['One-time cleaning','Regular visits','Commercial contracts'],
    limitations:['Cerium does not provide automatic recurring-visit generation or cleaner clock-in/payroll.']
  },
  landscaping:{
    title:'landscaping & gardening business',
    core:[
      tip('jobs','Schedule gardening visits, lawn care and landscape installations.'),
      tip('quotes','Estimate plants, labor and scope for a garden or landscaping project.'),
      tip('invoices','Bill clients for finished maintenance or landscaping work.'),
      tip('payments','Review payments received for garden projects and visits.')
    ],
    optional:[
      tip('leads','Capture requests for garden design, planting or lawn services.'),
      tip('reviews','Request feedback from customers after completed garden work.')
    ],
    workflow:'Garden enquiry → estimate → schedule outdoor work → invoice → feedback.',
    followUp:'Is most of your work recurring lawn maintenance, garden redesigns, or irrigation installs?',
    followUpOptions:['Lawn maintenance','Garden redesigns','Irrigation installs'],
    limitations:['Cerium does not provide route optimization, garden-design CAD or plant stock management.']
  },
  roofing:{
    title:'roofing business',
    core:[
      tip('leads','Track roof repair enquiries and new replacement prospects.'),
      tip('quotes','Prepare detailed estimates for roof repairs or replacements.'),
      tip('jobs','Schedule inspections, roof repairs and installation crews.'),
      tip('invoices','Invoice approved roofing work and completed projects.')
    ],
    optional:[
      tip('payments','Review recorded customer deposits and invoice payments.'),
      tip('followups','Follow up after roof inspections or quotes awaiting approval.')
    ],
    workflow:'Roof enquiry → inspection → estimate → booked crew → invoice → payment review.',
    followUp:'Do you mostly handle small roof repairs, full replacements, or gutter work?',
    followUpOptions:['Roof repairs','Full replacements','Gutters'],
    limitations:['Cerium is not a roof measurement, weather-forecast or construction safety system.']
  },
  painting:{
    title:'painting & finishing business',
    core:[
      tip('quotes','Estimate surface preparation, paint work and finishing costs.'),
      tip('jobs','Schedule painters, site visits and the days allocated to each project.'),
      tip('invoices','Bill clients for completed rooms, properties or painting jobs.'),
      tip('payments','Review payments recorded for completed painting work.')
    ],
    optional:[
      tip('leads','Manage enquiries from homeowners and property managers.'),
      tip('reviews','Request feedback after the finish is approved.')
    ],
    workflow:'Request → site estimate → schedule painting → invoice → customer feedback.',
    followUp:'Do you mainly paint residential interiors, commercial premises, or exteriors?',
    followUpOptions:['Interiors','Commercial sites','Exteriors'],
    limitations:['Cerium does not calculate paint quantities or manage color and materials inventory.']
  },
  handyman:{
    title:'handyman & home repair business',
    core:[
      tip('jobs','Book varied small repair visits and organize your daily job list.'),
      tip('invoices','Charge customers for completed labor and repair items.'),
      tip('quotes','Estimate larger repairs before a customer agrees to proceed.'),
      tip('payments','Review payments received against repair invoices.')
    ],
    optional:[
      tip('reviews','Ask satisfied customers to review completed repair work.'),
      tip('leads','Capture local repair enquiries and referrals.')
    ],
    workflow:'Customer request → quote if needed → repair appointment → invoice → review.',
    followUp:'Do you mostly take same-day small fixes, renovation jobs, or repeat property maintenance?',
    followUpOptions:['Small fixes','Renovations','Property maintenance'],
    limitations:['Cerium does not manage a hardware stockroom, tool inventory or employee payroll.']
  },
  consulting:{
    title:'consulting & freelance business',
    core:[
      tip('leads','Track prospective clients and new project enquiries.'),
      tip('quotes','Prepare proposals and estimates before engagements are approved.'),
      tip('followups','Keep track of discovery calls, client decisions and next steps.'),
      tip('invoices','Invoice clients for professional services and project milestones.')
    ],
    optional:[
      tip('payments','Review settled client invoices and recorded payments.'),
      tip('reminders','Prepare follow-ups when an approved invoice becomes overdue.')
    ],
    workflow:'Prospect → proposal → follow-up → approved work → invoice → payment review.',
    followUp:'Do you usually sell fixed-price projects, hourly work, or ongoing retainers?',
    followUpOptions:['Fixed-price projects','Hourly work','Retainer clients'],
    limitations:['Cerium does not include time tracking, contract e-signatures or a full client project portal.']
  }
});
const all=INDUSTRY_PROFILES.map(p=>p.id);
for(const id of all){
  const spec=CERIUM_INDUSTRY_PLAYBOOKS[id];
  if(!spec)throw new Error('Missing business playbook for '+id);
  for(const item of [...spec.core,...spec.optional])
    if(!VALID.has(item.id)||typeof item.reason!=='string')throw new Error('Invalid tool in '+id);
  if(new Set([...spec.core,...spec.optional].map(item=>item.id)).size!==spec.core.length+spec.optional.length)
    throw new Error('Duplicate tool in '+id);
  if(spec.core.length<2||spec.core.length>4||spec.core.length+spec.optional.length>6)
    throw new Error('Invalid playbook size for '+id);
}
const aliases=[
  {id:'construction',test:/\b(?:construction|builder|building|renovat\w*|remodel\w*|civil works?|general contract\w*|site work)\b/i},
  {id:'plumbing',test:/\b(?:plumb\w*|pipe repair|drain cleaning|water heater)\b/i},
  {id:'electrical',test:/\b(?:electric\w*|wiring|switchboard|power install|panel install)\b/i},
  {id:'hvac',test:/\b(?:hvac|heating|ventilation|air.condition\w*|refrigerat\w*|ac repair)\b/i},
  {id:'cleaning',test:/\b(?:clean\w*|janitor\w*|housekeep\w*|maid service|property maintenance)\b/i},
  {id:'landscaping',test:/\b(?:landscap\w*|garden\w*|lawn|irrigat\w*|yard care)\b/i},
  {id:'roofing',test:/\b(?:roof\w*|shingle\w*|gutter\w*)\b/i},
  {id:'painting',test:/\b(?:paint\w*|decorat\w*|wall finishing|coating)\b/i},
  {id:'handyman',test:/\b(?:handyman|handy.person|home repair|odd jobs?|carpentr\w*|furniture repair)\b/i},
  {id:'consulting',test:/\b(?:consult\w*|freelanc\w*|design agency|marketing agency|coaching|professional services?)\b/i}
];
export const SUPPORTED_INDUSTRY_IDS=Object.freeze([...all]);
// The user's expressed trade outranks an old saved category; if no trade is
// recognized, use the saved trade, then the official dropdown category.
export function identifyCeriumIndustry({description='',trade='',category='other'}={}){
  const find=text=>aliases.find(profile=>profile.test.test(String(text||'').slice(0,600)))?.id||null;
  return find(description)||(isIndustry(category)&&category!=='other'?category:null)||find(trade);
}
const changes=[
  {id:'reminders',match:/\b(?:overdue|late payments?|unpaid invoices?|payment reminders?|chase payments?|past.due|outstanding invoices?)\b/i,
    reason:'You mentioned overdue invoices, so payment reminders may be especially useful.'},
  {id:'reviews',match:/\b(?:reviews?|ratings?|testimonials?|customer feedback|google reviews?)\b/i,
    reason:'You want to collect reviews or feedback after delivering a service.'},
  {id:'leads',match:/\b(?:marketing|new clients?|new customers?|sales leads?|enquiries|inquiries|import.*(?:csv|excel|spreadsheet))\b/i,
    reason:'You mentioned customer acquisition or importing enquiries.'},
  {id:'quotes',match:/\b(?:quote|quotations?|estimates?|bids?|price projects?|proposals?)\b/i,
    reason:'You need to price work and get a customer decision before starting.'},
  {id:'followups',match:/\b(?:follow.ups?|callbacks?|chase clients?|pending decisions?|repeat clients?)\b/i,
    reason:'Customer callbacks and pending decisions are part of your workflow.'},
  {id:'jobs',match:/\b(?:appointments?|schedule|dispatch|crews?|site visits?|technicians?|book visits?)\b/i,
    reason:'You mentioned visits, bookings or scheduling field work.'},
  {id:'payments',match:/\b(?:deposits?|paid invoices?|bank transfers?|payments?|reconcil\w*)\b/i,
    reason:'You need to review payments against customer invoices.'}
];
export function recommendIndustryTools({description='',trade='',category='other',enabledModules=[]}={}){
  const id=identifyCeriumIndustry({description,trade,category});
  if(!id)return null;
  const profile=CERIUM_INDUSTRY_PLAYBOOKS[id];
  const text=String(description||'').slice(0,600);
  const core=profile.core.map(item=>({...item,priority:'core',weight:10}));
  const optional=profile.optional.map(item=>({...item,priority:'optional',weight:5}));
  const byId=new Map([...core,...optional].map(item=>[item.id,item]));
  for(const signal of changes){
    if(!signal.match.test(text))continue;
    const old=byId.get(signal.id);
    if(old){
      if(old.priority==='optional'){
        old.priority='core';old.weight=11;old.reason=signal.reason;
      }
    }else if(VALID.has(signal.id)){
      byId.set(signal.id,{id:signal.id,reason:signal.reason,priority:'core',weight:11});
    }
  }
  const indices=new Map([...profile.core,...profile.optional].map((item,index)=>[item.id,index]));
  const recommendations=[...byId.values()]
    .sort((a,b)=>b.weight-a.weight||(indices.get(a.id)??99)-(indices.get(b.id)??99))
    .slice(0,6)
    .map(item=>({
      id:item.id,label:labels.get(item.id),reason:item.reason,priority:item.priority,
      currentlyEnabled:Array.isArray(enabledModules)&&enabledModules.includes(item.id)
    }));
  const essentials=recommendations.filter(x=>x.priority==='core').map(x=>x.label);
  return {
    type:'tool_recommendations',source:'advisor',needsMoreInfo:false,
    industry:id,category,modules:recommendations.map(x=>x.id),recommendations,
    reply:'For your '+profile.title+', start with '+essentials.join(', ')+
      '. Here is how each tool fits your daily work. Review the selection before saving.',
    workflow:profile.workflow,
    followUp:profile.followUp,followUpOptions:profile.followUpOptions,
    limitations:profile.limitations
  };
}
