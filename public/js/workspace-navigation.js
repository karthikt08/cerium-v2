import {WORKSPACE_CATEGORIES,WORKSPACE_UTILITIES,categoryFeatures,categoryDestination,featureEnabled,workspacePathLabel} from './workspace-registry.js';
import {escapeHTML as esc} from './workspace-model.js';
import {featureRecordCount} from './workspace-counts.js';
const icon=name=>'<svg class="icon" aria-hidden="true"><use href="#i-'+name+'"></use></svg>';

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

function getSubfeatureCount(routeId, subId, ws){
  if(!ws) return null;
  if(routeId === 'leads'){
    if(subId === 'list' || subId === 'board') return ws.leads?.length ?? null;
    if(subId === 'active') return ws.leads?.filter(l => l.stage !== 'Done').length ?? null;
  }
  if(routeId === 'followups'){
    const today = new Date().toISOString().slice(0, 10);
    if(subId === 'Due') return ws.followUps?.filter(f => !f.done && (f.dueDate || '') <= today).length ?? null;
    if(subId === 'Upcoming') return ws.followUps?.filter(f => !f.done && (f.dueDate || '') > today).length ?? null;
    if(subId === 'Done') return ws.followUps?.filter(f => f.done).length ?? null;
    if(subId === 'All') return ws.followUps?.length ?? null;
  }
  if(routeId === 'invoices'){
    if(subId === 'All') return ws.invoices?.length ?? null;
    if(subId === 'Sent') return ws.invoices?.filter(i => ['Sent','Overdue'].includes(i.status)).length ?? null;
    if(subId === 'Paid') return ws.invoices?.filter(i => i.status === 'Paid').length ?? null;
    if(subId === 'Draft') return ws.invoices?.filter(i => i.status === 'Draft').length ?? null;
  }
  if(routeId === 'quotes'){
    if(subId === 'all') return ws.quotes?.length ?? null;
    if(subId === 'sent') return ws.quotes?.filter(q => q.status === 'Sent').length ?? null;
    if(subId === 'accepted') return ws.quotes?.filter(q => q.status === 'Accepted').length ?? null;
  }
  return null;
}

export function renderSubfeaturesBar(route, ws, currentSubfeature=''){
  const subs = FEATURE_SUBFEATURES[route?.id];
  if(!subs?.length) return '';
  return `<div class="workspace-subfeature-strip" role="toolbar" aria-label="${esc(route.label)} subfeatures">
    <div class="workspace-subfeature-bar">
      ${subs.map((s, idx) => {
        const isActive = currentSubfeature ? s.id === currentSubfeature : idx === 0;
        const count = getSubfeatureCount(route.id, s.id, ws);
        return `<button type="button" class="workspace-subfeature-tab${isActive ? ' active' : ''}" data-subfeature="${s.id}" data-kind="${route.id}" aria-pressed="${isActive ? 'true' : 'false'}">
          <span class="workspace-subfeature-label">${esc(s.label)}</span>
          ${count !== null && count !== undefined ? `<span class="workspace-subfeature-count">${count}</span>` : ''}
        </button>`;
      }).join('')}
    </div>
  </div>`;
}

export function renderCategoryNavigation(){
  return WORKSPACE_CATEGORIES.map(c=>`<a class="nav-link" href="#${c.id}" data-category="${c.id}" aria-label="${esc(c.label)}" title="${esc(c.label)}">${icon(c.icon)}<span>${esc(c.label)}</span><span class="nav-count" data-category-count="${c.id}" hidden></span></a>`).join('');
}
export function renderUtilityNavigation(){
  return WORKSPACE_UTILITIES.map(u=>`<a class="nav-link" href="${u.href}" data-nav="${u.href.slice(1)}" aria-label="${esc(u.label)}" title="${esc(u.label)}">${icon(u.id==='support'?'support':'settings')}<span>${esc(u.label)}</span></a>`).join('');
}
export function updateCategoryNavigation(root,{modules,route,lastUsed,workspace}){
  for(const link of root.querySelectorAll('[data-category]')){
    const category=link.dataset.category,active=category===route.category;
    link.hidden=!categoryFeatures(category,modules).length&&!active;
    const destination=active?route:categoryDestination(category,modules,lastUsed);
    link.href=destination.href;
    if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
    const recordCount=featureRecordCount(destination,workspace);
    const badge=link.querySelector('[data-category-count]');
    if(badge){
      badge.hidden=!recordCount?.count;
      badge.textContent=recordCount?.count?String(recordCount.count):'';
      badge.title=recordCount?.label||'';
      badge.setAttribute('aria-hidden','true');
    }
    const categoryLabel=WORKSPACE_CATEGORIES.find(c=>c.id===category)?.label||category;
    const details=recordCount?.count?' · '+recordCount.label+' in '+destination.label:'';
    link.setAttribute('aria-label',categoryLabel+details);
    link.title=categoryLabel+details;
  }
}
export function renderFeatureWorkspace(route,modules,content,workspace,currentSubfeature=''){
  if(!route.category)return content;
  const tabs=categoryFeatures(route.category,modules,route.id);
  const category=WORKSPACE_CATEGORIES.find(c=>c.id===route.category);
  const hidden=!featureEnabled(route,modules);
  return `<section class="category-workspace" aria-label="${esc(category.label)}">
    <div class="workspace-category-heading"><p class="eyebrow">${esc(category.label)}</p><a class="text-button" href="#settings/tools" data-nav="settings/tools">Customize tools ${icon('arrow')}</a></div>
    <div class="workspace-tab-scroll"><div class="workspace-feature-tabs" role="tablist" aria-label="${esc(category.label)} features">
      ${tabs.map(f=>`<a role="tab" id="workspace-tab-${f.id}" class="workspace-feature-tab" href="${f.href}" data-feature="${f.id}" data-nav="${f.href.slice(1)}" aria-selected="${f.id===route.id}" aria-controls="workspace-feature-panel" tabindex="${f.id===route.id?'0':'-1'}" aria-label="${esc(f.label)}${featureRecordCount(f,workspace)?.count?' · '+esc(featureRecordCount(f,workspace).label):''}"><span class="workspace-feature-label">${esc(f.label)}</span>${featureRecordCount(f,workspace)?.count?'<span class="workspace-feature-count" aria-hidden="true">'+featureRecordCount(f,workspace).count+'</span>':''}</a>`).join('')}
    </div></div>
    <section id="workspace-feature-panel" class="workspace-feature-panel" role="tabpanel" aria-labelledby="workspace-tab-${route.id}" tabindex="0">
      ${renderSubfeaturesBar(route,workspace,currentSubfeature)}
      <div class="workspace-feature-content">
        ${hidden?`<div class="notice hidden-tool-notice" role="status"><p>This tool is hidden from your workspace. Your saved records remain available through this link. <a href="#settings/tools" data-nav="settings/tools">Show it in Customize Tools →</a></p></div>`:''}${content}
      </div>
    </section></section>`;
}
export function featureTitle(route){return workspacePathLabel(route);}

// Reveal direct-linked tabs horizontally without moving the page's vertical scroll.
export function revealActiveFeature(root){
  const strip=root.querySelector('.workspace-tab-scroll'),tab=root.querySelector('.workspace-feature-tab[aria-selected="true"]');
  if(!strip||!tab)return;
  const edge=strip.getBoundingClientRect(),active=tab.getBoundingClientRect();
  if(active.left<edge.left)strip.scrollLeft-=edge.left-active.left+4;
  else if(active.right>edge.right)strip.scrollLeft+=active.right-edge.right+4;
}
