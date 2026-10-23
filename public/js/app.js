import API from './api.js';
import {US_STATE_OPTIONS,US_TIME_ZONE_OPTIONS,businessLocalDate,formatUSPhone,validUsZip} from './us-market.js';
import {INDIA_STATE_OPTIONS,INDIAN_STATES,validGSTIN,validIndianState,validUpiVpa} from './india-market.js';
import {renderJobsPage,initializeJobsUI} from './jobs-page.js';
import {renderRemindersPage,initializeRemindersUI} from './reminders-page.js';
import {renderQuotesPage,initializeQuotesUI} from './quotes-page.js';
import { SECTIONS, STAGES, SOURCES, escapeHTML as esc, localDate, dateLabel, money, metrics, filteredRows, validateRecord, safeReviewURL, routeFromHash } from './workspace-model.js';

const $ = (id) => document.getElementById(id);
const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
const state = { ws:null, section:routeFromHash(location.hash), filters:{}, view:'list', editor:null, confirmation:null, pending:new Set() };
const kindKey = {lead:'leads',followup:'followUps',invoice:'invoices',review:'reviews'};
const singular = {leads:'lead',followups:'followup',invoices:'invoice',reviews:'review'};
const createCalls = {lead:API.createLead,followup:API.createFollowUp,invoice:API.createInvoice,review:API.createReviewRequest};
const updateCalls = {lead:API.updateLead,followup:API.updateFollowUp,invoice:API.updateInvoice,review:API.updateReview};
const deleteCalls = {lead:API.deleteLead,followup:API.deleteFollowUp,invoice:API.deleteInvoice,review:API.deleteReview};
const initialFilters = (kind) => ({query:'',status:kind === 'followups' ? 'Due' : 'All',source:'All'});
const currency = () => state.ws?.account.currency || 'USD';
const isIndia = () => state.ws?.account.country==='IN'&&currency()==='INR';
const currencyMismatch=()=>state.ws?.account.currency && !((state.ws.account.country==='US'&&currency()==='USD')||(isIndia()));
const readOnly = () => state.ws?.account.planStatus === 'expired' || currencyMismatch();
const trialNotice = () => currencyMismatch()
  ? '<div class="notice" role="status"><div><strong>Historical currency — read-only</strong><p>These amounts are preserved in their original currency. Export your records, then review options in <a href="#settings" data-nav="settings" style="text-decoration:underline;font-weight:600">Settings →</a> before creating new dollar invoices.</p></div></div>'
  : `<div class="notice" role="status"><div><strong>Your free trial has ended — read-only access</strong><p>Your business records are safe. You can view invoices, export data, and manage your subscription. <a href="#settings" data-nav="settings" style="text-decoration:underline;font-weight:600">View subscription options →</a></p></div></div>`;
const cash = (n) => money(n,currency());
// Zero represents no debt in any currency; keep an empty dashboard dollar-native
// without changing the denomination of stored legacy transactions.
const dashboardCash = (n) => money(n,Number(n)===0&&!isIndia()?'USD':currency());
const initials = (name) => String(name || 'C').trim().split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
const button = (text,action,extra='',style='primary') => `<button type="button" class="button ${style}" data-action="${action}" ${extra}>${text}</button>`;
const addButton = (kind,label) => button(icon('plus')+label,'new',`data-kind="${kind}"`);
const viewLink = (section,label='View all') => `<a class="text-button" href="#${section}" data-nav="${section}">${label} ${icon('arrow')}</a>`;
const badge = (status) => {
  const color = {New:'blue',Quoted:'purple',Booked:'blue',Done:'green',Paid:'green',Sent:'blue',Overdue:'orange','Not Asked':'orange',Reviewed:'green',Draft:'',Due:'orange',Upcoming:'blue',Requested:'blue'}[status] || '';
  return `<span class="badge ${color}">${esc(status==='Reviewed'?'Received':status)}</span>`;
};
const empty = (title,description,action='') => `<div class="empty-state"><span class="empty-icon">${icon('empty')}</span><h3>${esc(title)}</h3><p>${esc(description)}</p>${action}</div>`;
const panelHeader = (name,title,sub='',right='') => `<div class="panel-header"><div><div class="panel-title">${icon(name)}<h2>${title}</h2></div>${sub ? `<p class="panel-subtitle">${sub}</p>` : ''}</div>${right}</div>`;
const pageHeading = (title,description,action='',eyebrow='') => `<div class="page-heading"><div>${eyebrow?`<p class="eyebrow">${esc(eyebrow)}</p>`:''}<h1>${esc(title)}</h1><p class="page-description">${esc(description)}</p></div><div class="heading-actions">${action}</div></div>`;
const rowActions = (kind,id,label) => `<div class="table-actions"><button class="icon-button" data-action="edit" data-kind="${kind}" data-id="${esc(id)}" aria-label="Edit ${esc(label)}">${icon('edit')}</button><button class="icon-button" data-action="delete" data-kind="${kind}" data-id="${esc(id)}" aria-label="Delete ${esc(label)}">${icon('close')}</button></div>`;
function toast(message,error=false) {
  const el=document.createElement('div'); el.className='toast'+(error?' error':''); el.textContent=message; $('toast-region').append(el); setTimeout(()=>el.remove(),5000);
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
  try { state.ws=await API.getWorkspace(); renderChrome(); renderPage(); setSync('Up to date'); }
  catch(err) { setSync('Could not refresh'); throw err; }
}
function renderChrome() {
  const a=state.ws.account,m=metrics(state.ws);
  $('business-name').textContent=a.businessName||'Your business'; $('business-initial').textContent=initials(a.businessName||a.name).slice(0,1);
  $('user-avatar').textContent=initials(a.name); $('user-avatar').setAttribute('aria-label',`Account settings for ${a.name || 'your account'}`);
  $('plan-label').textContent=a.planStatus==='active'?'Cerium Pro':a.planStatus==='expired'?'Trial ended':`${a.trialDaysRemaining} days left in trial`;
  for(const [name,value] of Object.entries({leads:m.leads,followups:m.due,invoices:state.ws.invoices.filter(x=>x.status==='Overdue').length,reviews:m.reviews})) {
    const el=$('count-'+name);el.textContent=value;el.hidden=!value;
  }
}
function setNavigation() {
  const title=SECTIONS[state.section][0]; $('current-section').textContent=title; document.title=`${title} — CERIUM`;
  document.querySelectorAll('[data-nav]').forEach(a=>{if(a.dataset.nav===state.section)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
}
function navigate(section,focus=false) {
  state.section=SECTIONS[section]?section:'overview'; setNavigation();closeNavigation();if(state.ws)renderPage();$('workspace-main').scrollTop=0;
  if(focus)$('workspace-main').focus({preventScroll:true});
}
function taskRow(f) {
  const today=businessLocalDate(state.ws?.account?.timeZone);
  const status=f.done?'Done':f.dueDate<today?'Overdue':f.dueDate===today?'Due':dateLabel(f.dueDate);
  return `<div class="task-row"><button class="task-check ${f.done?'completed':''}" data-action="toggle-followup" data-id="${esc(f.id)}" aria-label="${f.done?'Reopen':'Complete'} follow-up for ${esc(f.contactName)}">${f.done?icon('check'):''}</button><div class="row-details"><span class="row-title">${esc(f.contactName)}</span><span class="row-meta">${esc(f.task)} · ${esc(f.channel)}</span></div><div class="row-end">${badge(status)}</div></div>`;
}
function invoiceRow(i) {
  return `<div class="task-row"><span class="mini-avatar lavender">${esc(initials(i.customerName))}</span><div class="row-details"><span class="row-title">${esc(i.customerName)}</span><span class="row-meta">#${esc(i.id)} · Due ${dateLabel(i.dueDate)}</span></div><div class="row-end"><div><span class="amount">${cash(i.total)}</span><div style="margin-top:4px;text-align:right">${badge(i.status)}</div></div><button class="icon-button" data-action="preview-invoice" data-id="${esc(i.id)}" aria-label="Preview invoice ${esc(i.id)}">${icon('chevron')}</button></div></div>`;
}
function overview() {
  const ws=state.ws,m=metrics(ws),tz=ws.account.timeZone,now=new Date();
  const hour=tz?Number(new Intl.DateTimeFormat('en-US',{timeZone:tz,hour:'numeric',hourCycle:'h23'}).format(now)):now.getHours();
  const first=ws.account.name.trim().split(/\s+/)[0]||'there';
  const title=`Good ${hour<12?'morning':hour<18?'afternoon':'evening'}, ${first}.`;
  const day=now.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',...(tz?{timeZone:tz}:{})});
  const tasks=filteredRows('followups',ws,{status:'Due'}),invoices=ws.invoices.filter(x=>['Sent','Overdue'].includes(x.status)).sort((a,b)=>a.dueDate.localeCompare(b.dueDate));
  const leads=ws.leads.slice(0,3),reviews=ws.reviews.filter(x=>x.status!=='Reviewed').slice(0,3);
  const metric=(label,value,foot,nav,ic,warn=false)=>`<a href="#${nav}" data-nav="${nav}" class="metric ${warn?'warning':''}"><div class="metric-top"><span>${label}</span>${icon(ic)}</div><strong class="metric-value">${value}</strong><span class="metric-foot"><i class="dot"></i>${foot}</span></a>`;
  return pageHeading(title,`Here's what needs your attention today.`,addButton('lead','New lead'),day)+
    (!currencyMismatch()?'':'<div class="notice" role="status"><div><strong>Previous currency records</strong><p>Your workspace still contains earlier amounts in '+esc(ws.account.currency)+'. They are preserved as originally recorded; see Settings before creating new dollar invoices.</p></div></div>')+
    `<div class="metrics-grid">${metric('Active leads',m.leads,'New and quoted inquiries','leads','leads')}${metric('Follow-ups due',m.due,'Ready for your next call','followups','followups')}${metric('Outstanding',dashboardCash(m.outstanding),'Across unpaid invoices','invoices','invoices')}${metric('Overdue',dashboardCash(m.overdue),'Payments past their due date','invoices','payments',true)}</div>`+
    `<div class="dashboard-grid"><section class="panel">${panelHeader('followups','Today’s follow-ups',tasks.length?`${tasks.length} ${tasks.length===1?'customer needs':'customers need'} a check-in`:'Your next conversations, in one place',viewLink('followups'))}<div class="panel-body">${tasks.length?tasks.slice(0,4).map(taskRow).join(''):empty('You’re all caught up','Add a follow-up when a customer needs a call or message.',button('Add follow-up','new','data-kind="followup"','secondary'))}</div><div class="panel-footer"><span>${tasks.length>4?`Showing 4 of ${tasks.length} due`:'A small follow-up can make a big difference.'}</span>${button(icon('plus')+'Add','new','data-kind="followup"','secondary')}</div></section>`+
    `<section class="panel">${panelHeader('invoices','Awaiting payment','A clear view of what’s coming in',viewLink('invoices'))}<div class="panel-body">${invoices.length?invoices.slice(0,3).map(invoiceRow).join(''):empty('No outstanding invoices','Create your next invoice when a job is ready to bill.',button('Create invoice','new','data-kind="invoice"','secondary'))}</div><div class="panel-footer"><span>${invoices.length} open ${invoices.length===1?'invoice':'invoices'}</span><strong class="amount">${cash(m.outstanding)}</strong></div></section>`+
    `<section class="panel">${panelHeader('leads','Your pipeline','From first inquiry to a finished job',viewLink('leads'))}<div class="pipeline-strip">${STAGES.map(s=>`<div class="stage-item"><div class="stage-line"></div><strong>${ws.leads.filter(l=>l.stage===s).length}</strong>${s}</div>`).join('')}</div><div class="panel-body">${leads.length?leads.map(l=>`<div class="task-row"><span class="mini-avatar">${esc(initials(l.name))}</span><div class="row-details"><span class="row-title">${esc(l.name)}</span><span class="row-meta">${esc(l.source)}${l.notes?' · '+esc(l.notes.slice(0,40)):''}</span></div>${badge(l.stage)}<button class="text-button" data-action="new-quote" data-id="${esc(l.id)}" aria-label="Create quote for ${esc(l.name)}">Quote ↗</button><button class="icon-button" data-action="edit" data-kind="lead" data-id="${esc(l.id)}" aria-label="Edit ${esc(l.name)}">${icon('chevron')}</button></div>`).join(''):empty('Make room for your next customer','Every inquiry starts with a new lead.')}</div></section>`+
    `<section class="panel">${panelHeader('reviews','Close the loop','Keep your good work working for you',viewLink('reviews'))}<div class="panel-body">${reviews.length?reviews.map(r=>`<div class="task-row"><span class="mini-avatar lavender">${icon('reviews')}</span><div class="row-details"><span class="row-title">${esc(r.customerName)}</span><span class="row-meta">${esc(r.jobTitle)}</span></div>${badge(r.status==='Sent'?'Requested':r.status)}</div>`).join(''):empty('Good work deserves a good review','Track review requests after you finish a job.')}</div><div class="panel-footer"><span>${m.reviews} waiting for a request</span>${viewLink('reviews','Manage reviews')}</div></section></div><p class="page-note">${icon('check')}A little less admin. A little more room to work.</p>`;
}
function toolbar(kind) {
  const f=state.filters[kind] ||= initialFilters(kind);
  const statuses={leads:['All',...STAGES],followups:['Due','Upcoming','Done','All'],invoices:['All','Draft','Sent','Overdue','Paid'],reviews:['All','Not Asked','Sent','Reviewed']}[kind];
  return `<div class="toolbar"><label class="search-field">${icon('search')}<input type="search" data-filter="query" value="${esc(f.query)}" placeholder="Search ${SECTIONS[kind][0].toLowerCase()}…" aria-label="Search ${SECTIONS[kind][0].toLowerCase()}"></label><select data-filter="status" aria-label="Filter ${SECTIONS[kind][0].toLowerCase()} by status">${statuses.map(s=>`<option value="${s}" ${s===f.status?'selected':''}>${s==='All'?'All statuses':s==='Sent'&&kind==='reviews'?'Requested':s==='Reviewed'?'Received':s}</option>`).join('')}</select>${kind==='leads'?`<select data-filter="source" aria-label="Filter leads by source">${['All',...SOURCES].map(s=>`<option value="${s}" ${s===f.source?'selected':''}>${s==='All'?'All sources':s}</option>`).join('')}</select><div class="view-toggle" aria-label="Lead view"><button data-action="lead-view" data-view="list" aria-pressed="${state.view==='list'}">List</button><button data-action="lead-view" data-view="board" aria-pressed="${state.view==='board'}">Board</button></div>`:''}</div>`;
}
function listPage(kind) {
  const labels={leads:'New lead',followups:'Add follow-up',invoices:'Create invoice',reviews:'Log request'};
  const notice=kind==='reviews'?`<div class="notice">${icon('reviews')}<div><strong>A personal request goes a long way.</strong>Copy your review request, send it through your email or messaging app, then mark it as requested. ${viewLink('settings','Set your review link')}</div></div>`:'';
  return pageHeading(...SECTIONS[kind],addButton(singular[kind],labels[kind]))+notice+`<section class="panel">${toolbar(kind)}<div id="results"></div></section>`;
}
function table(head,rows) {return `<div class="table-scroll" tabindex="0" aria-label="Scrollable records table"><table class="data-table"><thead><tr>${head.map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;}
function renderResults() {
  const kind=state.section,holder=$('results');if(!holder)return;
  const rows=filteredRows(kind,state.ws,state.filters[kind]);
  if(!rows.length) {holder.innerHTML=empty('No '+SECTIONS[kind][0].toLowerCase()+' to show','Try a different filter or add your first record.');return;}
  if(kind==='leads'&&state.view==='board') {
    holder.innerHTML=`<div class="board" tabindex="0" aria-label="Scrollable lead board">${STAGES.map(stage=>`<div class="board-column"><div class="board-title">${stage}<span>${rows.filter(l=>l.stage===stage).length}</span></div>${rows.filter(l=>l.stage===stage).map(l=>`<article class="lead-card"><span class="row-title">${esc(l.name)}</span><span class="row-meta">${esc(l.source)}</span><div class="lead-card-bottom"><strong class="amount">${cash(l.value)}</strong><button class="icon-button" data-action="edit" data-kind="lead" data-id="${esc(l.id)}" aria-label="Edit ${esc(l.name)}">${icon('edit')}</button></div></article>`).join('')}</div>`).join('')}</div>`;
  } else if(kind==='leads') {
    holder.innerHTML=table(['Customer','Source','Stage','Value','Next follow-up','Actions'],rows.map(l=>`<tr><td><div class="person">${esc(l.name)}</div><div class="subline">${esc(l.email||l.phone||l.address||'No contact details')}</div></td><td>${esc(l.source)}</td><td>${badge(l.stage)}</td><td class="amount">${cash(l.value)}</td><td>${dateLabel(l.nextFollowUp)}</td><td>${button('Quote ↗','new-quote',`data-id="${esc(l.id)}"`,'secondary')}${rowActions('lead',l.id,l.name)}</td></tr>`));
  } else if(kind==='followups') {
    holder.innerHTML=table(['Task','Customer','Due','Channel','Status','Actions'],rows.map(f=>`<tr><td><div class="person">${esc(f.task)}</div></td><td>${esc(f.contactName)}<div class="subline">${esc(f.phone)}</div></td><td>${dateLabel(f.dueDate)}</td><td>${esc(f.channel)}</td><td><button class="button secondary" data-action="toggle-followup" data-id="${esc(f.id)}">${f.done?icon('check')+'Done':'Mark done'}</button></td><td>${rowActions('followup',f.id,f.contactName)}</td></tr>`));
  } else if(kind==='invoices') {
    holder.innerHTML=table(['Invoice','Customer','Job','Due date','Total','Status','Actions'],rows.map(i=>`<tr><td><button class="text-button" data-action="preview-invoice" data-id="${esc(i.id)}">#${esc(i.id)}</button><div class="subline">${esc(i.jobTitle)}</div></td><td><div class="person">${esc(i.customerName)}</div></td><td>${i.jobId?`<a href="#jobs" data-nav="jobs" class="text-button" title="From completed job">From job ↗</a>`:'—'}</td><td>${dateLabel(i.dueDate)}</td><td class="amount">${cash(i.total)}</td><td><select class="small-select" data-invoice-status="${esc(i.id)}" aria-label="Status of invoice ${esc(i.id)}">${['Draft','Sent','Overdue','Paid'].map(s=>`<option ${i.status===s?'selected':''}>${s}</option>`).join('')}</select></td><td>${rowActions('invoice',i.id,'invoice '+i.id)}</td></tr>`));
  } else if(kind==='reviews') {
    holder.innerHTML=table(['Customer','Job','Status','Request','Actions'],rows.map(r=>`<tr><td><div class="person">${esc(r.customerName)}</div><div class="subline">${esc(r.customerEmail||r.customerPhone)}</div></td><td>${esc(r.jobTitle)}</td><td>${badge(r.status==='Sent'?'Requested':r.status)}</td><td><div class="table-actions">${button('Copy request','copy-review',`data-id="${esc(r.id)}"`,'secondary')}${r.status==='Not Asked'?button('Mark requested','mark-requested',`data-id="${esc(r.id)}"`,'secondary'):r.status!=='Reviewed'?button('Mark received','review-received',`data-id="${esc(r.id)}"`,'secondary'):''}</div></td><td>${rowActions('review',r.id,r.customerName)}</td></tr>`));
  }
  holder.insertAdjacentHTML('beforeend',`<div class="result-footer"><span>${rows.length} ${rows.length===1?'record':'records'}</span><span>Changes are saved to your workspace</span></div>`);
}
function paymentsPage() {
  const paid=state.ws.invoices.filter(i=>i.status==='Paid'),tx=state.ws.bankTransactions.filter(t=>t.status==='pending_match');
  return pageHeading(...SECTIONS.payments,viewLink('invoices','View invoices'))+`<div class="notice">${icon('payments')}<div><strong>Payment records, in one place</strong>Mark an invoice as paid after you receive the payment. A live bank feed is not connected in this version.</div></div>`+
  (tx.length?`<section class="panel" style="margin-bottom:22px">${panelHeader('payments','Recorded deposits','Review these before marking an invoice as paid')}<div class="panel-body">${tx.map(t=>`<div class="task-row"><div class="row-details"><span class="row-title">${esc(t.description)}</span><span class="row-meta">${dateLabel(t.date)} · ${cash(t.amount)}</span></div>${t.suggestedInvoiceId?button('Match #'+esc(t.suggestedInvoiceId),'match-payment',`data-id="${esc(t.id)}" data-invoice="${esc(t.suggestedInvoiceId)}"`,'secondary'):badge('No suggested match')}${button('Dismiss','dismiss-payment',`data-id="${esc(t.id)}"`,'secondary')}</div>`).join('')}</div></section>`:'')+
  `<section class="panel">${panelHeader('payments','Paid invoices',`${paid.length} paid · ${cash(metrics(state.ws).paid)} total`)}${paid.length?table(['Invoice','Customer','Paid on','Amount'],paid.map(i=>`<tr><td><button class="text-button" data-action="preview-invoice" data-id="${esc(i.id)}">#${esc(i.id)}</button></td><td><div class="person">${esc(i.customerName)}</div></td><td>${dateLabel(i.paidAt)}</td><td class="amount">${cash(i.total)}</td></tr>`)):empty('No payments recorded yet','Your paid invoices will appear here.')}</section>`;
}
function field(name,label,value='',type='text',options={}) {
  const {required=false,full=false,choices=null,readOnly=false,placeholder='',max=200,min,step}=options;
  const attrs=`name="${name}" id="field-${name}" ${required?'required':''} ${readOnly?'readonly':''} maxlength="${max}" placeholder="${esc(placeholder)}"`;
  let input=choices?`<select ${attrs}>${choices.map(x=>{const option=typeof x==='string'?{value:x,label:x}:x;return `<option value="${esc(option.value)}" ${String(value)===String(option.value)?'selected':''}>${esc(option.label)}</option>`;}).join('')}</select>`:type==='textarea'?`<textarea ${attrs} rows="3">${esc(value)}</textarea>`:`<input type="${type}" ${attrs} value="${esc(value)}" ${min!==undefined?`min="${min}"`:''} ${step?`step="${step}"`:''}>`;
  return `<label class="field ${full?'full-width':''}" for="field-${name}">${label}${required?' <span class="sr-only">(required)</span>':''}${input}</label>`;
}
function settingsPage() {
  const a=state.ws.account,ind=isIndia();
  const legacy=currencyMismatch()?'<p class="muted" role="alert">Existing amounts are stored in '+esc(a.currency)+'. We will not relabel them. Export valuable history and ask support about migration. Disposable demos may be cleared with confirmation.</p>':'';
  const tzHelp=a.timeZone?'Appointments use '+(US_TIME_ZONE_OPTIONS.find(x=>x.value===a.timeZone)?.label||'your business time zone')+'.':'Set your business time zone so crews see the correct local appointment times.';
  const regionFields=ind
    ?field('indiaState','GST registration state',a.indiaState||'','text',{choices:[{value:'',label:'Select state / UT'},...INDIA_STATE_OPTIONS],full:true})
      +field('gstin','Business GSTIN (only if registered)',a.gstin||'','text',{max:15,placeholder:'15-character GSTIN',full:true})
      +field('upiVpa','UPI ID for customer invoice payments',a.upiVpa||'','text',{max:194,placeholder:'business@bank',full:true})
      +'<p class="muted full-width">UPI ID is displayed as payment instructions, not a verified collection or bank integration. GST fields are invoice drafts only; IRN/e-invoicing and GST filing are not connected.</p>'
    :field('usState','State',a.usState||'','text',{choices:[{value:'',label:'Choose a state'},...US_STATE_OPTIONS]})
      +field('usZip','ZIP code',a.usZip||'','text',{placeholder:'78701 or 78701-1234',max:10})
      +field('timeZone','Business time zone',a.timeZone||'','text',{choices:[{value:'',label:'Choose time zone'},...US_TIME_ZONE_OPTIONS],full:true})
      +'<p class="muted full-width">'+esc(tzHelp)+'</p>';
  const countryChoices=[{value:'US',label:'United States — USD'},{value:'IN',label:'India — INR'}];
  const moneyPrice=ind?'₹500':'$20';
  return pageHeading(...SECTIONS.settings)+`<div class="settings-grid"><section class="panel">${panelHeader('settings','Business profile','The details used across your workspace')}
  <form id="profile-form" class="settings-content"><div class="form-grid">
    ${field('name','Your name',a.name,'text',{required:true})}
    ${field('businessName','Business name',a.businessName)}
    ${field('email','Sign-in email',a.email,'email',{readOnly:true})}
    ${field('country','Edition / country',a.country||'US','text',{choices:countryChoices,full:true})}
    <p class="muted full-width">Changing editions is allowed only before adding business records or subscription history. Existing money is never converted.</p>
    ${field('phone','Business phone',ind?a.phone:formatUSPhone(a.phone),'tel',{placeholder:ind?'+91 98765 43210':'(415) 555-0123'})}
    ${field('trade','Trade / industry',a.trade)}
    ${field('location','City / service area',a.location,'text',{placeholder:ind?'e.g. Chennai':'e.g. Austin'})}
    ${regionFields}
    <p class="muted full-width">Currency: ${esc(a.currency)}. ${legacy}</p>
    ${field('googlePlaceUrl','Google review link',a.googlePlaceUrl,'url',{full:true,placeholder:'Paste HTTPS review link',max:350})}
  </div><p id="profile-error" class="form-error" role="alert" hidden></p>
  <div class="settings-actions"><button type="submit" class="button primary">Save changes</button></div></form>
  </section><div class="settings-stack"><section class="panel">
  ${panelHeader('payments','Your plan',a.planStatus==='active'?'Cerium Pro is active':a.subscription?.status==='authenticated'?'Automatic billing authorized':a.planStatus==='expired'?'Your free trial has ended':`${a.trialDaysRemaining} days remaining in your free trial`)}
  <div class="settings-content"><p class="eyebrow">CERIUM PRO — ${ind?'INDIA':'US'} EDITION</p>
    <p class="plan-price">${moneyPrice}<small> / month</small></p>
    <p class="muted">Leads, estimates, jobs, invoicing and follow-ups. The price excludes any applicable tax.</p>
    ${!currencyMismatch()&&a.planStatus!=='active'&&!['authenticated','active','pending'].includes(a.subscription?.status)?`<div class="settings-actions">${button('Authorize monthly billing','upgrade')}</div>`:''}
    ${a.subscription&&['authenticated','active','pending'].includes(a.subscription.status)?`<p class="muted">Recurring billing ${esc(a.subscription.status)}. Cancel future payments anytime.</p><div class="settings-actions">${button('Cancel subscription','cancel-subscription','','secondary')}</div>`:''}
    <p class="muted">${ind?'INR recurring checkout requires an enabled Razorpay INR plan and customer-approved UPI Autopay/card mandate.':'USD checkout requires an enabled US plan.'}</p>
  </div></section><section class="panel">
    ${panelHeader('download','Your data','Take a copy whenever you need it')}
    <div class="settings-content"><p class="muted">Export your profile and workspace records as JSON.</p>
    <div class="settings-actions">${button(icon('download')+'Export data','export','','secondary')}</div></div></section>
    <section class="panel danger-panel">${panelHeader('settings','Data controls')}
    <div class="settings-content"><p class="muted">These actions permanently remove data. You’ll be asked to confirm.</p>
    <div class="danger-actions"><button class="danger-text" data-action="clear-data">Clear workspace</button><button class="danger-text" data-action="delete-account">Delete account</button></div></div></section>
  </div></div>`;
}

function supportPage() {
  return pageHeading(...SECTIONS.support)+`<div class="settings-grid"><section class="panel">${panelHeader('support','Write to us','We’d like to hear what would make your work easier.')}<form class="settings-content" id="support-form"><div class="form-grid">${field('category','Topic','Product question','text',{choices:['Product question','Bug report','Suggestion','Service / billing question','Other'],full:true})}${field('subject','Subject','','text',{required:true,full:true,max:100})}${field('body','Message','','textarea',{required:true,full:true,max:700})}</div><p class="muted" style="margin-top:16px">This opens a draft in your email app. You choose when to send it.</p><p id="support-error" class="form-error" role="alert" hidden></p><div class="settings-actions"><button class="button primary" type="submit">Open email draft</button></div></form></section><section class="panel">${panelHeader('support','Keep in touch')}<div class="settings-content"><p class="muted">Questions, problems, or something you wish Cerium did better?</p><a class="support-email" href="mailto:cerium.founders@gmail.com">cerium.founders@gmail.com</a><p class="eyebrow" style="margin-top:22px">SAVED DRAFTS</p>${state.ws.messages.length?state.ws.messages.slice(0,5).map(m=>`<div class="message-row"><h3>${esc(m.subject)}</h3><span class="row-meta">${esc(m.category)} · ${dateLabel(m.createdAt)}</span><p>${esc(m.body.slice(0,140))}</p></div>`).join(''):'<p class="muted">Your recent messages will appear here.</p>'}</div></section></div>`;
}
function renderPage() {
  $('load-state').hidden=true; $('page-body').hidden=false;setNavigation();
  const s=state.section;
  $('page-body').innerHTML=(readOnly()?trialNotice():'')+(s==='overview'?overview():s==='jobs'?renderJobsPage(state.ws,readOnly()):s==='quotes'?renderQuotesPage(state.ws,readOnly()):s==='reminders'?renderRemindersPage(state.ws,readOnly()):singular[s]?listPage(s):s==='payments'?paymentsPage():s==='settings'?settingsPage():supportPage());
  if(singular[s])renderResults();
  if(readOnly()) {
    $('page-body').querySelectorAll('[data-action="new"],[data-action="edit"],[data-action="delete"],[data-action="toggle-followup"],[data-action="mark-requested"],[data-action="review-received"],[data-action="match-payment"],[data-action="dismiss-payment"],[data-invoice-status]').forEach(control=>{
      control.disabled=true;
      control.setAttribute('aria-disabled','true');
      control.title='Trial ended — activate Cerium Pro to edit business records';
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
  const v=record||{};let html='';
  if(kind==='lead')html=field('name','Customer name',v.name,'text',{required:true,full:true})+field('email','Email',v.email,'email')+field('phone','Phone',formatUSPhone(v.phone),'tel',{placeholder:'(415) 555-0123'})+field('stage','Stage',v.stage||'New','text',{choices:STAGES})+field('source','Source',v.source||'Direct','text',{choices:[...new Set([...SOURCES,v.source].filter(Boolean))]})+field('value',`Estimated value (${currency()})`,v.value||'','number',{min:0,step:'.01'})+field('nextFollowUp','Next follow-up',v.nextFollowUp||localDate(),'date')+field('address','Service address',v.address,'text',{full:true,placeholder:'Street, city, state, ZIP'})+field('notes','Notes',v.notes,'textarea',{full:true,max:350})+(record?'':'<label class="check-field"><input type="checkbox" name="createReminder" checked>Create a follow-up reminder</label>');
  if(kind==='followup')html=field('contactName','Customer name',v.contactName,'text',{required:true,full:true})+field('task','What needs to happen?',v.task,'text',{required:true,full:true,max:250})+field('dueDate','Due date',v.dueDate||localDate(),'date',{required:true})+field('channel','Contact method',v.channel||'Call','text',{choices:['Call','Text','Email']})+field('phone','US phone',formatUSPhone(v.phone),'tel',{full:true,placeholder:'(415) 555-0123'});
  if(kind==='invoice')html=field('customerName','Customer name',v.customerName,'text',{required:true,full:true})+field('customerEmail','Email',v.customerEmail,'email')+field('customerAddress','Billing address',v.customerAddress,'text',{placeholder:'Street, city, state, ZIP'})+field('jobTitle','Work / description',v.jobTitle,'text',{required:true,full:true})+field('amount',`Amount before tax (${currency()})`,isIndia()?((Number(v.taxable)>0?v.taxable:(v.total??''))):(v.total??''),'number',{required:!v.jobId,min:v.jobId?0:'.01',step:'.01',readOnly:!!v.jobId||!!(v.items?.length>1)})+field('terms','Payment terms',v.terms||'Net 15','text',{choices:['Due on receipt','Net 7','Net 15','Net 30']})+field('status','Status',v.status||'Draft','text',{choices:['Draft','Sent','Overdue','Paid'],full:true})+field('notes','Notes',v.notes,'textarea',{full:true,max:350})+(v.items?.length>1&&!v.jobId?'<p class="muted">This invoice has multiple line items. The existing item totals are preserved.</p>':'')+(isIndia()?field('customerGstin','Customer GSTIN (if registered)',v.customerGstin||'','text',{max:15,full:true})+field('placeOfSupply','Place of supply',v.placeOfSupply||state.ws.account.indiaState||'','text',{choices:[{value:'',label:'Select state / UT'},...INDIA_STATE_OPTIONS]})+field('hsnSac','HSN / SAC (4–8 digits)',v.hsnSac||'','text',{max:8})+field('gstRate','Applicable GST rate (%)',v.gstRate??0,'number',{min:0,step:'.01'})+'<p class="muted full-width">Tax rate and HSN/SAC must be confirmed against the actual supply. All items currently share one tax code/rate; complex invoices need accountant review.</p>':'');
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
  const address=ind?[a.location,INDIAN_STATES[i.supplierState||a.indiaState]||''].filter(Boolean).join(', '):
    [a.location,[a.usState,a.usZip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const fmt=n=>money(n,i.currency||currency());
  const gst=ind&&Boolean(i.supplierGstin);
  const taxLines=gst?`<div class="invoice-tax-summary">
    <p><strong>Taxable amount</strong> ${fmt(i.taxable)}</p>
    ${i.cgst?`<p>CGST ${fmt(i.cgst)}</p>`:''}
    ${i.sgst?`<p>SGST ${fmt(i.sgst)}</p>`:''}
    ${i.utgst?`<p>UTGST ${fmt(i.utgst)}</p>`:''}
    ${i.igst?`<p>IGST ${fmt(i.igst)}</p>`:''}
    <p>GST rate: ${esc(i.gstRate)}%</p></div>`:'';
  const invoiceTitle=gst?'DRAFT GST TAX INVOICE':'INVOICE';
  $('invoice-sheet').innerHTML=`<article class="invoice-document">
    <div class="invoice-top"><div><h2>${esc(a.businessName||a.name)}</h2>
      <p>${esc(address)}<br>${esc(a.email)}${a.phone?'<br>'+esc(ind?a.phone:formatUSPhone(a.phone)):''}
      ${gst?'<br>GSTIN: '+esc(i.supplierGstin):''}</p></div>
      <div><p class="eyebrow">${invoiceTitle} #${esc(i.id)}</p>${badge(i.status)}</div></div>
    <div class="invoice-info"><div><small>Billed to</small><strong>${esc(i.customerName)}</strong>
      <p>${esc(i.customerAddress||i.customerEmail)}</p>${i.customerGstin?'<p>Customer GSTIN: '+esc(i.customerGstin)+'</p>':''}</div>
      <div><small>Issued</small>${dateLabel(i.issueDate)}<p>${esc(i.terms)}</p></div>
      <div><small>Due</small>${dateLabel(i.dueDate)}</div></div>
    ${gst?`<p class="muted">Place of supply: ${esc(INDIAN_STATES[i.placeOfSupply]||i.placeOfSupply)} (${esc(i.placeOfSupply)}) · HSN/SAC: ${esc(i.hsnSac)}</p>`:''}
    ${table(['Description','Quantity','Rate','Amount'],i.items.map(item=>`<tr><td>${esc(item.description)}</td><td>${esc(item.qty)}</td><td>${fmt(item.rate)}</td><td>${fmt(Number(item.qty)*Number(item.rate))}</td></tr>`))}
    ${taxLines}
    <div class="invoice-total"><span>Total</span><span>${fmt(i.total)}</span></div>
    ${ind&&i.upiVpa?`<p class="muted">Pay by UPI to: <strong>${esc(i.upiVpa)}</strong>. Confirm receipt in your bank before marking Paid.</p>`:''}
    ${gst?'<p class="muted">Draft only. Validate invoice numbering, tax classification, signature, reverse charge, IRN/e-invoicing eligibility and other statutory requirements before issuing.</p>':''}
    <p class="muted">${esc(i.notes)}</p>
  </article>`; $('invoice-dialog').showModal();
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
$('menu-toggle').addEventListener('click',openNavigation);$('nav-backdrop').addEventListener('click',closeNavigation);
window.addEventListener('resize',()=>{if(innerWidth>760||!$('sidebar').classList.contains('is-open'))closeNavigation();});
window.addEventListener('hashchange',()=>navigate(routeFromHash(location.hash),true));
document.addEventListener('cerium:open-invoice',e=>{
  if(!state.ws)return;
  location.hash='#invoices';
  navigate('invoices');
  previewInvoice(e.detail?.id);
});
document.addEventListener('keydown',e=>{
  if(!$('sidebar').classList.contains('is-open'))return;
  if(e.key==='Escape'){e.preventDefault();closeNavigation();}
  if(e.key==='Tab'){const items=[...$('sidebar').querySelectorAll('a,button')].filter(x=>!x.disabled),first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
});
document.addEventListener('click',e=>{
  const nav=e.target.closest('[data-nav]');if(nav){closeNavigation();if(nav.dataset.nav===state.section){e.preventDefault();$('workspace-main').scrollTop=0;}return;}
  const el=e.target.closest('[data-action]');if(!el)return;const {action,id,kind}=el.dataset;
  if(action==='close-dialog'){if(!el.closest('dialog').hasAttribute('aria-busy'))el.closest('dialog').close();return;}
  if(action==='refresh'){perform('refresh',el,async()=>{if(state.ws)await refresh();else await initialize();});return;}
  if(!state.ws)return;
  if(readOnly() && ['new','edit','delete','new-quote','toggle-followup','mark-requested','review-received','match-payment','dismiss-payment'].includes(action)){toast('Your trial has ended. Upgrade in Settings to make changes.',true);return;}
  if(action==='new-quote'){
    location.hash='#quotes';navigate('quotes');
    document.dispatchEvent(new CustomEvent('cerium:new-quote',{detail:{leadId:id}}));
    return;
  }
  if(action==='new'||action==='edit'){openRecord(kind,action==='edit'?id:null);return;}
  if(action==='lead-view'){state.view=el.dataset.view;document.querySelectorAll('[data-action=lead-view]').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.view===state.view)));renderResults();return;}
  if(action==='preview-invoice'){previewInvoice(id);return;}
  if(action==='print-invoice'){window.print();return;}
  if(action==='delete'){
    const r=getRecord(kind,id);if(!r)return;requestConfirmation('Delete '+(kind==='followup'?'follow-up':kind)+'?',`This permanently removes ${r.name||r.contactName||r.customerName||'this record'}. This cannot be undone.`,async()=>{await deleteCalls[kind](id);await refresh();toast('Record deleted.');});return;
  }
  if(action==='clear-data'||action==='delete-account'){
    requestConfirmation(action==='clear-data'?'Clear your workspace?':'Delete your account?',action==='clear-data'?'This permanently deletes leads, quotes, scheduled jobs, invoices, reminders, reviews, and other workspace records. Your account and payment history remain. If safe, an older INR demo workspace will start fresh in USD. Export anything you need first.':'This permanently deletes your account and all its records. Export your data first if you need a copy.',async()=>{if(action==='clear-data'){await API.deleteWorkspaceData();await refresh();toast('Workspace cleared.');}else{await API.deleteAccount();location.href='/';}},true);return;
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
    else if(action==='upgrade'){await window.CeriumBilling.startSubscriptionCheckout({onComplete:()=>perform('billing-refresh',null,async()=>{await refresh();toast('Subscription authorized. Your trial continues until its end date.');}),onError:err=>toast(err.message,true)});}
    else if(action==='cancel-subscription'){requestConfirmation('Cancel recurring payments?','Your recurring subscription will be cancelled. You can still export your records.',async()=>{await API.cancelRecurringSubscription();await refresh();toast('Subscription cancellation requested.');});}
  });
});
document.addEventListener('input',e=>{if(e.target.dataset.filter==='query'){(state.filters[state.section]||={}).query=e.target.value;renderResults();}});
document.addEventListener('change',e=>{
  const key=e.target.dataset.filter;if(key&&key!=='query'){state.filters[state.section][key]=e.target.value;renderResults();}
  const id=e.target.dataset.invoiceStatus;if(id && readOnly()){toast('Your trial has ended. Invoice changes are unavailable.',true);return;}if(id){const old=getRecord('invoice',id)?.status;perform('invoice-status:'+id,e.target,async()=>{try{await API.updateInvoiceStatus(id,e.target.value);await refresh();toast('Invoice status updated.');}catch(err){e.target.value=old;throw err;}});}
});
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('cancel',e=>{if(d.hasAttribute('aria-busy'))e.preventDefault();}));
$('record-form').addEventListener('submit',e=>{
  e.preventDefault();if(readOnly()){toast('Your trial has ended. Business records are read-only.',true);return;}const {kind,id}=state.editor,form=e.currentTarget,values=Object.fromEntries(new FormData(form));Object.keys(values).forEach(k=>{values[k]=String(values[k]).trim();});
  const isJobInvoice=kind==='invoice'&&id&&Boolean(getRecord(kind,id)?.jobId);
  if(isJobInvoice){
    values.items=[...form.querySelectorAll('[data-invoice-line]')].map(row=>{
      const get=key=>row.querySelector('[data-invoice-line-field="'+key+'"]').value.trim();
      return {description:get('description'),qty:Number(get('qty')),rate:Number(get('rate'))};
    });
    values.amount=String(Math.round(values.items.reduce((sum,item)=>sum+item.qty*item.rate,0)*100)/100);
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
  if(e.target.id==='profile-form'){
    e.preventDefault();const data=Object.fromEntries(new FormData(e.target));delete data.email;
    if(data.country==='US'&&!validUsZip(data.usZip||'')){formError('profile-error','Enter a ZIP code (12345 or 12345-6789).');return;}
    if(data.country==='IN'&&(!validGSTIN(data.gstin||'')||!validIndianState(data.indiaState||'')||!validUpiVpa(data.upiVpa||''))){formError('profile-error','Check your GSTIN, state and UPI ID.');return;}
    if(data.googlePlaceUrl&&!safeReviewURL(data.googlePlaceUrl)){formError('profile-error','Use a valid HTTPS link for review requests.');return;}
    perform('profile',e.submitter,async()=>{await API.updateAccount(data);await refresh();toast('Business profile saved.');},'profile-error');
  }
  if(e.target.id==='support-form'){
    e.preventDefault();const data=Object.fromEntries(new FormData(e.target));
    perform('support',e.submitter,async()=>{await API.createMessage({...data,replyTo:state.ws.account.email,via:'Email draft'});const subject=`[Cerium · ${data.category}] ${data.subject}`;const body=`${data.body}\n\n${state.ws.account.name}\n${state.ws.account.email}`;await refresh();location.href='mailto:cerium.founders@gmail.com?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body);toast('Draft opened in your email app. Send it there when ready.');},'support-error');
  }
});
async function initialize() {
  $('load-state').hidden=false;$('page-body').hidden=true;
  try {const me=await API.getMe();if(!me.signedIn){location.href='/login.html?returnTo='+encodeURIComponent('/app.html'+location.hash);return;}await refresh();}
  catch(err){setSync('Connection issue');$('load-state').hidden=true;$('page-body').hidden=false;$('page-body').innerHTML=`<div class="error-state"><h2>We couldn’t load your workspace</h2><p>${esc(err.message||'Check your connection and try again.')}</p>${button('Try again','refresh')}</div>`;}
}
document.querySelector('.skip-link').addEventListener('click',e=>{e.preventDefault();$('workspace-main').focus();});
$('sidebar').inert=innerWidth<=760;setNavigation();initializeJobsUI({API,refresh,getWorkspace:()=>state.ws,isReadOnly:readOnly,toast});initializeRemindersUI({API,refresh,getWorkspace:()=>state.ws,isReadOnly:readOnly,toast});initializeQuotesUI({API,refresh,getWorkspace:()=>state.ws,isReadOnly:readOnly,toast});initialize();
