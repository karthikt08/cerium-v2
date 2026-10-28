// Shared, side-effect-free definitions for the second navigation row.
import {businessLocalDate} from './us-market.js';

export const FEATURE_SUBFEATURES = Object.freeze({
  overview: Object.freeze([
    { id: 'kpis', label: 'Business KPIs' },
    { id: 'actions', label: 'Quick Actions' },
    { id: 'workspace', label: 'Personalized Workspace' }
  ]),
  leads: Object.freeze([
    { id: 'list', label: 'All Leads' },
    { id: 'board', label: 'Pipeline Board' },
    { id: 'active', label: 'Active Leads' }
  ]),
  followups: Object.freeze([
    { id: 'Due', label: 'Due Today' },
    { id: 'Upcoming', label: 'Upcoming' },
    { id: 'Done', label: 'Completed' },
    { id: 'All', label: 'All Tasks' }
  ]),
  quotes: Object.freeze([
    { id: 'all', label: 'All Estimates' },
    { id: 'sent', label: 'Awaiting Decision' },
    { id: 'accepted', label: 'Ready to Schedule' }
  ]),
  schedule: Object.freeze([
    { id: 'calendar', label: 'Weekly Calendar' },
    { id: 'all', label: 'All Scheduled' },
    { id: 'active', label: 'Active Work' }
  ]),
  dispatch: Object.freeze([
    { id: 'all', label: 'All Scheduled' },
    { id: 'active', label: 'Active Jobs' },
    { id: 'unassigned', label: 'Unassigned Work' }
  ]),
  'crew-assignments': Object.freeze([
    { id: 'crew', label: 'Crew Workload' },
    { id: 'unassigned', label: 'Unassigned Work' }
  ]),
  invoices: Object.freeze([
    { id: 'All', label: 'All Invoices' },
    { id: 'Sent', label: 'Unpaid & Due' },
    { id: 'Paid', label: 'Paid Invoices' },
    { id: 'Draft', label: 'Drafts' }
  ]),
  payments: Object.freeze([
    { id: 'paid', label: 'Recorded Payments' },
    { id: 'bank', label: 'Bank Matching' }
  ]),
  reminders: Object.freeze([
    { id: 'rules', label: 'Automation Rules' },
    { id: 'templates', label: 'Message Templates' }
  ]),
  dues: Object.freeze([
    { id: 'all', label: 'All Dues' },
    { id: 'import', label: 'Import Dues' }
  ]),
  bank: Object.freeze([
    { id: 'unmatched', label: 'Unmatched Deposits' },
    { id: 'matched', label: 'Matched Records' }
  ]),
  visibility: Object.freeze([
    { id: 'profile', label: 'Google Profile' },
    { id: 'seo', label: 'Search Visibility' },
    { id: 'reviews', label: 'Customer Reviews' }
  ]),
  reengage: Object.freeze([
    { id: 'campaign', label: 'Campaigns' },
    { id: 'history', label: 'Past Customers' }
  ]),
  reviews: Object.freeze([
    { id: 'All', label: 'All Requests' },
    { id: 'Sent', label: 'Awaiting Review' },
    { id: 'Reviewed', label: 'Received Reviews' }
  ]),
  performance: Object.freeze([
    { id: 'summary', label: 'Performance Summary' },
    { id: 'sources', label: 'Lead Sources' }
  ]),
  crew: Object.freeze([
    { id: 'active', label: 'Active Crew' },
    { id: 'all', label: 'All Members' }
  ]),
  assignments: Object.freeze([
    { id: 'assigned', label: 'Scheduled Work' },
    { id: 'unassigned', label: 'Unassigned Work' }
  ]),
  business: Object.freeze([
    { id: 'summary', label: 'Executive Summary' },
    { id: 'operations', label: 'Operations Summary' }
  ]),
  sales: Object.freeze([
    { id: 'pipeline', label: 'Sales Pipeline' },
    { id: 'conversion', label: 'Booking Share' }
  ]),
  revenue: Object.freeze([
    { id: 'paid', label: 'Paid Revenue' },
    { id: 'outstanding', label: 'Outstanding Invoices' }
  ]),
  'business-settings': Object.freeze([
    { id: 'profile', label: 'Business Profile' },
    { id: 'currency', label: 'Currency & Country' },
    { id: 'tax', label: 'GST / Tax' },
    { id: 'upi', label: 'Saved UPI' }
  ]),
  'customize-tools': Object.freeze([
    { id: 'modules', label: 'Active Modules' },
    { id: 'presets', label: 'Industry Presets' },
    { id: 'reflow', label: 'Reflow Overview' }
  ]),
  'data-management': Object.freeze([
    { id: 'import', label: 'Import Leads' },
    { id: 'mapping', label: 'Column Mapping' },
    { id: 'export', label: 'Data Export' }
  ]),
  'account-subscription': Object.freeze([
    { id: 'profile', label: 'Profile & Preferences' },
    { id: 'pricing', label: 'Country-Aware Pricing' },
    { id: 'plan', label: 'Billing & Plan' }
  ]),
  'feature-discovery': Object.freeze([
    { id: 'modules', label: 'Find Modules' },
    { id: 'navigate', label: 'Section Navigation' }
  ]),
  'workflow-guidance': Object.freeze([
    { id: 'step-by-step', label: 'Step-by-Step Guides' },
    { id: 'multi-feature', label: 'Multi-Feature Workflows' },
    { id: 'context', label: 'Context-Aware Follow-ups' }
  ]),
  'response-experience': Object.freeze([
    { id: 'point-wise', label: 'Point-Wise Answers' },
    { id: 'progressive', label: 'Progressive Typing' },
    { id: 'verified-links', label: 'Verified Navigation Links' }
  ]),
  'product-help': Object.freeze([
    { id: 'help', label: 'Help & Feedback' },
    { id: 'workflows', label: 'Workflow Explanations' }
  ]),
  'support-requests': Object.freeze([
    { id: 'contact', label: 'Contact Support' },
    { id: 'issues', label: 'Report Issues' }
  ])
});


export function subfeaturesFor(route){return FEATURE_SUBFEATURES[route?.id]||[];}
export function selectedSubview(route){return route?.subview||subfeaturesFor(route)[0]?.id||'';}
export function subviewHref(route,id){
  return subfeaturesFor(route).some(s=>s.id===id)?(route.featureHref||route.href)+'/'+id:null;
}
// Return a new workspace projection; never mutate records or discard related
// data needed by the existing editors. Counts and views share these predicates.
export function subviewWorkspace(route,ws,today=businessLocalDate(ws.account?.timeZone)){
  const id=route.id,sub=selectedSubview(route),view={...ws};
  const rows=key=>ws[key]||[];
  const active=j=>['Scheduled','Confirmed','In progress'].includes(j.status);
  if(id==='leads')view.leads=rows('leads').filter(l=>sub!=='active'||['New','Quoted'].includes(l.stage));
  if(id==='followups')view.followUps=rows('followUps').filter(f=>sub==='All'||sub==='Done'&&f.done||!f.done&&(sub==='Due'?Boolean(f.dueDate)&&f.dueDate<=today:sub==='Upcoming'&&f.dueDate>today));
  if(id==='invoices')view.invoices=rows('invoices').filter(i=>sub==='All'||(sub==='Sent'?['Sent','Overdue'].includes(i.status):i.status===sub));
  if(id==='reviews')view.reviews=rows('reviews').filter(r=>sub==='All'||r.status===sub);
  if(id==='quotes')view.quotes=rows('quotes').filter(q=>sub==='all'||q.status===(sub==='sent'?'Sent':'Accepted'));
  if(id==='crew')view.crew=rows('crew').filter(c=>sub==='all'||c.active);
  if(['schedule','dispatch','crew-assignments','assignments'].includes(id)){
    view.jobs=rows('jobs').filter(j=>{
      if(sub==='unassigned')return active(j)&&!j.workerId;
      if(sub==='active'||sub==='crew')return active(j);
      if(sub==='assigned')return active(j)&&Boolean(j.workerId);
      if(id==='schedule'&&sub==='all')return active(j)&&String(j.startAt).slice(0,10)>=today;
      return true;
    });
  }
  if(id==='bank'||id==='payments')view.bankTransactions=rows('bankTransactions').filter(t=>t.status===(sub==='matched'?'matched':'pending_match'));
  return view;
}
export function subviewCount(route,ws,today){
  if(!ws)return null;
  const keys={leads:'leads',followups:'followUps',invoices:'invoices',quotes:'quotes',reviews:'reviews',crew:'crew',dispatch:'jobs','crew-assignments':'jobs',assignments:'jobs',bank:'bankTransactions'};
  const key=keys[route.id];
  return key?subviewWorkspace(route,ws,today)[key].length:null;
}
