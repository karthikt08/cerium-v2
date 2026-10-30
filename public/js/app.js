import {renderCustomerPayments,initializeCustomerPayments} from './customer-payments-page.js';
import {renderMigration,initializeMigration} from './migration-page.js';
import {renderOperations,renderDispatchPlanner,initializeOperations} from './operations-page.js';
import {INVOICE_CURRENCIES,invoiceCurrencyHint,invoiceCountry,invoiceMoney,invoiceDate} from './invoice-country.js';
import API from './api.js';
import {mountBusinessSetup} from './business-setup-ui.js';
import {renderWorkspaceCustomizer,wireWorkspaceCustomizer,renderOverviewTools,customizeOverview} from './workspace-customizer.js';
import {INDUSTRY_OPTIONS} from './industry-workspaces.js';
import {lineItemsTotal,lineItemsRoundingAdjustment} from './money.js';
import {US_STATE_OPTIONS,US_TIME_ZONE_OPTIONS,businessTimeZoneOptions,businessLocalDate,formatUSPhone,validUsZip} from './us-market.js';
import {COUNTRY_OPTIONS,countryName,editionLabel,phonePlaceholder,matchesBillingCurrency,billingPlan,priceLabel} from './countries.js';
import {INDIA_STATE_OPTIONS,INDIAN_STATES,validGSTIN,validIndianState,validUpiVpa} from './india-market.js';
import {indiaInvoiceMode,prepareIndiaInvoicePayload} from './india-invoice-mode.js';
import {renderJobsPage,initializeJobsUI} from './jobs-page.js';
import {renderRemindersPage,initializeRemindersUI} from './reminders-page.js';
import {renderPaymentDuesPage,initializePaymentDuesUI} from './payment-dues-page.js';
import {renderQuotesPage,initializeQuotesUI} from './quotes-page.js';
import {openLeadImport} from './spreadsheet-import-ui.js';
import {openInvoicePrint} from './invoice-print.js';
import {invoiceUpiUri,invoiceShareLinks,invoiceUpiQrSvg} from './invoice-sharing.js';
import {mountGuideAssistant} from './guide-assistant.js';
import {renderMarketingPage,initializeMarketingUI} from './marketing-page.js';
import {WORKSPACE_CATEGORIES,resolveWorkspaceRoute,categoryDestination} from './workspace-registry.js';
import {renderCategoryNavigation,renderUtilityNavigation,updateCategoryNavigation,renderFeatureWorkspace,featureTitle,revealActiveFeature} from './workspace-navigation.js';
import {createWorkspaceDrafts} from './workspace-drafts.js';
import {selectedSubview,subviewWorkspace,subviewHref} from './workspace-subviews.js';
import {applySubviewLayout,renderGuidancePage,renderReminderDrafts} from './workspace-view-panels.js';
import {businessInsights,renderInsightsPage} from './workspace-insights.js';
import { SECTIONS, STAGES, SOURCES, escapeHTML as esc, dateLabel, money, metrics, filteredRows, validateRecord, safeReviewURL, routeFromHash } from './workspace-model.js';

const $ = (id) => document.getElementById(id);
const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
const lastUsedTabs={};
const state = { route:resolveWorkspaceRoute(location.hash), ws:null, billingIdentity:null, section:routeFromHash(location.hash), filters:{}, view:'list', editor:null, confirmation:null, printInvoice:null, pending:new Set() };
$('category-navigation').innerHTML=renderCategoryNavigation();
$('utility-navigation').innerHTML=renderUtilityNavigation();

const drafts=createWorkspaceDrafts($('page-body'),()=>state.section);
const kindKey = {lead:'leads',followup:'followUps',invoice:'invoices',review:'reviews'};
const singular = {leads:'lead',followups:'followup',invoices:'invoice',reviews:'review'};
const createCalls = {lead:API.createLead,followup:API.createFollowUp,invoice:API.createInvoice,review:API.createReviewRequest};
const updateCalls = {lead:API.updateLead,followup:API.updateFollowUp,invoice:API.updateInvoice,review:API.updateReview};
const deleteCalls = {lead:API.deleteLead,followup:API.deleteFollowUp,invoice:API.deleteInvoice,review:API.deleteReview};
const initialFilters = (kind) => ({query:'',status:kind === 'followups' ? 'Due' : 'All',source:'All'});
const currency = () => state.ws?.account.currency || 'USD';
const isIndia = () => state.ws?.account.country==='IN'&&currency()==='INR';
const currencyMismatch=()=>state.ws?.account.currency && !matchesBillingCurrency(state.ws.account.country,currency());
const contactPhone=value=>state.ws?.account.country==='US'?formatUSPhone(value):value||'';
const readOnly = () => state.ws?.account.planStatus === 'expired' || currencyMismatch();
const trialNotice = () => currencyMismatch()
  ? '<div class="notice" role="status"><div><strong>Historical currency — read-only</strong><p>These amounts are preserved in their original currency. Export your records, then review options in <a href="#settings" data-nav="settings" style="text-decoration:underline;font-weight:600">Settings →</a> before creating new dollar invoices.</p></div></div>'
  : `<div class="notice" role="status"><div><strong>Your free trial has ended — read-only access</strong><p>Your business records are safe. You can view invoices, export data, and manage your subscription. <a href="#settings" data-nav="settings" style="text-decoration:underline;font-weight:600">View subscription options →</a></p></div></div>`;
const cash = (n) => money(n,currency());
// Zero represents no debt in any currency; keep an empty dashboard dollar-native
// without changing the denomination of stored legacy transactions.
const dashboardCash = (n) => money(n,currencyMismatch()&&Number(n)===0?'USD':currency());
const initials = (name) => String(name || 'C').trim().split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
const button = (text,action,extra='',style='primary') => `<button type="button" class="button ${style}" data-action="${action}" ${extra}>${text}</button>`;
const addButton = (kind,label) => button(icon('plus')+label,'new',`data-kind="${kind}"`);
const viewLink = (section,label='View all') => `<a class="text-button" href="#${section}" data-nav="${section}">${label} ${icon('arrow')}</a>`;
const badge = (status) => {
  const color = {New:'blue',Quoted:'purple',Booked:'blue',Done:'green',Paid:'green',Sent:'blue',Overdue:'orange','Not Asked':'orange',Reviewed:'green',Draft:'',Due:'orange',Upcoming:'blue',Requested:'blue'}[status] || '';
  return `<span class="badge ${color}">${esc(status==='Reviewed'?'Received':status)}</span>`;
};
const empty = (title,description,action='') => `<div class="empty-state"><span class="empty-icon">${icon('empty')}</span><h3>${typeof title === 'string' && title.includes('<span') ? title : esc(title)}</h3><p>${esc(description)}</p>${action}</div>`;
const panelHeader = (name,title,sub='',right='') => `<div class="panel-header"><div><div class="panel-title">${icon(name)}<h2>${title}</h2></div>${sub ? `<p class="panel-subtitle">${sub}</p>` : ''}</div>${right}</div>`;
const brandHeadingSVG = '<svg class="ul" viewBox="0 0 300 14" aria-hidden="true"><defs><linearGradient id="ug" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1e3a8a"/><stop offset=".55" stop-color="#1d5bf0"/><stop offset="1" stop-color="#3b82f6"/></linearGradient></defs><path pathLength="1" stroke-width="8.5" d="M3 9C60 3 120 12 180 6s90 3 117 0"/></svg>';
const brandHeadingWrap = (text) => `<span class="ac">${esc(text)}${brandHeadingSVG}</span>`;
const cleanTitle = (t) => typeof t === 'string' ? t.replace(/<[^>]*>/g, '').trim() : '';
const pageHeading = (title,description,action='',eyebrow='') => `<div class="page-heading"><div>${eyebrow?`<p class="eyebrow">${esc(eyebrow)}</p>`:''}<h1>${typeof title === 'string' && title.startsWith('<span class="ac">') && title.endsWith('</span>') && !title.slice(17, -7).includes('<span') ? title : brandHeadingWrap(cleanTitle(title) || title)}</h1><p class="page-description">${esc(description)}</p></div><div class="heading-actions">${action}</div></div>`;
function decorateHeadingAccents(root) {
  if (!root) return;
  const headings = root.querySelectorAll('.page-heading h1:not(:has(.overview-title-accent))');
  for (const h1 of headings) {
    const raw = h1.textContent.trim();
    if (!raw) continue;
    const ac = h1.querySelector('.ac');
    if (ac && ac.textContent.trim() === raw && h1.querySelector('.ul')) continue;
    h1.innerHTML = brandHeadingWrap(raw);
  }
}
const rowActions = (kind,id,label,extra='') => `<div class="table-actions">${extra}<button class="icon-button" data-action="edit" data-kind="${kind}" data-id="${esc(id)}" aria-label="Edit ${esc(label)}">${icon('edit')}</button><button class="icon-button" data-action="delete" data-kind="${kind}" data-id="${esc(id)}" aria-label="Delete ${esc(label)}">${icon('close')}</button></div>`;
function toast(message,error=false) {
  const el=document.createElement('div'); el.className='toast'+(error?' error':''); el.textContent=message; $('toast-region').append(el); while($('toast-region').children.length>3)$('toast-region').firstElementChild.remove(); setTimeout(()=>el.remove(),5000);
}
function formError(id,message) {
  const el=$(id);
  if(!el){if(message)toast(message,true);return;}
  el.textContent=message;el.hidden=!message;
  if(message&&el.closest('dialog')&&!el.closest('dialog').open)toast(message,true);
}
function setSync(text) { $('sync-label').textContent=text; }
async function perform(key,element,fn,errorTarget) {
  if(state.pending.has(key)) return;
  state.pending.add(key); const disabled=element?.disabled; if(element) {element.disabled=true;element.setAttribute('aria-busy','true');}
  try { await fn(); }
  catch(err) { const message=err?.message || 'Could not complete that action. Please try again.'; if(errorTarget)formError(errorTarget,message);else toast(message,true); }
  finally { state.pending.delete(key); if(element) {element.disabled=!!disabled;element.removeAttribute('aria-busy');} }
}
async function refresh() {
  setSync('Updating…');
  try { state.ws=await API.getWorkspace(); state.billingIdentity=await API.getBillingIdentity();
    if(WORKSPACE_CATEGORIES.some(c=>location.hash==='#'+c.id)){state.route=resolveWorkspaceRoute(location.hash,state.ws.account.workspacePreferences?.modules,lastUsedTabs);state.section=state.route.section;}
    renderChrome(); renderPage(); setSync('Up to date'); }
  catch(err) { setSync('Could not refresh'); throw err; }
}
function renderChrome() {
  const a=state.ws.account;
  $('business-name').textContent=a.businessName||'Your business'; $('business-initial').textContent=initials(a.businessName||a.name).slice(0,1); $('business-initial').title=a.businessName||'Your business';
  $('user-avatar').textContent=initials(a.name); $('user-avatar').setAttribute('aria-label',`Account settings for ${a.name || 'your account'}`);
  $('plan-label').textContent=a.planStatus==='active'?'Cerium Pro':a.planStatus==='expired'?'Trial ended':`${a.trialDaysRemaining} days left in trial`;
  const india=a.country==='IN'&&a.currency==='INR';
  $('edition-label').textContent=editionLabel(a.country);
  $('edition-chip').textContent=india?'India · INR':a.country==='US'?'US · USD':countryName(a.country)+' · '+a.currency;
  document.body.dataset.edition=india?'in':a.country==='US'?'us':'global';
  // Per-feature badge totals are refreshed by setNavigation() from the same
  // workspace records displayed by the destination, not dashboard action KPIs.
}
function setNavigation() {
  const route=state.route;
  $('current-section').textContent=route.label;
  $('current-category').textContent=WORKSPACE_CATEGORIES.find(c=>c.id===route.category&&c.id!=='overview')?.label||'Workspace';
  document.title=`${featureTitle(route)} — CERIUM`;
  document.querySelectorAll('[data-nav]').forEach(a=>{if(resolveWorkspaceRoute(a.dataset.nav).href===route.href)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  updateCategoryNavigation(document,{modules:state.ws?.account.workspacePreferences?.modules,route,lastUsed:lastUsedTabs,workspace:state.ws});
}
function navigate(target,focus=false) {
  const route=resolveWorkspaceRoute(target,state.ws?.account.workspacePreferences?.modules,lastUsedTabs);
  const same=$('page-body').dataset.route===route.href;
  state.route=route;state.section=route.section;
  if(route.category)lastUsedTabs[route.category]=route.href;
  setNavigation();closeNavigation();
  window.dispatchEvent(new CustomEvent('cerium:navigation',{detail:{section:state.section,route:route.href}}));
  if(state.ws&&!same){renderPage();$('workspace-main').scrollTop=0;}
  else if(same&&route.id==='customize'&&!$('workspace-customizer-dialog')?.open)$('workspace-customizer-dialog')?.showModal();
  if(focus&&!document.querySelector('dialog[open]'))$('workspace-main').focus({preventScroll:true});
}
function go(target,focusTab=false){
  const route=resolveWorkspaceRoute(target,state.ws?.account.workspacePreferences?.modules,lastUsedTabs);
  if(location.hash!==route.href)history.pushState(null,'',route.href);
  navigate(route.href,!focusTab);
  if(focusTab){
    const selector=focusTab==='subview'?'.workspace-subfeature-tab.active':'.workspace-feature-tab.active';
    document.querySelector(selector)?.focus({preventScroll:true});
    revealActiveFeature($('page-body'));
  }
}

function taskRow(f) {
  const today=businessLocalDate(state.ws?.account?.timeZone);
  const status=f.done?'Done':f.dueDate<today?'Overdue':f.dueDate===today?'Due':dateLabel(f.dueDate);
  return `<div class="task-row"><button class="task-check ${f.done?'completed':''}" data-action="toggle-followup" data-id="${esc(f.id)}" aria-label="${f.done?'Reopen':'Complete'} follow-up for ${esc(f.contactName)}">${f.done?icon('check'):''}</button><div class="row-details"><span class="row-title">${esc(f.contactName)}</span><span class="row-meta">${esc(f.task)} · ${esc(f.channel)}</span></div><div class="row-end">${badge(status)}</div></div>`;
}
function invoiceRow(i) {
  return `<div class="task-row"><span class="mini-avatar lavender">${esc(initials(i.customerName))}</span><div class="row-details"><span class="row-title">${esc(i.customerName)}</span><span class="row-meta">#${esc(i.id)} · Due ${dateLabel(i.dueDate)}</span></div><div class="row-end"><div><span class="amount">${cash(i.balance??i.total)}</span><div style="margin-top:4px;text-align:right">${badge(i.status)}</div></div><button class="icon-button" data-action="preview-invoice" data-id="${esc(i.id)}" aria-label="Preview invoice ${esc(i.id)}">${icon('chevron')}</button></div></div>`;
}
function overview() {
  const ws=state.ws,m=metrics(ws),tz=ws.account.timeZone,now=new Date();
  const hour=tz?Number(new Intl.DateTimeFormat('en-US',{timeZone:tz,hour:'numeric',hourCycle:'h23'}).format(now)):now.getHours();
  const first=ws.account.name.trim().split(/\s+/)[0]||'there';
  const greeting=`Good ${hour<12?'morning':hour<18?'afternoon':'evening'}`;
  const preference=ws.account.workspacePreferences||{};
  const industryName=INDUSTRY_OPTIONS.find(x=>x.value===preference.category)?.label;
  const workspaceTitle=preference.category==='other'?'Your custom workspace':industryName?`Your ${industryName} workspace`:'Your workspace';
  // The business-specific tool notice becomes a compact utility row inside
  // the Overview hero instead of occupying a second full-width card.
  const workspaceRow=`<section class="overview-workspace-row" aria-label="Your selected workspace">
    <div class="overview-workspace-copy"><span class="overview-row-icon" aria-hidden="true">${icon('settings')}</span>
      <div><h2>${esc(workspaceTitle)}</h2><p>Your selected tools, arranged for your work.</p></div>
    </div>
    <a class="overview-customize-link" href="#settings" data-nav="settings">Customize your tools ${icon('arrow')}</a>
  </section>`;
  const day=now.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',...(tz?{timeZone:tz}:{})});
  const tasks=filteredRows('followups',ws,{status:'Due'}),invoices=ws.invoices.filter(x=>['Sent','Overdue'].includes(x.status)).sort((a,b)=>a.dueDate.localeCompare(b.dueDate));
  const leads=ws.leads.slice(0,3),reviews=ws.reviews.filter(x=>x.status!=='Reviewed').slice(0,3);
  // Keep the India billing context/actions, but embed them inside the same
  // pricing-inspired card when this business is in the India edition.
  const indiaRow=isIndia()?`<section class="overview-india-row" aria-label="India edition">
    <div class="overview-india-copy">
      <p class="overview-india-eyebrow"><span class="overview-india-dot" aria-hidden="true"></span> INDIA EDITION ACTIVE · INR BILLING · ₹500 / MONTH</p>
      <h2>Your business, in <span>rupees.</span></h2>
      <p>Invoices use INR and include optional GST draft fields. ${ws.account.upiVpa?'UPI ID is configured for new invoice payment instructions.':'Add a UPI ID in Settings to include payment instructions on new invoices.'} GST drafts require accountant review before statutory use.</p>
    </div>
    <div class="overview-india-actions"><a class="button secondary" href="#settings" data-nav="settings">Set up GST & UPI</a>${button('Create INR invoice','new','data-kind="invoice"')}</div>
  </section>`:'';
  const metric=(label,value,foot,nav,ic,warn=false)=>`<a href="#${nav}" data-nav="${nav}" data-workspace-module="${nav}" class="metric ${warn?'warning':''}"><div class="metric-top"><span>${label}</span>${icon(ic)}</div><strong class="metric-value">${value}</strong><span class="metric-foot"><i class="dot"></i>${foot}</span></a>`;
  // The three former stacked panels now render as one functional,
  // responsive dark Overview. All route links and action handlers are retained.
  const overviewHero=`<section class="overview-stage overview-stage-unified" aria-label="Daily overview">
    <div class="overview-stage-main">
      <div class="page-heading"><div><p class="eyebrow">${esc(day)}</p>
        <h1>${esc(greeting)}, <span class="overview-title-accent">${esc(first)}.</span></h1>
        <p class="page-description">Here's what needs your attention today.</p>
      </div><div class="heading-actions">${addButton('lead','New lead')}</div></div>
      <nav class="overview-shortcuts" aria-label="Quick workspace shortcuts">
        <a class="overview-shortcut" href="#jobs" data-nav="jobs">${icon('jobs')}Jobs & dispatch ${icon('arrow')}</a>
        <a class="overview-shortcut" href="#invoices" data-nav="invoices">${icon('invoices')}Invoices ${icon('arrow')}</a>
        <a class="overview-shortcut" href="#marketing" data-nav="marketing">${icon('marketing')}Marketing ${icon('arrow')}</a>
      </nav>
    </div>
    ${workspaceRow}
    ${indiaRow}
  </section>`;
  return overviewHero+
    (!currencyMismatch()?'':'<div class="notice" role="status"><div><strong>Previous currency records</strong><p>Your workspace still contains earlier amounts in '+esc(ws.account.currency)+'. They are preserved as originally recorded; see Settings before creating new dollar invoices.</p></div></div>')+
    `<div class="metrics-grid">${metric('Active leads',m.leads,'New and quoted inquiries','leads','leads')}${metric('Follow-ups due',m.due,'Ready for your next call','followups','followups')}${metric('Outstanding',dashboardCash(m.outstanding),'Across unpaid invoices','invoices','invoices')}${metric('Overdue',dashboardCash(m.overdue),'Payments past their due date','invoices','payments',true)}</div>`+
    `<div class="dashboard-grid"><section class="panel" data-workspace-module="followups">${panelHeader('followups','Today’s follow-ups',tasks.length?`${tasks.length} ${tasks.length===1?'customer needs':'customers need'} a check-in`:'Your next conversations, in one place',viewLink('followups'))}<div class="panel-body">${tasks.length?tasks.slice(0,4).map(taskRow).join(''):empty('You’re all caught up','Add a follow-up when a customer needs a call or message.',button('Add follow-up','new','data-kind="followup"','secondary'))}</div><div class="panel-footer"><span>${tasks.length>4?`Showing 4 of ${tasks.length} due`:'A small follow-up can make a big difference.'}</span>${button(icon('plus')+'Add','new','data-kind="followup"','secondary')}</div></section>`+
    `<section class="panel" data-workspace-module="invoices">${panelHeader('invoices','Awaiting payment','A clear view of what’s coming in',viewLink('invoices'))}<div class="panel-body">${invoices.length?invoices.slice(0,3).map(invoiceRow).join(''):empty('No outstanding invoices','Create your next invoice when a job is ready to bill.',button('Create invoice','new','data-kind="invoice"','secondary'))}</div><div class="panel-footer"><span>${invoices.length} open ${invoices.length===1?'invoice':'invoices'}</span><strong class="amount">${cash(m.outstanding)}</strong></div></section>`+
    `<section class="panel" data-workspace-module="leads">${panelHeader('leads','Your pipeline','From first inquiry to a finished job',viewLink('leads'))}<div class="pipeline-strip">${STAGES.map(s=>`<div class="stage-item"><div class="stage-line"></div><strong>${ws.leads.filter(l=>l.stage===s).length}</strong>${s}</div>`).join('')}</div><div class="panel-body">${leads.length?leads.map(l=>`<div class="task-row"><span class="mini-avatar">${esc(initials(l.name))}</span><div class="row-details"><span class="row-title">${esc(l.name)}</span><span class="row-meta">${esc(l.source)}${l.notes?' · '+esc(l.notes.slice(0,40)):''}</span></div>${badge(l.stage)}<button class="text-button" data-action="new-quote" data-id="${esc(l.id)}" aria-label="Create quote for ${esc(l.name)}">Quote ↗</button><button class="icon-button" data-action="edit" data-kind="lead" data-id="${esc(l.id)}" aria-label="Edit ${esc(l.name)}">${icon('chevron')}</button></div>`).join(''):empty('Make room for your <span class="ac">next customer.<svg class="ul" viewBox="0 0 300 14" aria-hidden="true"><path pathLength="1" d="M3 9C60 3 120 12 180 6s90 3 117 0"/></svg></span>','Every inquiry starts with a new lead.')}</div></section>`+
    `<section class="panel" data-workspace-module="reviews">${panelHeader('reviews','Close the loop','Keep your good work working for you',viewLink('reviews'))}<div class="panel-body">${reviews.length?reviews.map(r=>`<div class="task-row"><span class="mini-avatar lavender">${icon('reviews')}</span><div class="row-details"><span class="row-title">${esc(r.customerName)}</span><span class="row-meta">${esc(r.jobTitle)}</span></div>${badge(r.status==='Sent'?'Requested':r.status)}</div>`).join(''):empty('Good work deserves a good review','Track review requests after you finish a job.')}</div><div class="panel-footer"><span>${m.reviews} waiting for a request</span>${viewLink('reviews','Manage reviews')}</div></section></div>${renderOverviewTools()}<p class="page-note">${icon('check')}A little less admin. A little more room to work.</p>`;
}
function toolbar(kind) {
  const f=state.filters[kind] ||= initialFilters(kind);
  const statuses={leads:['All',...STAGES],followups:['Due','Upcoming','Done','All'],invoices:['All','Draft','Sent','Overdue','Paid'],reviews:['All','Not Asked','Sent','Reviewed']}[kind];
  return `<div class="toolbar"><label class="search-field">${icon('search')}<input type="search" data-filter="query" value="${esc(f.query)}" placeholder="Search ${SECTIONS[kind][0].toLowerCase()}…" aria-label="Search ${SECTIONS[kind][0].toLowerCase()}"></label><select data-filter="status" aria-label="Filter ${SECTIONS[kind][0].toLowerCase()} by status">${statuses.map(s=>`<option value="${s}" ${s===f.status?'selected':''}>${s==='All'?'All statuses':s==='Sent'&&kind==='reviews'?'Requested':s==='Reviewed'?'Received':s}</option>`).join('')}</select>${kind==='leads'?`<select data-filter="source" aria-label="Filter leads by source">${['All',...SOURCES].map(s=>`<option value="${s}" ${s===f.source?'selected':''}>${s==='All'?'All sources':s}</option>`).join('')}</select><div class="view-toggle" aria-label="Lead view"><button data-action="lead-view" data-view="list" aria-pressed="${state.view==='list'}">List</button><button data-action="lead-view" data-view="board" aria-pressed="${state.view==='board'}">Board</button></div>`:''}</div>`;
}
function listPage(kind) {
  const labels={leads:'New lead',followups:'Add follow-up',invoices:'Create invoice',reviews:'Log request'};
  const notice=kind==='reviews'?`<div class="notice">${icon('reviews')}<div><strong>A personal request goes a long way.</strong>Copy your review request, send it through your email or messaging app, then mark it as requested. ${viewLink('settings','Set your review link')}</div></div>`:'';
  return pageHeading(...SECTIONS[kind],addButton(singular[kind],labels[kind])+(kind==='leads'?button('Import CSV / Excel','import-leads','','secondary'):''))+notice+`<section class="panel">${toolbar(kind)}<div id="results"></div></section>`;
}
function table(head,rows) {return `<div class="table-scroll" tabindex="0" aria-label="Scrollable records table"><table class="data-table"><thead><tr>${head.map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;}
function renderResults() {
  const kind=state.section,holder=$('results');if(!holder)return;
  const scoped=state.route.subview?subviewWorkspace(state.route,state.ws):state.ws;
  const rows=filteredRows(kind,scoped,{...state.filters[kind],status:state.route.subview?'All':state.filters[kind]?.status});
  const total=state.ws[kindKey[singular[kind]]]?.length||0;
  const recordLabel=rows.length===total?`${total} ${total===1?'record':'records'}`:`${rows.length} of ${total} records shown`;
  if(!rows.length) {
    holder.innerHTML=empty('No '+SECTIONS[kind][0].toLowerCase()+' to show','Try a different filter or add your first record.')+`<div class="result-footer"><span>${recordLabel}</span><span>Filters never delete saved records</span></div>`;
    return;
  }
  if(kind==='leads'&&state.view==='board') {
    holder.innerHTML=`<div class="board" tabindex="0" aria-label="Scrollable lead board">${STAGES.map(stage=>`<div class="board-column"><div class="board-title">${stage}<span>${rows.filter(l=>l.stage===stage).length}</span></div>${rows.filter(l=>l.stage===stage).map(l=>`<article class="lead-card"><span class="row-title">${esc(l.name)}</span><span class="row-meta">${esc(l.source)}</span><div class="lead-card-bottom"><strong class="amount">${cash(l.value)}</strong><div class="lead-card-actions"><button class="icon-button" data-action="edit" data-kind="lead" data-id="${esc(l.id)}" aria-label="Edit ${esc(l.name)}">${icon('edit')}</button><button class="icon-button" data-action="delete" data-kind="lead" data-id="${esc(l.id)}" aria-label="Delete ${esc(l.name)}">${icon('close')}</button></div></div></article>`).join('')}</div>`).join('')}</div>`;
  } else if(kind==='leads') {
    holder.innerHTML=table(['Customer','Source','Stage','Value','Next follow-up','Actions'],rows.map(l=>`<tr><td><div class="person">${esc(l.name)}</div><div class="subline">${esc(l.email||l.phone||l.address||'No contact details')}</div></td><td>${esc(l.source)}</td><td>${badge(l.stage)}</td><td class="amount">${cash(l.value)}</td><td>${dateLabel(l.nextFollowUp)}</td><td>${rowActions('lead',l.id,l.name,button('Quote ↗','new-quote',`data-id="${esc(l.id)}"`,'secondary'))}</td></tr>`));
  } else if(kind==='followups') {
    holder.innerHTML=table(['Task','Customer','Due','Channel','Status','Actions'],rows.map(f=>`<tr><td><div class="person">${esc(f.task)}</div></td><td>${esc(f.contactName)}<div class="subline">${esc(f.phone)}</div></td><td>${dateLabel(f.dueDate)}</td><td>${esc(f.channel)}</td><td><button class="button secondary" data-action="toggle-followup" data-id="${esc(f.id)}">${f.done?icon('check')+'Done':'Mark done'}</button></td><td>${rowActions('followup',f.id,f.contactName)}</td></tr>`));
  } else if(kind==='invoices') {
    holder.innerHTML=table(['Invoice','Customer','Job','Due date','Total','Balance','Status','Actions'],rows.map(i=>`<tr><td><button class="text-button" data-action="preview-invoice" data-id="${esc(i.id)}">#${esc(i.id)}</button><div class="subline">${esc(i.jobTitle)}</div></td><td><div class="person">${esc(i.customerName)}</div></td><td>${i.jobId?`<a href="#jobs" data-nav="jobs" class="text-button" title="From completed job">From job ↗</a>`:'—'}</td><td>${dateLabel(i.dueDate)}</td><td class="amount">${esc(invoiceMoney(i.total,i.currency||currency(),i.country||state.ws.account.country))}</td><td class="amount">${esc(invoiceMoney(i.balance??(i.status==='Paid'?0:i.total),i.currency||currency(),i.country||state.ws.account.country))}</td><td><select class="small-select" data-invoice-status="${esc(i.id)}" aria-label="Status of invoice ${esc(i.id)}">${['Draft','Sent','Overdue','Paid'].map(s=>`<option ${i.status===s?'selected':''}>${s}</option>`).join('')}</select></td><td>${rowActions('invoice',i.id,'invoice '+i.id)}</td></tr>`));
  } else if(kind==='reviews') {
    holder.innerHTML=table(['Customer','Job','Status','Request','Actions'],rows.map(r=>`<tr><td><div class="person">${esc(r.customerName)}</div><div class="subline">${esc(r.customerEmail||r.customerPhone)}</div></td><td>${esc(r.jobTitle)}</td><td>${badge(r.status==='Sent'?'Requested':r.status)}</td><td><div class="table-actions">${button('Copy request','copy-review',`data-id="${esc(r.id)}"`,'secondary')}${r.status==='Not Asked'?button('Mark requested','mark-requested',`data-id="${esc(r.id)}"`,'secondary'):r.status!=='Reviewed'?button('Mark received','review-received',`data-id="${esc(r.id)}"`,'secondary'):''}</div></td><td>${rowActions('review',r.id,r.customerName)}</td></tr>`));
  }
  holder.insertAdjacentHTML('beforeend',`<div class="result-footer"><span>${recordLabel}</span><span>Changes are saved to your workspace</span></div>`);
}
function paymentsPage(view='paid',sub='paid') {
  if(sub==='ledger')return renderCustomerPayments(state.ws,readOnly());
  const paid=state.ws.invoices.filter(i=>i.status==='Paid'),tx=state.ws.bankTransactions.filter(t=>t.status==='pending_match');
  const paidTotals=businessInsights({account:state.ws.account,invoices:paid}).currencies
    .map(row=>invoiceMoney(row.paid,row.currency,state.ws.account.country)).join(' · ');
  const note=`<div class="notice">${icon('payments')}<div><strong>Recorded payments and deposits</strong><p>Mark an invoice as paid only after verifying payment. A live bank feed is not connected.</p></div></div>`;
  const deposits=tx.length?`<section class="panel">${panelHeader('payments','Recorded deposits','Review these before marking an invoice as paid')}<div class="panel-body">${tx.map(t=>`<div class="task-row"><div class="row-details"><span class="row-title">${esc(t.description)}</span><span class="row-meta">${dateLabel(t.date)} · ${cash(t.amount)}</span></div>${t.suggestedInvoiceId?button('Match #'+esc(t.suggestedInvoiceId),'match-payment',`data-id="${esc(t.id)}" data-invoice="${esc(t.suggestedInvoiceId)}"`,'secondary'):badge('No suggested match')}${button('Dismiss','dismiss-payment',`data-id="${esc(t.id)}"`,'secondary')}</div>`).join('')}</div></section>`:empty('No deposits awaiting review','Existing recorded deposits appear here when they need matching. No live bank connection is configured.');
  if(view==='bank'&&sub==='matched'){
    const matched=state.ws.bankTransactions.filter(t=>t.status==='matched');
    return pageHeading('Matched records','Confirmed matches from your recorded deposits.')+note+`<section class="panel">${matched.length?table(['Deposit','Date','Amount','Linked invoice'],matched.map(t=>`<tr><td>${esc(t.description)}</td><td>${dateLabel(t.date)}</td><td>${cash(t.amount)}</td><td>${t.matchedInvoiceId?button('#'+esc(t.matchedInvoiceId),'preview-invoice',`data-id="${esc(t.matchedInvoiceId)}"`,'secondary'):'No linked invoice'}</td></tr>`)):empty('No matched deposits','Confirmed matches appear here after manual review.')}</section>`;
  }
  if(view==='bank')return pageHeading('Bank matching','Review recorded deposits against invoices.',viewLink('billing/payments','Paid invoices'))+note+deposits;
  return pageHeading(...SECTIONS.payments,viewLink('billing/bank','Bank matching'))+note+`<section class="panel">${panelHeader('payments','Paid invoices',`${paid.length} paid${paidTotals?' · '+esc(paidTotals):''} · Totals by invoice currency`)}${paid.length?table(['Invoice','Customer','Paid on','Amount'],paid.map(i=>`<tr><td><button class="text-button" data-action="preview-invoice" data-id="${esc(i.id)}">#${esc(i.id)}</button></td><td><div class="person">${esc(i.customerName)}</div></td><td>${dateLabel(i.paidAt)}</td><td class="amount">${esc(invoiceMoney(i.total,i.currency||currency(),i.country||state.ws.account.country))}</td></tr>`)):empty('No payments recorded yet','Your paid invoices will appear here.')}</section>`;
}
function field(name,label,value='',type='text',options={}) {
  const {required=false,full=false,choices=null,readOnly=false,placeholder='',max=200,min,step}=options;
  const attrs=`name="${name}" id="field-${name}" ${required?'required':''} ${readOnly?'readonly':''} maxlength="${max}" placeholder="${esc(placeholder)}"`;
  let input=choices?`<select ${attrs}>${choices.map(x=>{const option=typeof x==='string'?{value:x,label:x}:x;return `<option value="${esc(option.value)}" ${String(value)===String(option.value)?'selected':''}>${esc(option.label)}</option>`;}).join('')}</select>`:type==='textarea'?`<textarea ${attrs} rows="3">${esc(value)}</textarea>`:`<input type="${type}" ${attrs} value="${esc(value)}" ${min!==undefined?`min="${min}"`:''} ${step?`step="${step}"`:''}>`;
  return `<label class="field ${full?'full-width':''}" for="field-${name}">${label}${required?' <span class="sr-only">(required)</span>':''}${input}</label>`;
}
function settingsPage(view='profile') {
  const a=state.ws.account,ind=isIndia(),us=a.country==='US',countryLabel=countryName(a.country);
  const legacy=currencyMismatch()?'<p class="muted" role="alert">Existing amounts are stored in '+esc(a.currency)+'. We will not relabel them. Export valuable history and ask support about migration. Disposable demos may be cleared with confirmation.</p>':'';
  const tzHelp=a.timeZone?'Appointments use '+(US_TIME_ZONE_OPTIONS.find(x=>x.value===a.timeZone)?.label||a.timeZone)+'.':'Set your business time zone so crews see the correct local appointment times.';
  const bpState=ind?(INDIAN_STATES[a.businessProfile?.indiaState]||a.businessProfile?.indiaState):(a.businessProfile?.usState||a.businessProfile?.businessRegion||a.usState);
  const addressLocality=[a.businessProfile?.businessCity,[bpState,a.businessProfile?.businessPostalCode||a.usZip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const fullAddressLine=[addressLocality,countryLabel].filter(Boolean).join(' · ');
  const regionFields=ind
    ?'<div class="form-section-title full-width"><h4>Business address & tax details</h4><p>GSTIN is optional for businesses that are not GST-registered. Unregistered businesses can issue ordinary invoices without GST.</p></div>'
      +field('location','City / service area',a.location,'text',{placeholder:'e.g. Chennai'})
      +field('indiaState','Business state / UT',a.indiaState||'','text',{choices:[{value:'',label:'Select state / UT'},...INDIA_STATE_OPTIONS]})
      +field('gstin','Business GSTIN (only if registered)',a.gstin||'','text',{max:15,placeholder:'15-character GSTIN'})
      +field('upiVpa','UPI ID for customer invoice payments',a.upiVpa||'','text',{max:194,placeholder:'business@bank'})
      +'<p class="muted full-width">UPI ID is displayed as payment instructions, not a verified collection or bank integration. GST fields are invoice drafts only; IRN/e-invoicing and GST filing are not connected.</p>'
    :us?'<div class="form-section-title full-width"><h4>Operating address & region</h4><p>Regional settings used on customer invoices, estimates and local appointments.</p></div>'
      +field('location','City / service area',a.location,'text',{placeholder:'e.g. Austin'})
      +field('usState','State',a.usState||'','text',{choices:[{value:'',label:'Choose a state'},...US_STATE_OPTIONS]})
      +field('usZip','ZIP code',a.usZip||'','text',{placeholder:'78701 or 78701-1234',max:10})
      +field('timeZone','Business time zone',a.timeZone||'','text',{choices:[{value:'',label:'Choose time zone'},...US_TIME_ZONE_OPTIONS]})
      +'<p class="muted full-width">'+esc(tzHelp)+'</p>'
    :'<div class="form-section-title full-width"><h4>Operating address & region</h4><p>Regional settings used on customer invoices and appointments.</p></div>'
      +field('location','City / service area',a.location,'text',{placeholder:'City, region / postal code'})
      +field('timeZone','Business time zone',a.timeZone||'UTC','text',{choices:businessTimeZoneOptions(a.timeZone)})
      +'<p class="muted full-width">'+esc(tzHelp)+'</p>';
  const countryChoices=COUNTRY_OPTIONS.map(c=>({value:c.value,label:c.label+' — '+(c.value==='IN'?'INR':'USD')}));
  const plan=a.billingPrice||billingPlan(a.country);
  const currentAnnual=plan.billingCycle==='annual';
  const moneyPrice=(plan.currency==='INR'?'₹':String.fromCharCode(36))+(currentAnnual?plan.annualPrice:plan.monthlyPrice);
  const annualNewPrice=(plan.currency==='INR'?'₹':String.fromCharCode(36))+(billingPlan(a.country).monthlyPrice*11);
  const canAuthorize=!a.subscription||['created','cancelled','expired'].includes(a.subscription.status);
  const canCancel=a.subscription&&!['cancelled','expired'].includes(a.subscription.status);
  const proof=state.billingIdentity||{};

  return pageHeading(...SECTIONS.settings)+renderWorkspaceCustomizer(a.workspacePreferences)+`<div class="settings-grid"><section class="panel" id="settings-profile-panel">${panelHeader('settings','Business profile','The details used across your workspace')}
  <div class="settings-content settings-section-border">
    <div class="business-profile-summary">
      <div class="business-summary-header">
        <span class="billing-verify-status ${a.businessProfile?.complete?'is-verified':''}">${a.businessProfile?.complete?'✓ Business address verified':'Setup needs completion'}</span>
        <a class="button secondary sm" href="${API.localBusinessSetup?'#settings':'/verify.html?edit=business'}" ${API.localBusinessSetup?'data-action="business-setup"':''}>${a.businessProfile?.complete?'Edit address':'Complete business setup'}</a>
      </div>
      ${a.businessProfile?.complete?`
      <div class="business-address-card">
        <div class="business-address-icon" aria-hidden="true">
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
        </div>
        <div class="business-address-details">
          <p class="address-street">${esc(a.businessProfile.businessAddress||'No street address configured')}</p>
          <p class="address-locality">${esc(fullAddressLine)}</p>
          <p class="address-contact"><span class="address-meta-label">Billing email:</span> ${esc(a.businessProfile.businessEmail||a.email)}</p>
        </div>
      </div>`:''}
    </div>
  </div>
  <form id="profile-form" class="settings-content"><div class="form-grid">
    ${field('name','Your name',a.name,'text',{required:true})}
    ${field('businessName','Business name',a.businessName)}
    ${field('email','Sign-in email',a.email,'email',{readOnly:true})}
    ${field('phone','Business phone',contactPhone(a.phone),'tel',{placeholder:phonePlaceholder(a.country)})}
    ${field('trade','Trade / industry',a.trade)}
    ${a.regionLocked?field('country','Edition / country (confirmed by phone)',a.country,'text',{readOnly:true}):field('country','Edition / country',a.country||'US','text',{choices:countryChoices})}
    <p class="muted full-width">${a.regionLocked?'Your business country is confirmed. Choose your invoice currency before creating financial records.':'Selecting an edition does not apply it yet. Click Save changes to activate; the workspace must be empty.'} Existing money is never converted.</p>
    <div class="edition-save-hint full-width" id="edition-save-hint" role="status" aria-live="polite">Saved edition: ${esc(countryLabel)} · ${esc(a.currency)}. ${ind?'GST draft fields and UPI settings are shown below.':priceLabel(a.country)+'/month for new subscriptions. Same features at every country price.'}</div>
    ${regionFields}
    ${field('currency','Invoice & workspace currency',a.currency,'text',{choices:(a.country==='IN'?['INR']:a.country==='US'?['USD']:INVOICE_CURRENCIES).map(code=>({value:code,label:code+(code===invoiceCurrencyHint(a.country)?' — local currency':'')}))})}
    <p class="muted full-width">${invoiceCurrencyHint(a.country)?'Local currency: '+esc(invoiceCurrencyHint(a.country))+'. ':''}Choose before creating business records. Existing amounts are never converted. Your CERIUM subscription stays in ${esc(plan.currency)}. Rates support up to two decimal places.</p>
    <p class="muted full-width">Currency: ${esc(a.currency)}. ${legacy}</p>
    ${field('googlePlaceUrl','Google review link',a.googlePlaceUrl,'url',{full:true,placeholder:'Paste HTTPS review link',max:350})}
  </div><p id="profile-error" class="form-error" role="alert" hidden></p>
  <div class="settings-actions"><button type="submit" class="button primary">Save changes</button></div></form>
  </section><div class="settings-stack"><section class="panel" id="settings-plan-panel">
  ${panelHeader('payments','Your plan',a.planStatus==='active'?'Cerium Pro is active':a.subscription?.status==='authenticated'?'Automatic billing authorized':a.planStatus==='expired'?'Your free trial has ended':`${a.trialDaysRemaining} days remaining in your free trial`)}
  <div class="settings-content"><p class="eyebrow">CERIUM PRO — ${ind?'INDIA':us?'US':'GLOBAL'} EDITION</p>
    <p class="plan-price">${moneyPrice}<small> / ${currentAnnual?'year':'month'}</small></p>
    ${currentAnnual?`<p class="muted">Annual billing · billed once every 12 months at the agreed rate, excluding taxes.</p>`:''}
    <p class="muted">${plan.currency} billing${plan.discountPercent?` · ${plan.discountPercent}% country discount`:""}. Same features in every country. The price excludes applicable tax.</p>
    ${a.subscription&&a.availableBillingPrice&&plan.monthlyPrice!==a.availableBillingPrice.monthlyPrice?`<p class="muted">Your current authorization retains its agreed price. New country pricing is ${esc(priceLabel(a.country))}/month. Cancel future renewals before authorizing a new plan; paid access is retained.</p>`:""}
    <p class="muted">${ind?'For Indian subscriptions, Razorpay checkout can offer UPI AutoPay where supported. Authorize the mandate in your UPI app; no subscription is active until provider confirmation.':'USD checkout uses eligible international cards. Availability depends on the payment provider.'}</p>
    ${!currencyMismatch()&&canAuthorize?proof.verified?`<div class="settings-actions">${proof.checkoutConfigured?button('Authorize monthly billing','upgrade'):''}${proof.annualCheckoutConfigured?button('Authorize annual billing · '+annualNewPrice+'/year · 1 month free','upgrade-annual'):''}</div>`:'<p class="muted">Complete phone confirmation and billing-country declaration to unlock the recurring payment authorization button.</p>':''}
    ${canCancel?`<p class="muted">Recurring billing ${esc(a.subscription.status)}. Cancel future payments anytime.</p><div class="settings-actions">${button('Cancel subscription','cancel-subscription','','secondary')}</div>`:''}
  </div></section><section class="panel" id="settings-data-panel">
    ${panelHeader('download','Your data','Take a copy whenever you need it')}
    <div class="settings-content"><p class="muted">Export your profile and workspace records as JSON, or bring existing customers and leads from a CSV or Excel spreadsheet. Imports never overwrite existing records.</p>
    <div class="settings-actions">${button(icon('download')+'Export data','export','','secondary')}${button('Import customers / leads','import-leads','','secondary')}</div></div></section>
    <section class="panel danger-panel">${panelHeader('settings','Data controls')}
    <div class="settings-content"><p class="muted">These actions permanently remove data. You’ll be asked to confirm.</p>
    <div class="danger-actions"><button class="danger-text" data-action="clear-data">Clear workspace</button><button class="danger-text" data-action="delete-account">Delete account</button></div></div></section>
  </div></div>`;
}

function supportPage(view='help') {
  if (view === 'requests') {
    return pageHeading(...SECTIONS.support)+`<div class="settings-grid">
      <section class="panel" id="support-requests-panel">
        ${panelHeader('support','Support Requests','Direct assistance from the Cerium team')}
        <form class="settings-content" id="support-form">
          <div class="form-grid">
            ${field('category','Topic','Product question','text',{choices:['Product question','Bug report','Suggestion','Service / billing question','Other'],full:true})}
            ${field('subject','Subject','','text',{required:true,full:true,max:100})}
            ${field('body','Message','','textarea',{required:true,full:true,max:700})}
          </div>
          <p class="muted" style="margin-top:16px">This opens a draft in your email app. You choose when to send it.</p>
          <p id="support-error" class="form-error" role="alert" hidden></p>
          <div class="settings-actions">
            <button class="button primary" type="submit">Open email draft</button>
          </div>
        </form>
      </section>
      <section class="panel">
        ${panelHeader('support','Keep in touch')}
        <div class="settings-content">
          <p class="muted">Questions, problems, or something you wish Cerium did better?</p>
          <a class="support-email" href="mailto:cerium.founders@gmail.com">cerium.founders@gmail.com</a>
          <p class="eyebrow" style="margin-top:22px">SAVED DRAFTS</p>
          ${state.ws.messages.length?state.ws.messages.slice(0,5).map(m=>`<div class="message-row"><h3>${esc(m.subject)}</h3><span class="row-meta">${esc(m.category)} · ${dateLabel(m.createdAt)}</span><p>${esc(m.body.slice(0,140))}</p></div>`).join(''):'<p class="muted">Your recent messages will appear here.</p>'}
        </div>
      </section>
    </div>`;
  }
  return pageHeading(...SECTIONS.support)+`<div class="settings-grid">
    <section class="panel" id="product-help-workflows">
      ${panelHeader('support','Workflow Explanations','Learn how Cerium unifies daily trade operations')}
      <div class="settings-content">
        <div class="guide-suggestions" style="margin-top:0">
          <div class="task-row">
            <div class="row-details">
              <span class="row-title">1. Customers &amp; Sales (CRM)</span>
              <span class="row-meta">Enquiries &rarr; Pipeline Board &rarr; Follow-ups &rarr; Quotes &amp; Estimates</span>
              <p class="muted" style="margin:4px 0 0">Capture incoming customer leads, move them across your pipeline board, schedule callbacks, and send itemized quotes.</p>
            </div>
            <a class="button secondary" href="#customers/leads" data-nav="customers/leads">Open CRM</a>
          </div>
          <div class="task-row">
            <div class="row-details">
              <span class="row-title">2. Field Service (FSM)</span>
              <span class="row-meta">Weekly Calendar &rarr; Dispatch &rarr; Crew Assignments</span>
              <p class="muted" style="margin:4px 0 0">Schedule work appointments on the weekly calendar, dispatch crew members, and monitor active jobs without external calendars.</p>
            </div>
            <a class="button secondary" href="#field/schedule" data-nav="field/schedule">Open Schedule</a>
          </div>
          <div class="task-row">
            <div class="row-details">
              <span class="row-title">3. Billing &amp; Payments</span>
              <span class="row-meta">Invoices &rarr; WhatsApp/SMS &rarr; Payments &rarr; Bank Matching</span>
              <p class="muted" style="margin:4px 0 0">Convert completed jobs to itemized invoices, share payment links/QR, record customer payments, and review deposit matching.</p>
            </div>
            <a class="button secondary" href="#billing/invoices" data-nav="billing/invoices">Open Billing</a>
          </div>
          <div class="task-row">
            <div class="row-details">
              <span class="row-title">4. Marketing &amp; Reputation</span>
              <span class="row-meta">Get Found &rarr; Re-engage &rarr; Reviews &rarr; Lead Sources</span>
              <p class="muted" style="margin:4px 0 0">Draft local business updates, send Google review requests to satisfied customers, and analyze top enquiry channels.</p>
            </div>
            <a class="button secondary" href="#marketing/visibility" data-nav="marketing/visibility">Open Marketing</a>
          </div>
        </div>
      </div>
    </section>
    <section class="panel" id="product-help-feedback">
      ${panelHeader('support','Help &amp; Feedback','Need a hand or want to report an issue?')}
      <div class="settings-content">
        <p class="muted">Cerium is crafted for independent trades and services. We read every message and respond directly.</p>
        <div style="display:flex;gap:12px;margin-top:16px;flex-wrap:wrap">
          <a class="button primary" href="#support/support-requests" data-nav="support/support-requests">Contact Support</a>
          <button class="button secondary" data-action="ask-guide" data-prompt="How do I get started with Cerium?">Ask Cerium AI</button>
        </div>
        <p class="eyebrow" style="margin-top:22px">DIRECT CONTACT</p>
        <a class="support-email" href="mailto:cerium.founders@gmail.com">cerium.founders@gmail.com</a>
      </div>
    </section>
  </div>`;
}
function renderPage() {
  if(state.route.category)lastUsedTabs[state.route.category]=state.route.href;
  const openTools=state.route.id==='customize-tools'&&!state.route.subview&&$('page-body').dataset.route!==state.route.href;
  $('load-state').hidden=true; $('page-body').hidden=false;setNavigation();
  const s=state.section,sub=selectedSubview(state.route),scoped=subviewWorkspace(state.route,state.ws);
  if(s==='leads')state.view=sub==='board'?'board':'list';
  const content=(readOnly()?trialNotice():'')+(s==='overview'?overview():s==='jobs'?renderJobsPage(scoped,readOnly(),state.route.id==='schedule'&&sub!=='calendar'?'dispatch':state.route.view,Boolean(state.route.subview)):s==='quotes'?renderQuotesPage(scoped,readOnly()):s==='reminders'?(sub==='templates'?renderOperations(state.ws,'templates',readOnly())+renderReminderDrafts(state.ws):renderRemindersPage(state.ws,readOnly())):s==='dues'?renderPaymentDuesPage(state.ws,readOnly(),sub):s==='marketing'?renderMarketingPage(state.ws,{embedded:true}):singular[s]?listPage(s):s==='payments'?paymentsPage(state.route.id==='payments'&&sub==='bank'?'bank':state.route.view,sub):s==='insights'?renderInsightsPage(state.ws,state.route.view,state.route.subview):s==='settings'?settingsPage(state.route.view):s==='migration'?renderMigration(state.ws,selectedSubview(state.route),readOnly()):s==='operations'?renderOperations(state.ws,state.route.view,readOnly(),state.route.id==='attendance'?'attendance':''):s==='planning'?renderDispatchPlanner(state.ws,readOnly()):s==='assistant'?renderGuidancePage(state.route):supportPage(state.route.view));
  for(const modal of document.querySelectorAll('body>dialog[data-preserved-editor]:not([open])'))modal.remove();
  const openEditors=[...$('page-body').querySelectorAll('dialog[open]')];
  for(const modal of openEditors){modal.dataset.preservedEditor='true';document.body.append(modal);}
  $('page-body').innerHTML=renderFeatureWorkspace(state.route,state.ws.account.workspacePreferences?.modules,content,state.ws);
  for(const modal of document.querySelectorAll('body>dialog[data-preserved-editor][open]'))$('page-body').querySelector('#'+modal.id)?.remove();
  $('page-body').dataset.route=state.route.href;
  if(s==='overview')customizeOverview($('page-body'),state.ws.account.workspacePreferences?.modules);
  if(s==='dues')initializePaymentDuesUI({root:$('page-body'),api:API,getWorkspace:()=>state.ws,readOnly,refresh,toast});
  if(s==='marketing')initializeMarketingUI({root:$('page-body'),api:API,getWorkspace:()=>state.ws,readOnly,onCreated:refresh,toast,onNavigate:target=>go(target)});
  if(s==='marketing'){$('page-body').querySelector('h1').textContent=state.route.label;for(const panel of $('page-body').querySelectorAll('[data-marketing-panel]'))panel.hidden=panel.dataset.marketingPanel!==state.route.view;}
  if(singular[s])renderResults();
  // Pre-PR99 Overview renders without a feature wrapper; preserve its full dashboard.
  if(state.route.category!=='overview')applySubviewLayout($('page-body'),state.route,state.ws);
  initializeOperations({root:$('page-body'),ws:state.ws,api:API,refresh,readOnly,toast});
  initializeCustomerPayments({root:$('page-body'),ws:state.ws,api:API,refresh,readOnly,toast});
  initializeMigration({root:$('page-body'),ws:state.ws,api:API,refresh,readOnly,toast});
  drafts.restore(s);
  decorateHeadingAccents($('page-body'));
  requestAnimationFrame(()=>revealActiveFeature($('page-body')));
  if(openTools)$('workspace-customizer-dialog')?.showModal();
  if(readOnly()) {
    $('page-body').querySelectorAll('[data-action="new"],[data-action="edit"],[data-action="delete"],[data-action="toggle-followup"],[data-action="mark-requested"],[data-action="review-received"],[data-action="match-payment"],[data-action="dismiss-payment"],[data-invoice-status]').forEach(control=>{
      control.disabled=true;
      control.setAttribute('aria-disabled','true');
      control.title=currencyMismatch()?'Review legacy currency before editing':'Trial ended — activate Cerium Pro to edit business records';
    });
  }
}
function getRecord(kind,id) {return state.ws[kindKey[kind]]?.find(r=>String(r.id)===String(id));}
function openRecord(kind,id) {
  const record=id?getRecord(kind,id):null;if(id&&!record){toast('This record is no longer available.',true);return;}
  state.editor={kind,id:id||null};
  $('record-form').reset();formError('record-error','');
  const names={lead:'lead',followup:'follow-up',invoice:'invoice',review:'review request'};
  $('record-title').textContent=record?`Edit ${names[kind]}`:kind==='review'?'Log a review request':`New ${names[kind]}`;
  $('record-eyebrow').textContent={lead:'CUSTOMERS',followup:'YOUR NEXT ACTION',invoice:'BILLING',review:'REPUTATION'}[kind];
  $('record-description').textContent=kind==='review'?"Track a request you’ve already sent. This saves a record; it doesn’t send a message.":kind==='invoice'?'Create a clear record for your customer. Preview it and save a PDF after saving.':kind==='lead'?'Capture the essentials now. You can add more detail later.':'Set a reminder so the next conversation doesn’t slip away.';
  const v=record||{},today=businessLocalDate(state.ws.account.timeZone);let html='';
  const invoiceMode=kind==='invoice'?indiaInvoiceMode(state.ws.account,v):'international';
  if(kind==='lead')html=field('name','Customer name',v.name,'text',{required:true,full:true})+field('email','Email',v.email,'email')+field('phone','Phone',contactPhone(v.phone),'tel',{placeholder:phonePlaceholder(state.ws.account.country)})+field('stage','Stage',v.stage||'New','text',{choices:STAGES})+field('source','Source',v.source||'Direct','text',{choices:[...new Set([...SOURCES,v.source].filter(Boolean))]})+field('value',`Estimated value (${currency()})`,v.value||'','number',{min:0,step:'.01'})+field('nextFollowUp','Next follow-up',v.nextFollowUp||today,'date')+field('address','Service address',v.address,'text',{full:true,placeholder:isIndia()?'Street, area, city, state, PIN':state.ws.account.country==='US'?'Street, city, state, ZIP':'Street, city, region, postal code'})+field('notes','Notes',v.notes,'textarea',{full:true,max:350})+(record?'':'<label class="check-field"><input type="checkbox" name="createReminder" checked>Create a follow-up reminder</label>');
  if(kind==='followup')html=field('contactName','Customer name',v.contactName,'text',{required:true,full:true})+field('task','What needs to happen?',v.task,'text',{required:true,full:true,max:250})+field('dueDate','Due date',v.dueDate||today,'date',{required:true})+field('channel','Contact method',v.channel||'Call','text',{choices:['Call','Text','Email']})+field('phone','Phone',contactPhone(v.phone),'tel',{full:true,placeholder:phonePlaceholder(state.ws.account.country)});
  if(kind==='invoice')html=field('customerName','Customer name',v.customerName,'text',{required:true,full:true})+field('customerEmail','Email',v.customerEmail,'email')+field('customerAddress','Billing address',v.customerAddress,'text',{placeholder:isIndia()?'Street, area, city, state, PIN':state.ws.account.country==='US'?'Street, city, state, ZIP':'Street, city, region, postal code'})+field('jobTitle','Work / description',v.jobTitle,'text',{required:true,full:true})+field('amount',`Amount before tax (${currency()})`,v.details?.subtotal??(isIndia()?((Number(v.taxable)>0?v.taxable:(v.total??''))):(v.total??'')),'number',{required:!v.jobId,min:v.jobId?0:'.01',step:'.01',readOnly:!!v.jobId||!!(v.items?.length>1)})+field('terms','Payment terms',v.terms||'Net 15','text',{choices:['Due on receipt','Net 7','Net 15','Net 30']})+field('status','Status',v.status||'Draft','text',{choices:['Draft','Sent','Overdue','Paid'],full:true})+field('notes','Notes',v.notes,'textarea',{full:true,max:350})+(v.items?.length>1&&!v.jobId?'<p class="muted">This invoice has multiple line items. The existing item totals are preserved.</p>':'')+(isIndia()?(invoiceMode==='gst'?field('customerGstin','Customer GSTIN (if registered)',v.customerGstin||'','text',{max:15,full:true})+field('placeOfSupply','Place of supply',v.placeOfSupply||state.ws.account.indiaState||'','text',{choices:[{value:'',label:'Select state / UT'},...INDIA_STATE_OPTIONS]})+field('hsnSac','HSN / SAC (4–8 digits)',v.hsnSac||'','text',{max:8})+field('gstRate','Applicable GST rate (%)',v.gstRate??0,'number',{min:0,step:'.01'})+'<p class="muted full-width">Tax rate and HSN/SAC must be confirmed against the actual supply. All items currently share one tax code/rate; complex invoices need accountant review.</p>':'<p class="muted full-width" role="status"><strong>Commercial invoice · No GST charged.</strong> Your business has no GSTIN, so you can issue a regular invoice without entering GST fields. This is not a GST tax invoice. If you are registered, add your GSTIN in Settings first.</p>'):'');
  if(kind==='invoice'){
    const preset=invoiceCountry(v.details?.country||state.ws.account.country),details=v.details||{};
    html+=`<section class="invoice-local-fields full-width"><h3>Local invoice details · ${esc(countryName(preset.country))}</h3>
      <p class="muted">${esc(preset.guidance)} ${preset.paper} print layout · ${esc(currency())} amounts.</p>
      <div class="form-grid">${field('supplyDate','Date goods / services supplied',details.supplyDate||v.issueDate||today,'date',{required:true})}
      ${!isIndia()?field('supplierTaxId',esc(preset.taxIdLabel)+' (business)',details.supplierTaxId||'','text',{max:80})+field('customerTaxId','Customer tax registration ID (if applicable)',details.customerTaxId||'','text',{max:80,full:true})+field('taxTreatment','Tax treatment',details.taxLines?.length?'tax':'none','text',{choices:[{value:'none',label:'No tax charged'},{value:'tax',label:'Add '+preset.taxLabel+' / other tax components'}],full:true}):''}
      </div>
      ${!isIndia()?`<div id="invoice-tax-fields" class="form-grid" ${details.taxLines?.length?'':'hidden'}>${Array.from({length:4},(_,index)=>field('taxLabel'+index,index===0?'Tax name':'Additional tax name (optional)',details.taxLines?.[index]?.label||(index===0?preset.taxLabel:''),'text',{max:40})+field('taxRate'+index,'Rate (%)',details.taxLines?.[index]?.rate??'','number',{min:0,step:'.0001'})).join('')}</div><p class="muted">Tax rows apply independently to the amount before tax. For mixed rates, compounded taxes or statutory e-invoicing, use your local accounting workflow.</p>`:''}
      <div class="form-grid">${field('taxNote','Exemption / reverse-charge reference or tax note',details.taxNote||'','textarea',{full:true,max:500})}
      ${field('paymentInstructions','Customer payment instructions',details.paymentInstructions||'','textarea',{full:true,max:500,placeholder:'Bank transfer reference or other payment instructions'})}</div>
    </section>`;
  }
  if(kind==='invoice'&&v.jobId){
    const rows=(v.items||[]).map((item,index)=>`<div class="invoice-billing-row" data-invoice-line>
      <label>Item ${index+1} <input data-invoice-line-field="description" value="${esc(item.description)}" maxlength="180" required></label>
      <label>Quantity <input data-invoice-line-field="qty" type="number" min="0.01" max="10000" step="0.01" value="${esc(item.qty)}" required></label>
      <label>Rate <input data-invoice-line-field="rate" type="number" min="0" max="1000000" step="0.01" value="${esc(item.rate)}" required></label>
    </div>`).join('');
    html+=`<section class="invoice-billing-section"><h3>Review invoice line items</h3>
      <p class="muted">Automatically drafted from the completed job. Set correct prices before marking it Sent. CERIUM never sends invoices automatically.</p>
      ${rows}</section>`;
  }
  if(kind==='review')html=field('customerName','Customer name',v.customerName,'text',{required:true,full:true})+field('jobTitle','Completed job',v.jobTitle,'text',{required:true,full:true})+field('customerEmail','Email',v.customerEmail,'email')+field('customerPhone','Phone',v.customerPhone,'tel');
  $('record-fields').innerHTML=html;$('record-submit').textContent=record?'Save changes':kind==='invoice'?'Create invoice':kind==='review'?'Save request':'Save '+names[kind];$('record-dialog').showModal(); $('record-fields').querySelector('input,select,textarea')?.focus();
}
function requestConfirmation(title,description,fn,phrase=false) {
  state.confirmation={fn,phrase};$('confirm-form').querySelector('[type=submit]').textContent=title.startsWith('Match')?'Confirm match':'Delete';$('confirm-title').textContent=title;$('confirm-description').textContent=description;$('confirm-phrase-label').hidden=!phrase;$('confirm-phrase').value='';formError('confirm-error','');$('confirm-dialog').showModal();
}
function previewInvoice(id) {
  const i=getRecord('invoice',id);if(!i)return;const a=state.ws.account;
  const ind=i.currency==='INR'||isIndia();
  const bp=a.businessProfile,details=i.details,preset=invoiceCountry(details?.country||a.country);
  const supplier=details?.supplier;
  const printedDate=value=>invoiceDate(value,preset.country);
  const address=supplier?supplier.address:(bp?.complete?[bp.businessAddress,bp.businessCity,ind?INDIAN_STATES[i.supplierState||a.indiaState]:a.usState||bp.businessRegion,bp.businessPostalCode,countryName(a.country)].filter(Boolean).join(', '):ind?[a.location,INDIAN_STATES[i.supplierState||a.indiaState]||''].filter(Boolean).join(', '):
    [a.location,[a.usState,a.usZip].filter(Boolean).join(' ')].filter(Boolean).join(', '));
  const fmt=n=>invoiceMoney(n,i.currency||currency(),preset.country);
  const gst=ind&&Boolean(i.supplierGstin);
  const taxLines=gst?`<div class="invoice-tax-summary">
    <p><strong>Taxable amount</strong> ${fmt(i.taxable)}</p>
    ${i.cgst?`<p>CGST ${fmt(i.cgst)}</p>`:''}
    ${i.sgst?`<p>SGST ${fmt(i.sgst)}</p>`:''}
    ${i.utgst?`<p>UTGST ${fmt(i.utgst)}</p>`:''}
    ${i.igst?`<p>IGST ${fmt(i.igst)}</p>`:''}
    <p>GST rate: ${esc(i.gstRate)}%</p></div>`:details?.taxLines?.length?`<div class="invoice-tax-summary"><p><strong>Subtotal</strong> ${fmt(details.subtotal)}</p>${details.taxLines.map(row=>`<p>${esc(row.label)} (${esc(row.rate)}%) <strong>${fmt(row.amount)}</strong></p>`).join('')}</div>`:'';
  const invoiceTitle=gst?'DRAFT GST TAX INVOICE':'INVOICE';
  const merchantName=supplier?.name??(a.businessName||a.name);
  const upiUri=invoiceUpiUri({
    country:preset.country,currency:i.currency,upiVpa:i.upiVpa,
    amount:i.balance??i.total,merchantName,invoiceId:i.id,status:i.status
  });
  const upiQr=invoiceUpiQrSvg(upiUri);
  const shareLinks=invoiceShareLinks({invoice:i,merchantName,upiUri});
  const rounding=lineItemsRoundingAdjustment(i.items,gst?i.taxable:details?.subtotal??i.total);
  $('invoice-sheet').innerHTML=`<article class="invoice-document invoice-paper-${preset.paper.toLowerCase()}">
    <div class="invoice-top"><div><h2>${esc(supplier?.name??(a.businessName||a.name))}</h2>
      <p>${esc(address)}<br>${esc(supplier?.email??(bp?.complete?bp.businessEmail:a.email))}${(supplier?supplier.phone:a.phone)?'<br>'+esc(supplier?supplier.phone:contactPhone(a.phone)):''}<br>${esc(countryName(preset.country))}
      ${gst?'<br>GSTIN: '+esc(i.supplierGstin):details?.supplierTaxId?'<br>'+esc(preset.taxIdLabel)+': '+esc(details.supplierTaxId):''}</p></div>
      <div><p class="eyebrow">${invoiceTitle} #${esc(i.id)}</p>${badge(i.status)}</div></div>
    <div class="invoice-info"><div><small>Billed to</small><strong>${esc(i.customerName)}</strong>
      <p>${esc(i.customerAddress||i.customerEmail)}</p>${i.customerGstin?'<p>Customer GSTIN: '+esc(i.customerGstin)+'</p>':details?.customerTaxId?'<p>Tax registration ID: '+esc(details.customerTaxId)+'</p>':''}</div>
      <div><small>Issued</small>${printedDate(i.issueDate)}<p>${esc(i.terms)}</p></div>
      <div><small>Due</small>${printedDate(i.dueDate)}</div></div>
    <p class="muted">Invoice currency: ${esc(i.currency||currency())}${details?.supplyDate?' · Supply date: '+printedDate(details.supplyDate):''}</p>
    ${gst?`<p class="muted">Place of supply: ${esc(INDIAN_STATES[i.placeOfSupply]||i.placeOfSupply)} (${esc(i.placeOfSupply)}) · HSN/SAC: ${esc(i.hsnSac)}</p>`:''}
    ${table(['Description','Qty','Rate','Amount'],i.items.map(item=>`<tr><td>${esc(item.description)}</td><td>${esc(item.qty)}</td><td>${fmt(item.rate)}</td><td>${fmt(lineItemsTotal([item]))}</td></tr>`))}
    ${rounding?`<p class="muted">Rounding adjustment ${fmt(rounding)}</p>`:''}
    ${taxLines}
    ${ind&&!gst?'<p class="muted">Commercial invoice — no GST charged by the supplier. This is not a GST tax invoice.</p>':''}
    <div class="invoice-total"><span>Total</span><span>${fmt(i.total)}</span></div>
    ${i.allocatedAmount>0?`<p>Recorded payments: ${fmt(i.allocatedAmount)}</p><div class="invoice-total"><span>Balance due</span><span>${fmt(i.balance)}</span></div>`:''}
    ${upiUri?`<section class="invoice-upi-payment" aria-label="UPI payment information">
      ${upiQr?`<div class="invoice-upi-qr-frame">${upiQr}<small>Scan to pay</small></div>`:''}
      <div class="invoice-upi-payment-details"><strong>Pay by UPI</strong>
        <p>Payee: ${esc(i.upiVpa)}</p><p>Amount: ${fmt(i.balance??i.total)}</p>
        <p><a href="${esc(upiUri)}" rel="nofollow">Open your UPI app to pay</a></p>
        <small>Check the payee and amount in your app. Payment is not confirmed by Cerium; the business must verify receipt.</small>
      </div></section>`:''}
    ${gst?'<p class="muted">Draft only. Validate invoice numbering, tax classification, signature, reverse charge, IRN/e-invoicing eligibility and other statutory requirements before issuing.</p>':''}
    ${details?.taxNote?`<p class="invoice-preserve-lines"><strong>Tax note:</strong> ${esc(details.taxNote)}</p>`:''}
    ${details?.paymentInstructions?`<p class="invoice-preserve-lines"><strong>Payment instructions:</strong> ${esc(details.paymentInstructions)}</p>`:''}
    <p class="muted">${esc(i.notes)}</p>
  </article>`;
  state.printInvoice={id:i.id,paper:preset.paper,shareLinks,upiUri};
  $('invoice-copy-upi').hidden=!upiUri;
  $('invoice-dialog').showModal();
}

async function copyReview(id) {
  const r=getRecord('review',id),url=safeReviewURL(state.ws.account.googlePlaceUrl);if(!url){toast('Add your Google review link in Settings first.',true);return;}
  const text=`Hi ${r.customerName}, thank you for choosing ${state.ws.account.businessName||state.ws.account.name}. If you have a moment, we’d appreciate your feedback: ${url}`;
  if(!navigator.clipboard?.writeText)throw new Error('Clipboard access is unavailable. Open Settings to copy your review link.');
  await navigator.clipboard.writeText(text);toast('Request copied. Send it in your email or messaging app.');
}
function openNavigation() {
  $('sidebar').inert=false;$('sidebar').classList.add('is-open');$('nav-backdrop').hidden=false;$('menu-toggle').setAttribute('aria-expanded','true');$('main-frame').inert=true;$('sidebar').querySelector('[aria-current=page]')?.focus();
}
function closeNavigation() {
  const open=$('sidebar').classList.contains('is-open');$('sidebar').classList.remove('is-open');$('nav-backdrop').hidden=true;$('main-frame').inert=false;$('menu-toggle').setAttribute('aria-expanded','false');if(open)$('menu-toggle').focus();$('sidebar').inert=innerWidth<=760;
}
// Desktop-only compact rail preference. CSS keeps the mobile drawer full width
// even if this device's saved desktop preference is collapsed.
const SIDEBAR_COLLAPSE_KEY='cerium.sidebar.collapsed';
function setSidebarCollapsed(collapsed,persist=false){
  const value=Boolean(collapsed);
  $('workspace').classList.toggle('sidebar-collapsed',value);
  const toggle=$('sidebar-collapse-toggle'),label=value?'Expand sidebar':'Collapse sidebar';
  toggle.setAttribute('aria-expanded',String(!value));
  toggle.setAttribute('aria-label',label);
  toggle.title=label;
  // In the compact desktop rail the brand is decorative beneath the expand
  // button. Remove the hidden link from keyboard/screen-reader navigation,
  // but restore it immediately for the full sidebar and mobile drawer.
  const brand=$('sidebar').querySelector('.sidebar-top .brand');
  const compactDesktop=value&&window.innerWidth>760;
  brand.tabIndex=compactDesktop?-1:0;
  if(compactDesktop)brand.setAttribute('aria-hidden','true');
  else brand.removeAttribute('aria-hidden');
  if(persist){
    try{localStorage.setItem(SIDEBAR_COLLAPSE_KEY,value?'1':'0');}catch{}
  }
}
function initializeSidebarCollapse(){
  // Keep an accessible name and native hover tooltip when link copy is hidden.
  for(const link of $('sidebar').querySelectorAll('.nav-link')){
    const name=link.querySelector('span:not(.nav-count)')?.textContent?.trim();
    if(name){link.setAttribute('aria-label',name);link.title=name;}
  }
  let saved=false;
  try{saved=localStorage.getItem(SIDEBAR_COLLAPSE_KEY)==='1';}catch{}
  setSidebarCollapsed(saved);
  $('sidebar-collapse-toggle').addEventListener('click',()=>{
    setSidebarCollapsed(!$('workspace').classList.contains('sidebar-collapsed'),true);
  });
}
initializeSidebarCollapse();
$('menu-toggle').addEventListener('click',openNavigation);$('nav-backdrop').addEventListener('click',closeNavigation);
window.addEventListener('resize',()=>{if(innerWidth>760||!$('sidebar').classList.contains('is-open'))closeNavigation();setSidebarCollapsed($('workspace').classList.contains('sidebar-collapsed'));revealActiveFeature($('page-body'));});
window.addEventListener('hashchange',()=>navigate(location.hash,true));
window.addEventListener('popstate',()=>navigate(location.hash,true));
document.addEventListener('cerium:form-saved',e=>drafts.clear(e.detail?.section));
// Ordinary links support Tab/Enter; Arrow/Home/End speed up each horizontal tier.
document.addEventListener('keydown',e=>{
  const link=e.target.closest('.workspace-angular-navigation .workspace-feature-tab,.workspace-angular-navigation .workspace-subfeature-tab');
  if(!link||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
  const bar=link.closest('nav'),items=[...bar.querySelectorAll('a[href]')],index=items.indexOf(link);
  if(index<0||!items.length)return;
  e.preventDefault();
  const next=e.key==='Home'?0:e.key==='End'?items.length-1:(index+(e.key==='ArrowRight'?1:-1)+items.length)%items.length;
  go(items[next].getAttribute('href'),link.classList.contains('workspace-subfeature-tab')?'subview':true);
});
document.addEventListener('cerium:open-invoice',e=>{
  if(!state.ws)return;
  go('#billing/invoices');
  previewInvoice(e.detail?.id);
});
document.addEventListener('keydown',e=>{
  if(!$('sidebar').classList.contains('is-open'))return;
  if(e.key==='Escape'){e.preventDefault();closeNavigation();}
  if(e.key==='Tab'){const items=[...$('sidebar').querySelectorAll('a,button')].filter(x=>!x.disabled&&!x.hidden&&x.getClientRects().length),first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
});
document.addEventListener('click',e=>{
  const category=e.target.closest('[data-category]'),nav=e.target.closest('[data-nav]');
  if(category||nav){if(e.button||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;e.preventDefault();go(category?categoryDestination(category.dataset.category,state.ws?.account.workspacePreferences?.modules,lastUsedTabs).href:nav.getAttribute('href'),nav?.dataset.subfeature?'subview':Boolean(nav?.dataset.feature));return;}
  const el=e.target.closest('[data-action]');if(!el)return;const {action,id,kind}=el.dataset;
  if(action==='close-dialog'){if(!el.closest('dialog').hasAttribute('aria-busy'))el.closest('dialog').close();return;}
  if(action==='refresh'){perform('refresh',el,async()=>{if(state.ws)await refresh();else await initialize();});return;}
  if(!state.ws)return;
  if(readOnly() && ['import-leads','new','edit','delete','new-quote','toggle-followup','mark-requested','review-received','match-payment','dismiss-payment'].includes(action)){toast('Your trial has ended. Upgrade in Settings to make changes.',true);return;}
  if(action==='ask-guide'){
    const prompt=el.dataset.prompt;
    const trigger=document.getElementById('guide-trigger');
    if(trigger?.getAttribute('aria-expanded')==='false')trigger.click();
    const input=document.getElementById('guide-question');
    if(input){input.value=prompt;input.dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('guide-form')?.requestSubmit();}
    return;
  }
  if(action==='import-leads'){
    try{openLeadImport({api:API,readOnly:readOnly(),offline:Boolean(API.localBusinessSetup),onComplete:async(result)=>{await refresh();toast(result.imported+' customers and leads imported.');}});}
    catch(err){toast(err.message||'Could not open spreadsheet import.',true);}
    return;
  }
  if(action==='new-quote'){
    go('#customers/quotes');
    document.dispatchEvent(new CustomEvent('cerium:new-quote',{detail:{leadId:id}}));
    return;
  }
  if(action==='new'||action==='edit'){openRecord(kind,action==='edit'?id:null);return;}
  if(action==='lead-view'){go(subviewHref(state.route,el.dataset.view));return;}
  if(action==='preview-invoice'){previewInvoice(id);return;}
  if(action==='business-setup'){perform('business-setup',el,async()=>showLocalBusinessSetup(await API.getBusinessSetup(),true));return;}
  if(action==='print-invoice'){
    try{
      const article=$('invoice-sheet').querySelector('.invoice-document');
      if(!article||!state.printInvoice)throw new Error('Open an invoice preview first.');
      openInvoicePrint({invoiceMarkup:article.outerHTML,paper:state.printInvoice.paper,title:'Invoice '+state.printInvoice.id});
    }catch(error){toast(error.message||'Could not open the print-ready invoice.',true);}
    return;
  }
  if(action==='share-invoice'){
    const channel=el.dataset.channel;
    if(!['whatsapp','sms','email'].includes(channel)||!state.printInvoice)return;
    const url=state.printInvoice.shareLinks[channel];
    if(channel==='whatsapp')window.open(url,'_blank','noopener,noreferrer');
    else window.location.href=url;
    return;
  }
  if(action==='copy-invoice-upi'){
    const link=state.printInvoice?.upiUri;
    if(!link)return;
    perform('copy-invoice-upi',el,async()=>{
      if(!navigator.clipboard?.writeText)throw new Error('Clipboard access is unavailable; use the UPI link in the invoice preview.');
      await navigator.clipboard.writeText(link);
      toast('UPI payment link copied. Payment is not automatically confirmed.');
    });
    return;
  }
  if(action==='delete'){
    const r=getRecord(kind,id);if(!r)return;requestConfirmation('Delete '+(kind==='followup'?'follow-up':kind)+'?',`This permanently removes ${r.name||r.contactName||r.customerName||'this record'}. This cannot be undone.`,async()=>{await deleteCalls[kind](id);await refresh();toast('Record deleted.');});return;
  }
  if(action==='clear-data'||action==='delete-account'){
    requestConfirmation(action==='clear-data'?'Clear your workspace?':'Delete your account?',action==='clear-data'?'This permanently deletes leads, quotes, scheduled jobs, invoices, customer payments and allocations, custom payment dues, reminders, reviews, and other workspace records. Your account and payment history remain. If safe, an older INR demo workspace will start fresh in USD. Export anything you need first.':'This permanently deletes your account and all its records. Export your data first if you need a copy.',async()=>{if(action==='clear-data'){await API.deleteWorkspaceData();await refresh();toast('Workspace cleared.');}else{await API.deleteAccount();location.href='/';}},true);return;
  }
  perform(action+':'+(id||''),el,async()=>{
    if(action==='toggle-followup'){await API.toggleFollowUp(id);await refresh();toast('Follow-up updated.');}
    else if(action==='copy-review')await copyReview(id);
    else if(action==='mark-requested'){await API.sendReviewRequest(id);await refresh();toast('Marked as requested.');}
    else if(action==='review-received'){await API.markReviewReceived(id);await refresh();toast('Review marked as received.');}
    else if(action==='match-payment'){
      requestConfirmation('Match this deposit?',`This marks invoice #${el.dataset.invoice} as paid. Confirm only if the amount and customer match.`,async()=>{await API.resolveBankMatch(id,'confirm',el.dataset.invoice);await refresh();toast('Payment matched.');});
    }
    else if(action==='dismiss-payment'){await API.resolveBankMatch(id,'dismiss');await refresh();toast('Deposit dismissed.');}
    else if(action==='export')await API.exportMyData();
    else if(action==='logout')await API.logout();
    else if(action==='upgrade'||action==='upgrade-annual'){await window.CeriumBilling.startSubscriptionCheckout({billingCycle:action==='upgrade-annual'?'annual':'monthly',onComplete:()=>perform('billing-refresh',null,async()=>{await refresh();toast('Subscription authorized. Review your renewal schedule in Settings.');}),onError:err=>toast(err.message,true)});}
    else if(action==='cancel-subscription'){requestConfirmation('Cancel recurring payments?','Future renewals will stop. Access already granted by your trial or paid period remains until its original end date.',async()=>{await API.cancelRecurringSubscription();await refresh();toast('Future recurring payments cancelled.');});}
  });
});
document.addEventListener('input',e=>{if(e.target.dataset.filter==='query'){(state.filters[state.section]||={}).query=e.target.value;renderResults();}});
document.addEventListener('change',e=>{
  if(e.target.name==='taxTreatment'&&$('invoice-tax-fields'))$('invoice-tax-fields').hidden=e.target.value!=='tax';
  if(e.target.id==='field-country'&&!state.ws.account.regionLocked){
    const saved=state.ws.account.country;
    const chosen=e.target.value;
    const hint=$('edition-save-hint');
    if(hint)hint.textContent=chosen===saved
      ?'Saved edition: '+countryName(saved)+' · '+(saved==='IN'?'INR':'USD')+'.'
      :'Pending change to '+countryName(chosen)+' · '+priceLabel(chosen)+'/month'+'. Click Save changes to activate. The workspace must be empty; existing invoices, jobs, payments and subscriptions are never converted.';
  }
  const key=e.target.dataset.filter;if(key&&key!=='query'){
    state.filters[state.section]||=initialFilters(state.section);state.filters[state.section][key]=e.target.value;
    if(key==='status'&&state.route.subview)go(state.route.featureHref);else renderResults();
  }
  const id=e.target.dataset.invoiceStatus;if(id && readOnly()){toast('Your trial has ended. Invoice changes are unavailable.',true);return;}if(id){const old=getRecord('invoice',id)?.status;perform('invoice-status:'+id,e.target,async()=>{try{await API.updateInvoiceStatus(id,e.target.value);await refresh();toast('Invoice status updated.');}catch(err){e.target.value=old;throw err;}});}
});
$('invoice-dialog').addEventListener('close',()=>{state.printInvoice=null;});
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('cancel',e=>{if(d.hasAttribute('aria-busy'))e.preventDefault();}));
$('record-form').addEventListener('submit',e=>{
  e.preventDefault();if(readOnly()){toast('Your trial has ended. Business records are read-only.',true);return;}const {kind,id}=state.editor,form=e.currentTarget,values=Object.fromEntries(new FormData(form));Object.keys(values).forEach(k=>{values[k]=String(values[k]).trim();});
  if(kind==='invoice'&&!isIndia()){
    values.taxLines=[];
    for(let index=0;index<4;index++){
      const label=values['taxLabel'+index],rate=values['taxRate'+index];
      if(values.taxTreatment==='tax'&&(rate!==''||index>0&&label))values.taxLines.push({label,rate});
      delete values['taxLabel'+index];delete values['taxRate'+index];
    }
    if(values.taxTreatment==='tax'&&!values.taxLines.length){formError('record-error','Enter a tax rate, including 0 for a confirmed zero-rated supply.');return;}
    delete values.taxTreatment;
  }
  if(kind==='invoice'&&isIndia())Object.assign(values,prepareIndiaInvoicePayload(values,indiaInvoiceMode(state.ws.account,id?getRecord('invoice',id):{})));
  const isJobInvoice=kind==='invoice'&&id&&Boolean(getRecord(kind,id)?.jobId);
  if(isJobInvoice){
    values.items=[...form.querySelectorAll('[data-invoice-line]')].map(row=>{
      const get=key=>row.querySelector('[data-invoice-line-field="'+key+'"]').value.trim();
      return {description:get('description'),qty:Number(get('qty')),rate:Number(get('rate'))};
    });
    values.amount=String(lineItemsTotal(values.items));
  }
  let error=validateRecord(kind,values);
  if(isJobInvoice&&values.status==='Draft'&&error==='Enter an invoice amount greater than zero.')error='';
  formError('record-error',error);if(error)return;
  if(kind==='lead'&&!id)values.createReminder=form.elements.createReminder.checked;
  if(kind==='invoice'&&id&&(getRecord(kind,id).items.length>1||isJobInvoice))delete values.amount;
  perform('save-record',$('record-submit'),async()=>{const d=$('record-dialog');d.setAttribute('aria-busy','true');try{if(id)await updateCalls[kind](id,values);else await createCalls[kind](values);d.close();await refresh();toast(id?'Changes saved.':'Record created.');}finally{d.removeAttribute('aria-busy');}},'record-error');
});
$('confirm-form').addEventListener('submit',e=>{
  e.preventDefault();const c=state.confirmation;if(!c)return;if(c.phrase&&$('confirm-phrase').value!=='DELETE'){formError('confirm-error','Type DELETE exactly to confirm.');return;}
  perform('confirmation',e.submitter,async()=>{const d=$('confirm-dialog');d.setAttribute('aria-busy','true');try{await c.fn();d.close();state.confirmation=null;}finally{d.removeAttribute('aria-busy');}},'confirm-error');
});
document.addEventListener('submit',e=>{
  if(e.target.id==='billing-phone-start'){
    e.preventDefault();
    const form=e.target;
    const phone=form.elements.phone.value.trim();
    const confirmCountry=form.elements.confirmCountry.checked;
    perform('billing-phone-start',e.submitter,async()=>{
      const result=await API.startBillingPhone(phone,confirmCountry,state.ws.account.country);
      await refresh();
      toast(result.mode==='development'?'Local code requested — enter 000000 below.':'Verification code requested. Check your phone.');
    });
    return;
  }
  if(e.target.id==='billing-phone-check'){
    e.preventDefault();
    const code=e.target.elements.code.value.trim();
    perform('billing-phone-check',e.submitter,async()=>{
      await API.verifyBillingPhone(code);
      await refresh();
      toast('Phone confirmed. You can now authorize regional billing.');
    });
    return;
  }
  if(e.target.id==='profile-form'){
    e.preventDefault();const data=Object.fromEntries(new FormData(e.target));delete data.email;
    if(data.country==='US'&&!validUsZip(data.usZip||'')){formError('profile-error','Enter a ZIP code (12345 or 12345-6789).');return;}
    if(data.country==='IN'&&(!validGSTIN(data.gstin||'')||!validIndianState(data.indiaState||'')||!validUpiVpa(data.upiVpa||''))){formError('profile-error','Check your GSTIN, state and UPI ID.');return;}
    if(data.googlePlaceUrl&&!safeReviewURL(data.googlePlaceUrl)){formError('profile-error','Use a valid HTTPS link for review requests.');return;}
    perform('profile',e.submitter,async()=>{const previous=state.ws.account.country;await API.updateAccount(data);drafts.clear('settings');await refresh();toast(previous!==state.ws.account.country?(isIndia()?'India edition activated — INR and GST/UPI draft fields are now available.':countryName(state.ws.account.country)+' activated — USD workspace ready.'):'Business profile saved.');},'profile-error');
  }
  if(e.target.id==='support-form'){
    e.preventDefault();const data=Object.fromEntries(new FormData(e.target));
    perform('support',e.submitter,async()=>{await API.createMessage({...data,replyTo:state.ws.account.email,via:'Email draft'});const subject=`[Cerium · ${data.category}] ${data.subject}`;const body=`${data.body}\n\n${state.ws.account.name}\n${state.ws.account.email}`;drafts.clear('support');await refresh();location.href='mailto:cerium.founders@gmail.com?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body);toast('Draft opened in your email app. Send it there when ready.');},'support-error');
  }
});
function showLocalBusinessSetup(setup,editing=false){
  $('workspace').hidden=true;
  let panel=$('business-setup-preview');
  if(!panel){panel=document.createElement('main');panel.id='business-setup-preview';panel.className='business-setup-preview';document.body.append(panel);}
  panel.innerHTML='<h1>'+ (editing?'Update your business.':'First, set up your business.')+'</h1><p>Complete each step before using the workspace. This offline preview does not send SMS or collect payments. Setup details are saved in this browser.</p><div id="preview-business-form"></div>';
  mountBusinessSetup($('preview-business-form'),{api:API,editing,onComplete:async()=>{panel.remove();await initialize();}}).show(setup);
  signalEntryReady();
}
function signalEntryReady(failed=false){
  window.CeriumWorkspaceReady=failed?'failed':'ready';
  window.dispatchEvent(new Event('cerium:workspace-ready'));
  const reveal=()=>{
    if(window.CeriumEntryLoader){if(failed)window.CeriumEntryLoader.fail();else window.CeriumEntryLoader.complete();}
    else{
      const scene=document.querySelector('[data-cerium-entry]');
      if(scene){scene.hidden=true;}
    }
  };
  if(window.CeriumEntryLoader||document.readyState==='complete')reveal();
  else window.addEventListener('load',reveal,{once:true});
}
async function initialize() {
  window.CeriumWorkspaceReady='pending';
  $('workspace').hidden=true;$('load-state').hidden=false;$('page-body').hidden=true;
  try {
    const me=await API.getMe();
    if(!me.signedIn){location.href='/login.html?returnTo='+encodeURIComponent('/app.html'+location.hash);return;}
    const setup=await API.getBusinessSetup();
    if(!setup.complete){
      if(!API.localBusinessSetup){location.replace('/verify.html');return;}
      showLocalBusinessSetup(setup);
      return;
    }
    await refresh();$('workspace').hidden=false;
    signalEntryReady();
  }
  catch(err){
    $('workspace').hidden=true;
    let panel=$('workspace-entry-error');
    if(!panel){panel=document.createElement('main');panel.id='workspace-entry-error';panel.className='business-setup-preview';document.body.append(panel);}
    panel.innerHTML=`<h1>We couldn’t check your setup</h1><p>${esc(err.message||'Check your connection and try again.')}</p><button type="button" class="button primary" id="retry-workspace-entry">Try again</button>`;
    $('retry-workspace-entry').addEventListener('click',()=>{panel.remove();initialize();});
    signalEntryReady(true);
  }
}
document.querySelector('.skip-link').addEventListener('click',e=>{e.preventDefault();$('workspace-main').focus();});
wireWorkspaceCustomizer({api:API,refresh,toast,getTrade:()=>state.ws?.account?.trade});
mountGuideAssistant({api:API,getSection:()=>state.route.id==='crew'?'crew':state.section,getBusiness:()=>({
  trade:state.ws?.account?.trade||'',
  category:state.ws?.account?.workspacePreferences?.category||'other',
  enabledModules:state.ws?.account?.workspacePreferences?.modules||[]
})});
$('sidebar').inert=innerWidth<=760;setNavigation();initializeJobsUI({API,refresh,getWorkspace:()=>state.ws,isReadOnly:readOnly,toast});initializeRemindersUI({API,refresh,getWorkspace:()=>state.ws,isReadOnly:readOnly,toast});initializeQuotesUI({API,refresh,getWorkspace:()=>state.ws,isReadOnly:readOnly,toast});initialize();
