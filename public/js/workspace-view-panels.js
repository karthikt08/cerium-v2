// Presentation adapters for existing forms, reports and manual draft workflows.
// Selecting a view never submits a form, starts delivery or changes saved data.
import {escapeHTML as esc} from './workspace-model.js';
import {selectedSubview} from './workspace-subviews.js';
import {draftMarketingCopy} from './marketing-model.js';
import {invoiceMoney} from './invoice-country.js';

const panel=(title,body)=>`<section class="panel subview-explanation"><div class="panel-header"><h2>${esc(title)}</h2></div><div class="settings-content">${body}</div></section>`;
const ask=(text,prompt=text)=>`<button type="button" class="button secondary" data-action="ask-guide" data-prompt="${esc(prompt)}">${esc(text)} →</button>`;
export function renderGuidancePage(route){
  const sub=selectedSubview(route);
  const content={
    modules:['Find relevant modules','Describe your work to review suggested tools. Changes are applied only when you save your selection.',ask('Recommend tools','Which Cerium tools should I use for my business?')],
    navigate:['Section navigation','Open a verified workspace destination or ask for a specific feature.',`<div class="subview-actions"><a class="button secondary" href="#customers/leads" data-nav="customers/leads">Leads</a><a class="button secondary" href="#field/schedule" data-nav="field/schedule">Job Schedule</a><a class="button secondary" href="#billing/invoices" data-nav="billing/invoices">Invoices</a></div>`],
    'step-by-step':['Step-by-step guides','Get instructions for the next task in your workflow.',ask('Guide me through creating a quote')],
    'multi-feature':['Multi-feature workflows','Connect an enquiry to an estimate, a scheduled job and an invoice.',ask('Explain the quote-to-job-to-invoice workflow')],
    context:['Context-aware follow-ups','Continue a conversation in Ask Cerium using its previous questions and your current workspace section.',ask('Help me plan customer follow-ups')],
    'point-wise':['Point-wise answers','Ask Cerium breaks guidance into steps and relevant actions. Review the answer before making changes.',ask('Show me the steps for recording a payment')],
    progressive:['Progressive typing','Answers appear progressively in the assistant. Use Show full answer to reveal the remaining text immediately.',ask('Explain how I can use Cerium for my daily workflow')],
    'verified-links':['Verified navigation links','Assistant links point to registered Cerium destinations. Open a link to review the relevant records.',ask('Where can I review outstanding invoices?')],
  }[sub];
  return `<div class="page-heading"><div><h1>${esc(route.label)}</h1><p class="page-description">Guidance for your existing Cerium tools.</p></div></div>`+panel(content[0],`<p>${esc(content[1])}</p><div class="subview-actions">${content[2]}</div>`);
}

export function renderReminderDrafts(ws){
  const invoices=(ws.invoices||[]).filter(i=>['Sent','Overdue'].includes(i.status));
  return `<div class="page-heading"><div><h1>Message templates</h1><p class="page-description">Write a payment follow-up to copy and share yourself.</p></div></div>`+panel('Customer follow-up draft',`<form id="reminder-draft-form" class="form-grid">
    <label class="field full-width">Invoice<select name="invoiceId"><option value="">Choose an invoice</option>${invoices.map(i=>`<option value="${esc(i.id)}">${esc(i.customerName)} · #${esc(i.id)}</option>`).join('')}</select></label>
    <div class="full-width"><button type="button" class="button secondary" data-reminder-draft-generate>Draft for selected invoice</button></div>
    <label class="field full-width">Message<textarea name="message" rows="6" maxlength="1600">Hello, this is a friendly follow-up about your outstanding invoice. Please let us know if you have any questions. Thank you.</textarea></label>
    <div class="full-width"><button type="button" class="button primary" data-reminder-draft-copy>Copy draft</button></div>
    <p class="muted full-width" role="status" data-draft-status>This editable draft stays in this page session. It is not a saved delivery template and does not change scheduled emails.</p></form>`);
}

export function applySubviewLayout(root,route,ws){
  const sub=selectedSubview(route),id=route.id;
  const hide=(selector,hidden=true)=>root.querySelectorAll(selector).forEach(el=>el.hidden=hidden);
  const note=(title,text)=>root.querySelector('.workspace-feature-content')?.insertAdjacentHTML('afterbegin',panel(title,`<p>${esc(text)}</p>`));
  if(route.subview)hide('select[data-filter="status"],[data-jobs-filter]');
  if(id==='business'&&sub==='operations'){
    for(const stat of root.querySelectorAll('.report-stat'))stat.hidden=!['#field/schedule','#customers/followups','#customers/quotes','#billing/reminders'].includes(stat.getAttribute('href'));
  }
  if(id==='sales'&&route.subview){hide('.report-stats',sub==='pipeline');hide('.report-columns',sub==='conversion');}
  if(id==='revenue'&&route.subview){
    for(const row of root.querySelectorAll('.data-table tr'))for(const [index,cell] of [...row.children].entries())cell.hidden=!(sub==='paid'?[0,2]:[0,3,4,5]).includes(index);
  }
  if(id==='schedule'){
    const heading=root.querySelector('.page-heading h1');if(heading&&sub!=='calendar')heading.textContent=sub==='active'?'Active work':'Upcoming appointments';
  }
  if(id==='overview'&&route.subview){
    hide('.metrics-grid',sub!=='kpis');
    hide('.overview-stage',sub!=='actions');
    hide('.dashboard-grid,.overview-workspace-row,.overview-tools',sub!=='workspace');
  }
  if(route.section==='marketing'){
    const composer=id==='visibility'||id==='reengage'&&sub==='campaign';
    root.querySelectorAll('[data-marketing-panel]').forEach(p=>p.hidden=p.dataset.marketingPanel!==(composer?'visibility':id));
    if(composer){
      const kind=id==='reengage'?'rebook':sub==='profile'?'update':sub==='reviews'?'review':'post';
      const select=root.querySelector('[data-marketing-draft-kind]'),text=root.querySelector('[data-marketing-draft]');
      if(select)select.value=kind;
      if(text)text.value=draftMarketingCopy({kind,businessName:ws.account.businessName,service:ws.account.trade});
      hide('.marketing-next-moves',sub==='reviews'||id==='reengage');
      const heading=root.querySelector('#marketing-panel-visibility h2');
      if(heading)heading.textContent=id==='reengage'?'Rebooking campaign draft':sub==='profile'?'Google business profile drafts':sub==='reviews'?'Customer review request drafts':'Search visibility';
    }
    if(id==='performance'){
      hide('.marketing-insight-grid,.marketing-callout',sub==='sources');
      hide('.marketing-sources',sub!=='sources');
    }
  }
  if(route.section==='settings'){
    // Keep legacy #settings as the complete settings page for existing links.
    if(id!=='business-settings'||route.subview){
      const profile=id==='business-settings'||id==='account-subscription'&&sub==='profile';
      hide('#settings-profile-panel',!profile);
      hide('#settings-plan-panel',id!=='account-subscription'||sub==='profile');
      hide('#settings-data-panel',id!=='data-management');
      hide('.danger-panel',id!=='data-management'||sub!=='export');
      hide('.workspace-customizer',id!=='customize-tools');
      for(const stack of root.querySelectorAll('.settings-stack'))stack.hidden=[...stack.children].every(c=>c.hidden);
      if(profile&&sub!=='profile'){
        const names={currency:['country','currency'],tax:['gstin','indiaState'],upi:['upiVpa']}[sub]||[];
        const form=root.querySelector('#profile-form');
        if(form){
          form.querySelectorAll('.form-grid > *').forEach(el=>el.hidden=!names.includes(el.querySelector('[name]')?.name));
          hide('.business-profile-summary');
          if(!names.some(name=>form.querySelector('[name="'+name+'"]'))){
            hide('#profile-form');note(route.subviewLabel||route.label,sub==='upi'?'UPI details are available for Indian businesses using INR.':'Tax registration and rates can be entered on country-specific invoices.');
          }
        }
      }
      if(id==='customize-tools')note(sub==='presets'?'Industry presets':sub==='reflow'?'Reflow your dashboard':'Selected tools',sub==='presets'?'Open Customize tools to choose an industry and review its suggested modules before saving.':sub==='reflow'?'Overview cards reflow automatically around your selected tools. Use Customize tools to change what appears.':'Choose which implemented modules appear in your workspace. Hiding a tool preserves its records.');
      if(id==='data-management'){
        hide('[data-action="export"]',sub!=='export');hide('[data-action="import-leads"]',sub==='export');
        if(sub==='mapping')note('Column mapping and validation','Open the spreadsheet importer, select your file, review recognized columns and validation results, then confirm the import.');
      }
    }
  }
  if(id==='support-requests'){
    const category=root.querySelector('#support-form [name="category"]');if(category)category.value=sub==='issues'?'Bug report':'Product question';
  }
  if(id==='product-help'&&sub==='help'){
    note('Help and feedback','Use Ask Cerium for product guidance or open Support Requests to prepare a message for the team.');
  }
  if(id==='dues'&&sub==='import'){
    hide('.due-summary,.due-layout');
    note('Import custom dues','Use Import Excel / CSV to preview and validate payment due records before confirming. This does not mark invoices as paid.');
  }
  const draft=root.querySelector('#reminder-draft-form');
  draft?.addEventListener('click',async event=>{
    const message=draft.elements.message,status=draft.querySelector('[data-draft-status]');
    if(event.target.closest('[data-reminder-draft-generate]')){
      const invoice=ws.invoices.find(i=>String(i.id)===draft.elements.invoiceId.value);
      if(!invoice){status.textContent='Choose an invoice before generating a draft.';return;}
      message.value=`Hello ${invoice.customerName}, a friendly follow-up about invoice #${invoice.id} for ${invoiceMoney(invoice.total,invoice.currency||ws.account.currency,ws.account.country)}, due ${invoice.dueDate}. Please let us know if you have any questions. Thank you.`;
      message.dispatchEvent(new Event('input',{bubbles:true}));
    }
    if(event.target.closest('[data-reminder-draft-copy]')){
      try{await navigator.clipboard.writeText(message.value);status.textContent='Draft copied. Review it and choose when to share.';}
      catch{message.focus();message.select();status.textContent='Draft selected. Copy it manually.';}
    }
  });
}
