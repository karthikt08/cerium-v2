// Descriptive summaries of saved records, never forecasts or attributed revenue.
import {escapeHTML as esc,money} from './workspace-model.js';
import {WORKSPACE_MODULES} from './industry-workspaces.js';
import {businessLocalDate} from './us-market.js';
export function businessInsights(ws={},today=businessLocalDate(ws.account?.timeZone)){
  const leads=ws.leads||[],jobs=ws.jobs||[],invoices=ws.invoices||[],reviews=ws.reviews||[];
  const stages=['New','Quoted','Booked','Done'].map(stage=>({label:stage,count:leads.filter(l=>l.stage===stage).length}));
  const booked=leads.filter(l=>['Booked','Done'].includes(l.stage)).length;
  const sources=new Map();for(const l of leads){const source=l.source||'Unspecified';sources.set(source,(sources.get(source)||0)+1);}
  const currencies=new Map();
  for(const invoice of invoices){
    const currency=invoice.currency||ws.account?.currency||'USD';
    if(!currencies.has(currency))currencies.set(currency,{currency,count:0,paid:0,outstanding:0,overdue:0,draft:0});
    const row=currencies.get(currency),amount=Number(invoice.total)||0;row.count++;
    if(invoice.status==='Paid')row.paid+=amount;
    else if(invoice.status==='Draft')row.draft+=amount;
    else if(['Sent','Overdue'].includes(invoice.status)){
      row.outstanding+=amount;
      if(invoice.status==='Overdue'||invoice.dueDate&&invoice.dueDate<today)row.overdue+=amount;
    }
  }
  return {leadCount:leads.length,booked,bookingShare:leads.length?100*booked/leads.length:null,stages,
    sources:[...sources].map(([label,count])=>({label,count})).sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label)),
    activeJobs:jobs.filter(j=>!['Completed','Cancelled'].includes(j.status)).length,
    dueFollowUps:(ws.followUps||[]).filter(f=>!f.done&&f.dueDate<=today).length,
    receivedReviews:reviews.filter(r=>r.status==='Reviewed').length,
    quotes:(ws.quotes||[]).length,invoiceCount:invoices.length,paidInvoiceCount:invoices.filter(i=>i.status==='Paid').length,scheduledReminders:(ws.reminders||[]).filter(r=>r.status==='scheduled').length,currencies:[...currencies.values()]};
}
const table=(headers,rows)=>`<div class="table-scroll" tabindex="0" role="region" aria-label="Report table"><table class="data-table"><thead><tr>${headers.map(h=>'<th scope="col">'+esc(h)+'</th>').join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
const rowsTable=(label,rows)=>table([label,'Records'],rows.map(r=>`<tr><td>${esc(r.label)}</td><td>${r.count}</td></tr>`).join(''));
export function renderInsightsPage(ws,view='business'){
  const d=businessInsights(ws),titles={business:'Business overview',sales:'Sales insights',revenue:'Revenue insights'};
  const enabled=new Set(ws.account?.workspacePreferences?.modules||WORKSPACE_MODULES.map(m=>m.id));
  const stats=[['leads','Recorded leads',d.leadCount,'#customers/leads'],['jobs','Active jobs',d.activeJobs,'#field/schedule'],['followups','Due follow-ups',d.dueFollowUps,'#customers/followups'],['reviews','Reviews received',d.receivedReviews,'#marketing/reviews'],['quotes','Recorded estimates',d.quotes,'#customers/quotes'],['invoices','Saved invoices',d.invoiceCount,'#billing/invoices'],['payments','Invoices marked paid',d.paidInvoiceCount,'#billing/payments'],['reminders','Scheduled reminders',d.scheduledReminders,'#billing/reminders']];
  let content='';
  if(view==='business')content=`<div class="report-stats">${stats.filter(s=>enabled.has(s[0])).map(([,label,value,href])=>`<a class="report-stat" href="${href}" data-nav="${href.slice(1)}"><span>${label}</span><strong>${value}</strong><small>View records →</small></a>`).join('')}</div><section class="panel report-note"><h2>Based on your records</h2><p>These counts describe the records currently saved in Cerium. A hidden tool keeps its records. This is not a forecast or an accounting statement.</p><a class="text-button" href="#settings" data-nav="settings">Download your records in Settings →</a></section>`;
  if(view==='sales')content=`<div class="report-stats"><div class="report-stat"><span>Recorded leads</span><strong>${d.leadCount}</strong></div><div class="report-stat"><span>Leads marked Booked or Done</span><strong>${d.booked}</strong></div><div class="report-stat"><span>Current booking share</span><strong>${d.bookingShare===null?'—':d.bookingShare.toFixed(1)+'%'}</strong><small>Booked + Done / all recorded leads</small></div><div class="report-stat"><span>Saved estimates</span><strong>${d.quotes}</strong></div></div><div class="report-columns"><section class="panel"><div class="panel-header"><h2>Current sales stages</h2></div>${rowsTable('Stage',d.stages)}</section><section class="panel"><div class="panel-header"><h2>Recorded enquiry sources</h2></div>${d.sources.length?rowsTable('Source',d.sources):'<p class="report-note muted">Add lead sources to see a breakdown.</p>'}</section></div><p class="muted report-note">Current statuses are not a historical conversion rate, campaign attribution or a forecast.</p>`;
  if(view==='revenue')content=`<section class="panel"><div class="panel-header"><div><h2>Invoice and payment summary</h2><p class="panel-subtitle">Currencies stay separate. Drafts are excluded from outstanding balances.</p></div></div>${d.currencies.length?table(['Currency','Invoices','Marked paid','Outstanding','Overdue','Draft totals'],d.currencies.map(r=>`<tr><td>${esc(r.currency)}</td><td>${r.count}</td><td>${esc(money(r.paid,r.currency))}</td><td>${esc(money(r.outstanding,r.currency))}</td><td>${esc(money(r.overdue,r.currency))}</td><td>${esc(money(r.draft,r.currency))}</td></tr>`).join('')):'<p class="report-note muted">No saved invoices yet. Create an invoice to start this summary.</p>'}</section><p class="report-note muted">Paid totals reflect invoices marked Paid in Cerium. They are not a live bank balance, verified settlement, profit or recognized revenue. Overdue dates use your business time zone.</p><a class="text-button" href="#billing/invoices" data-nav="billing/invoices">Review invoices →</a>`;
  return `<div class="insights-page"><div class="page-heading"><div><h1>${titles[view]||titles.business}</h1><p class="page-description">A clear view of activity recorded in your workspace.</p></div><a class="button secondary" href="#settings" data-nav="settings">Data & export</a></div>${content}</div>`;
}
