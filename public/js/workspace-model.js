// Shared, side-effect-free workspace rules.
import {businessLocalDate} from './us-market.js';
import {marketingFeatureFromHash} from './marketing-features.js';
export const SECTIONS = {
  overview: ['Overview', 'Your day at a glance.'],
  reminders: ['Payment reminders', 'Schedule approved customer reminders.'],
  quotes: ['Estimates & quotes', 'Price work and collect customer approvals.'],
  jobs: ['Jobs & dispatch', 'Schedule jobs and assign your crew.'],
  leads: ['Leads', 'Keep every inquiry moving toward a booked job.'],
  followups: ['Follow-ups', 'A clear list of who to contact and when.'],
  invoices: ['Invoices', 'Create invoices and keep track of what is owed.'],
  payments: ['Payments', 'Review paid invoices and match recorded deposits.'],
  reviews: ['Reviews', 'Follow through with customers after the job is done.'],
  marketing: ['Marketing', 'Plan outreach, re-engage customers and track real workspace activity.'],
  settings: ['Settings', 'Manage your business profile, plan, and data.'],
  support: ['Help & feedback', 'Get in touch with the people building Cerium.'],
};
export const STAGES = ['New', 'Quoted', 'Booked', 'Done'];
export const SOURCES = ['Direct', 'Google Search', 'Google Maps', 'Referral', 'Website Form', 'Repeat Customer', 'Yard Sign', 'Other'];
export function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
export function dateLabel(value) {
  if (!value) return '—';
  const d = new Date(String(value).slice(0,10) + 'T12:00:00');
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', {month:'short',day:'numeric'});
}
export function money(value, currency = 'USD') {
  // Keep legacy historical amounts legible until they are explicitly migrated.
  const safeCurrency = Intl.supportedValuesOf('currency').includes(currency) ? currency : 'USD';
  const digits=Math.max(2,new Intl.NumberFormat('en',{style:'currency',currency:safeCurrency}).resolvedOptions().maximumFractionDigits);
  return new Intl.NumberFormat(safeCurrency === 'INR' ? 'en-IN' : 'en-US', {style:'currency',currency:safeCurrency,currencyDisplay:['USD','INR'].includes(safeCurrency)?'symbol':'code',minimumFractionDigits:digits,maximumFractionDigits:digits}).format(Number(value) || 0);
}
export function metrics(ws, today = businessLocalDate(ws.account?.timeZone)) {
  const openInvoices = ws.invoices.filter(x => ['Sent','Overdue'].includes(x.status));
  return {
    leads: ws.leads.filter(x => ['New','Quoted'].includes(x.stage)).length,
    due: ws.followUps.filter(x => !x.done && x.dueDate <= today).length,
    outstanding: openInvoices.reduce((n,x) => n + Number(x.total || 0),0),
    overdue: openInvoices.filter(x => x.status === 'Overdue' || x.dueDate < today).reduce((n,x) => n + Number(x.total || 0),0),
    paid: ws.invoices.filter(x => x.status === 'Paid').reduce((n,x) => n + Number(x.total || 0),0),
    reviews: ws.reviews.filter(x => x.status === 'Not Asked').length,
  };
}
export function filteredRows(kind, ws, filters = {}, today = businessLocalDate(ws.account?.timeZone)) {
  const {query='',status='All',source='All'} = filters;
  const key = kind === 'followups' ? 'followUps' : kind;
  let rows = [...(ws[key] || [])];
  if (kind === 'followups') {
    rows = rows.filter(x => status === 'All' || (status === 'Due' && !x.done && x.dueDate <= today) || (status === 'Upcoming' && !x.done && x.dueDate > today) || (status === 'Done' && x.done));
    rows.sort((a,b) => Number(a.done)-Number(b.done) || a.dueDate.localeCompare(b.dueDate));
  } else {
    rows = rows.filter(x => status === 'All' || (kind === 'leads' ? x.stage : x.status) === status);
  }
  if (kind === 'leads' && source !== 'All') rows = rows.filter(x => x.source === source);
  const needle=query.trim().toLocaleLowerCase();
  if (needle) rows = rows.filter(x => Object.values(x).some(v => typeof v === 'string' && v.toLocaleLowerCase().includes(needle)));
  return rows;
}
export function validateRecord(kind, values) {
  const required = {lead:['name'],followup:['contactName','task','dueDate'],invoice:['customerName','jobTitle','amount'],review:['customerName','jobTitle']}[kind] || [];
  if (required.some(k => !String(values[k] ?? '').trim())) return 'Please fill in the required fields.';
  for (const key of ['amount','value']) {
    if (values[key] !== undefined && values[key] !== '' && (!Number.isFinite(Number(values[key])) || Number(values[key]) < 0)) return 'Amounts must be zero or a positive number.';
  }
  if (kind === 'invoice' && Number(values.amount) <= 0) return 'Enter an invoice amount greater than zero.';
  for (const key of ['email','customerEmail']) {
    if (values[key] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values[key])) return 'Enter a valid email address.';
  }
  return '';
}
export function safeReviewURL(value) {
  try { const u=new URL(value); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; }
}
export function routeFromHash(hash) {
  const path = String(hash || '').replace(/^#/, '');
  const name = marketingFeatureFromHash(hash)?'marketing':path;
  const alias = {today:'overview',bank:'payments',account:'settings',messages:'support'};
  return SECTIONS[alias[name] || name] ? (alias[name] || name) : 'overview';
}
