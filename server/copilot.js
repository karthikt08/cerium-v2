// Cerium Copilot MVP: account-scoped, deterministic, read-only business answers.
// Only activated for explicit business-data requests; all other turns use Cerium Guide.
// No workspace records are passed to an external model or kept in conversation storage.
import {businessLocalDate} from '../public/js/us-market.js';

export function copilotIntent(question) {
  const q=String(question||'').toLowerCase().trim();
  if (/\b(?:how is (?:my|the|our) business (?:doing|performing)|business performance|monthly (?:summary|performance)|performance this month|(?:this|current) month(?:'s)? (?:sales|revenue|performance)|how much (?:have i|did we) bill(?:ed)? this month)\b/.test(q))return 'monthly';
  if (/\b(?:how much (?:money )?(?:is )?(?:overdue|unpaid|outstanding)|what(?:'s| is) overdue|(?:show|list|which|any|how many) (?:overdue|unpaid|outstanding) invoices?|(?:which|show|list|how many) invoices? (?:are |is )?(?:overdue|unpaid|outstanding)|overdue (?:invoices?|payments?|money)|unpaid invoices?|outstanding invoices?)\b/.test(q))return 'overdue';
  if (/\b(?:who (?:do i|should i|needs? to) follow[ -]?up|who needs (?:a )?follow[ -]?up|which customers? need(?:s)? follow[ -]?ups?|(?:show|list|which|any|how many) follow[ -]?ups? (?:due|today|pending|overdue)|follow[ -]?ups? (?:due|today|pending|overdue))\b/.test(q))return 'followups';
  if (/\b(?:which|show|find|list|any|how many) (?:of my |our )?(?:leads|prospects|opportunities).*(?:stalled|inactive|stale|not progressed|neglected)|(?:stalled|stale|inactive) leads\b/.test(q))return 'stalled';
  if (/\b(?:what should (?:i|we) (?:focus on|do) today|what needs (?:my|our) attention today|today'?s priorities|daily priorities|morning (?:brief|summary)|business brief|priorities for today|what should i focus on)\b/.test(q))return 'priorities';
  return null;
}

const dateOnly=value=>typeof value==='string'?value.slice(0,10):'';
const money=(cents,currency)=>{
  const code=/^[A-Z]{3}$/.test(currency||'')?currency:'USD';
  try{return new Intl.NumberFormat(code==='INR'?'en-IN':'en-US',{style:'currency',currency:code}).format(cents/100);}
  catch{return (cents/100).toFixed(2)+' '+code;}
};
const cents=value=>Number.isFinite(Number(value))?Math.max(0,Math.round(Number(value)*100)):0;
const countLabel=(count,singular,plural=singular+'s')=>count+' '+(count===1?singular:plural);
const label=value=>String(value||'Unnamed record').replace(/[\r\n\t]+/g,' ').slice(0,75);
function sumByCurrency(rows,defaultCurrency){
  const sums=new Map();
  for(const row of rows){
    const currency=/^[A-Z]{3}$/.test(row.currency||'')?row.currency:defaultCurrency;
    sums.set(currency,(sums.get(currency)||0)+cents(row.total));
  }
  return sums.size?[...sums].map(([currency,total])=>money(total,currency)).join(' + '):money(0,defaultCurrency);
}

export function answerCopilot(intent,workspace,{today}={}) {
  if(!['priorities','overdue','followups','stalled','monthly'].includes(intent)||!workspace)return null;
  const timeZone=workspace.account?.timeZone||'';
  const day=today||businessLocalDate(timeZone);
  const currency=workspace.account?.currency||'USD';
  const invoices=Array.isArray(workspace.invoices)?workspace.invoices:[];
  const leads=Array.isArray(workspace.leads)?workspace.leads:[];
  const followUps=Array.isArray(workspace.followUps)?workspace.followUps:[];
  const jobs=Array.isArray(workspace.jobs)?workspace.jobs:[];
  const overdue=invoices.filter(i=>(i.status==='Overdue'||(i.status==='Sent'&&i.dueDate&&i.dueDate<day))&&i.status!=='Paid');
  const due=followUps.filter(f=>!f.done&&dateOnly(f.dueDate)&&dateOnly(f.dueDate)<=day);
  const todayJobs=jobs.filter(j=>['Scheduled','Confirmed','In progress'].includes(j.status)&&dateOnly(j.startAt)===day);
  const cutoff=new Date(day+'T12:00:00Z');
  cutoff.setUTCDate(cutoff.getUTCDate()-7);
  const cutoffDay=cutoff.toISOString().slice(0,10);
  // Proxy for age, NOT a claim about last customer contact or actual CRM activity.
  const stalled=leads.filter(l=>['New','Quoted'].includes(l.stage)&&dateOnly(l.createdAt)&&dateOnly(l.createdAt)<=cutoffDay);
  const month=day.slice(0,7);
  const monthInvoices=invoices.filter(i=>dateOnly(i.issueDate).startsWith(month));
  const monthLeads=leads.filter(l=>dateOnly(l.createdAt).startsWith(month));
  const lines=[];
  let destinations=[];
  if(intent==='priorities'){
    lines.push('**Today\'s business priorities** ('+day+')');
    if(overdue.length)lines.push('- **Overdue invoices:** '+countLabel(overdue.length,'invoice')+' totaling '+sumByCurrency(overdue,currency)+' require review.');
    if(due.length)lines.push('- **Follow-ups due:** '+countLabel(due.length,'task')+' due or past due.');
    if(todayJobs.length)lines.push('- **Jobs today:** '+countLabel(todayJobs.length,'active job')+' scheduled for today.');
    if(stalled.length)lines.push('- **Older open leads:** '+countLabel(stalled.length,'lead')+' still New or Quoted after 7+ days since creation.');
    if(lines.length===1)lines.push('- No overdue invoices, due follow-up tasks, jobs today, or older open leads found in your current workspace records.');
    lines.push('These are live record checks, not predicted priorities. Review the linked pages before taking action.');
    destinations=['#invoices','#followups','#jobs','#leads'];
  }else if(intent==='overdue'){
    lines.push('**Overdue invoices** (as of '+day+')');
    lines.push('- '+countLabel(overdue.length,'invoice')+' overdue; outstanding invoice face value: '+sumByCurrency(overdue,currency)+'.');
    for(const item of overdue.slice(0,3))lines.push('- '+label(item.customerName)+': '+money(cents(item.total),item.currency||currency)+' (due '+(dateOnly(item.dueDate)||'date unknown')+').');
    if(overdue.length>3)lines.push('- '+(overdue.length-3)+' additional overdue invoices in Invoices.');
    lines.push('This is based on unpaid invoice status and due dates; it is not a verified bank balance.');
    destinations=['#invoices','#reminders'];
  }else if(intent==='followups'){
    lines.push('**Follow-ups due** (through '+day+')');
    lines.push('- '+countLabel(due.length,'unfinished task')+' due today or earlier.');
    for(const item of due.slice(0,4))lines.push('- '+label(item.contactName)+': '+label(item.task)+' (due '+dateOnly(item.dueDate)+').');
    if(due.length>4)lines.push('- '+(due.length-4)+' more follow-up tasks in your workspace.');
    lines.push('Based on saved Follow-ups tasks, not messages sent or customer contact history.');
    destinations=['#followups','#leads'];
  }else if(intent==='stalled'){
    lines.push('**Older open leads** (as of '+day+')');
    lines.push('- '+countLabel(stalled.length,'lead')+' in New or Quoted stage, created at least seven days ago.');
    for(const item of stalled.slice(0,4))lines.push('- '+label(item.name)+': '+item.stage+' (created '+dateOnly(item.createdAt)+').');
    if(stalled.length>4)lines.push('- '+(stalled.length-4)+' more older leads in Leads.');
    lines.push('This is a stage-and-age filter, not proof of inactivity; recent conversations are not assessed.');
    destinations=['#leads','#followups'];
  }else{
    lines.push('**This month\'s activity** ('+month+')');
    lines.push('- '+countLabel(monthInvoices.length,'invoice')+' issued; invoiced face value: '+sumByCurrency(monthInvoices,currency)+'.');
    lines.push('- '+countLabel(monthInvoices.filter(i=>i.status==='Paid').length,'invoice')+' issued this month currently marked Paid.');
    lines.push('- '+countLabel(monthLeads.length,'lead')+' created this month.');
    lines.push('Issued invoice totals are not revenue or cash received; this overview does not calculate profit, expenses, or conversion rates.');
    destinations=['#invoices','#leads','#insights/revenue'];
  }
  return {source:'copilot',type:'copilot',section:null,reply:lines.join('\n').slice(0,2350),destinations};
}
