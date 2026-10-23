// Estimates & Quotes — integrated with CERIUM's job scheduling and billing.
import {escapeHTML as esc} from './workspace-model.js';
import {businessLocalDate,US_TIME_ZONES,formatUSPhone} from './us-market.js';
let handlers=null;
let working=false;
const statuses={Draft:'draft',Sent:'sent',Accepted:'accepted',Declined:'declined',Converted:'converted'};
const fmt=(value,currency='USD')=>new Intl.NumberFormat(currency==='INR'?'en-IN':'en-US',
  {style:'currency',currency:currency==='INR'?'INR':'USD'}).format(Number(value)||0);
const day=v=>v?new Date(v).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'—';
const e=s=>esc(s??'');
const quoteRow=(quote,currency,ro)=>{
  const id=e(quote.id);
  const action=(kind,label,style='primary')=>
    '<button type="button" class="button '+style+' quote-action-button" data-quote-action="'+kind+
    '" data-quote-id="'+id+'">'+label+'</button>';
  // Only one visually dominant action per status. Administrative actions live
  // in a separate, quieter area instead of fighting for space on every card.
  let primary='',secondary='',nextStep='';
  switch(quote.status){
    case 'Draft':
      primary=action('share','Create approval link');
      secondary=action('edit','Edit draft','secondary');
      nextStep='Ready to share once you finish pricing';
      break;
    case 'Sent':
      primary=action('copy','Copy approval link');
      nextStep='Approval link ready · awaiting customer response';
      break;
    case 'Accepted':
      primary=action('convert','Schedule job →');
      secondary=action('copy','Copy link','secondary');
      nextStep='Customer accepted · schedule an appointment';
      break;
    case 'Converted':
      if(quote.jobId)primary=action('view-job','View scheduled job →');
      nextStep=quote.jobId?'Linked to a scheduled job':'Original job no longer exists';
      break;
    case 'Declined':
      nextStep='Customer declined · no job was created';
      break;
  }
  // Keep the destructive action accessible, but out of the main CTA row.
  const more=!ro?
    '<details class="quote-more"><summary title="More estimate options" aria-label="More actions for '+e(quote.title)+'">'+
    '<svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="currentColor">'+
    '<circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>'+
    '</summary><div class="quote-more-menu"><button type="button" class="quote-delete" data-quote-action="delete" '+
    'data-quote-id="'+id+'">Delete estimate</button></div></details>':'';
  return '<article class="quote-card"><div class="quote-card-main"><div class="quote-card-top">'+
    '<span class="quote-number" title="Estimate ID: '+id+'">Estimate <span class="quote-short-id">#'+
    e(quote.id.slice(0,6).toUpperCase())+'</span></span>'+
    '<div class="quote-card-head-actions"><span class="quote-pill quote-'+e(statuses[quote.status]||'draft')+'">'+
    e(quote.status==='Sent'?'Link ready':quote.status)+'</span>'+more+'</div></div>'+
    '<h3>'+e(quote.title)+'</h3><p>'+e(quote.customerName)+
    (quote.customerEmail?' · '+e(quote.customerEmail):'')+'</p>'+
    '<div class="quote-card-bottom"><strong>'+e(fmt(quote.total,quote.currency||currency))+'</strong>'+
    '<span>'+e(quote.items.length)+' line item'+(quote.items.length===1?'':'s')+' · '+e(day(quote.createdAt))+'</span></div>'+
    '<p class="quote-next-step">'+e(nextStep)+'</p></div>'+
    (ro?'':'<div class="quote-actions">'+
      '<div class="quote-action-group">'+
        (primary||'<span class="quote-complete-label">No further action required</span>')+
        (secondary||'')+
      '</div></div>')+
    '</article>';
};

export function renderQuotesPage(ws,ro=false){
  const quotes=ws.quotes||[],currency=ws.account?.currency;
  return '<div class="quotes-view"><div class="page-heading"><div>'+
    '<p class="eyebrow">SALES PIPELINE</p><h1>Estimates & quotes</h1>'+
    '<p class="page-description">Price the work, share a secure approval link, then turn an accepted estimate into a scheduled job.</p>'+
    '</div><div class="heading-actions"><button class="button primary" type="button" data-quote-action="new" '+(ro?'disabled':'')+'>+ Create estimate</button></div></div>'+
    '<div class="quotes-progress"><span><b>1</b> Draft the price</span><span><b>2</b> Copy approval link</span>'+
    '<span><b>3</b> Customer approves</span><span><b>4</b> Schedule the job</span></div>'+
    '<div class="quotes-summary"><div><strong>'+quotes.length+'</strong><span>Total estimates</span></div>'+
    '<div><strong>'+quotes.filter(q=>q.status==='Sent').length+'</strong><span>Awaiting decision</span></div>'+
    '<div><strong>'+quotes.filter(q=>q.status==='Accepted').length+'</strong><span>Ready to schedule</span></div></div>'+
    '<div class="notice"><div><strong>Approval links, not automatic email</strong>'+
    '<p>CERIUM prepares a private 30-day customer approval link. Copy and share it yourself; nothing is emailed or charged automatically.</p></div></div>'+
    (quotes.length?'<div class="quote-cards">'+quotes.map(q=>quoteRow(q,currency,ro)).join('')+'</div>':
      '<section class="panel quotes-empty"><h2>Your next customer starts here.</h2>'+
      '<p>Create a detailed estimate and share it for the customer to accept or decline.</p>'+
      (ro?'':'<button class="button primary" data-quote-action="new" type="button">Create your first estimate</button>')+'</section>')+
    '</div>';
}
function ensureDialog(){
  let d=document.getElementById('cerium-quote-dialog');
  if(!d){d=document.createElement('dialog');d.id='cerium-quote-dialog';d.className='quotes-dialog';d.setAttribute('aria-label','Estimate editor');document.body.append(d);}
  return d;
}
function close(){const d=document.getElementById('cerium-quote-dialog');if(d?.open)d.close();}
function show(html){
  const d=ensureDialog();
  if(d.open)d.close();
  d.innerHTML=html;d.showModal();d.querySelector('input,select,button')?.focus();
}
const header=(title,description)=>'<div class="quotes-modal-head"><div><p class="eyebrow">ESTIMATES</p>'+
  '<h2>'+e(title)+'</h2><p>'+e(description)+'</p></div>'+
  '<button class="quote-x" type="button" data-quote-action="close" aria-label="Close">×</button></div>';
const row=(item={description:'',qty:1,rate:0})=>'<div class="quote-item" data-quote-item>'+
  '<label>Description<input data-quote-field="description" maxlength="180" required value="'+e(item.description)+'" placeholder="Labor, materials..."></label>'+
  '<label>Qty<input data-quote-field="qty" type="number" min=".01" max="10000" step=".01" required value="'+e(item.qty)+'"></label>'+
  '<label>Rate<input data-quote-field="rate" type="number" min="0" max="1000000" step=".01" required value="'+e(item.rate)+'"></label>'+
  '<button class="quote-remove" type="button" data-quote-action="remove-item" aria-label="Remove item">×</button></div>';
function updateTotal(form){
  if(!form)return;
  const amount=[...form.querySelectorAll('[data-quote-item]')].reduce((sum,r)=>
    sum+Number(r.querySelector('[data-quote-field="qty"]').value||0)*Number(r.querySelector('[data-quote-field="rate"]').value||0),0);
  const el=form.querySelector('[data-quote-total]');
  if(el)el.textContent=fmt(amount,handlers?.getWorkspace()?.account?.currency);
}
function editQuote(ws,id='',leadId=''){
  const quote=(ws.quotes||[]).find(q=>q.id===id)||null;
  if(id&&!quote)return handlers.toast('Estimate not found.',true);
  const leads=[{id:'',name:'No linked lead'},...(ws.leads||[])];
  const prefill=!quote?(ws.leads||[]).find(l=>l.id===leadId):null;
  show(header(quote?'Edit draft estimate':'New estimate',
    'Set the work, quantity and rate. Prices are locked once you create an approval link.')+
    '<form data-quote-form="edit" data-quote-id="'+e(id)+'">'+
    '<div class="quotes-modal-body"><div class="quotes-form-grid">'+
    '<label>Linked lead<select name="leadId">'+leads.map(l=>'<option value="'+e(l.id)+'" '+((quote?.leadId||leadId)===l.id?'selected':'')+'>'+e(l.name)+'</option>').join('')+'</select></label>'+
    '<label>Customer name<input name="customerName" required maxlength="120" value="'+e(quote?.customerName||prefill?.name)+'" placeholder="e.g. Taylor Properties"></label>'+
    '<label>Email (optional)<input name="customerEmail" type="email" maxlength="254" value="'+e(quote?.customerEmail||prefill?.email)+'"></label>'+
    '<label>Phone (optional)<input name="customerPhone" maxlength="40" value="'+e(formatUSPhone(quote?.customerPhone||prefill?.phone))+'"></label>'+
    '<label class="quote-wide">Estimate title<input name="title" required maxlength="120" value="'+e(quote?.title)+'" placeholder="AC repair and parts"></label>'+
    '<label class="quote-wide">Service address<input name="address" maxlength="240" value="'+e(quote?.address||prefill?.address)+'" placeholder="Street, city, state, ZIP"></label>'+
    '<label class="quote-wide">Notes<textarea name="notes" maxlength="1200" rows="3" placeholder="Scope, exclusions, or assumptions">'+e(quote?.notes)+'</textarea></label>'+
    '</div><div class="quotes-items-head"><h3>Line items</h3><p>Labor, materials, visits, and other quoted costs.</p></div>'+
    '<div data-quote-items>'+((quote?.items?.length?quote.items:[{description:'Service labor',qty:1,rate:0}]).map(row).join(''))+'</div>'+
    '<div class="quotes-total-actions"><button class="button secondary" type="button" data-quote-action="add-item">+ Add line</button>'+
    '<div class="quotes-total-label">Estimated total <strong data-quote-total>—</strong></div></div>'+
    '<p class="quotes-error" hidden role="alert"></p></div>'+
    '<div class="quotes-modal-actions"><button class="button secondary" type="button" data-quote-action="close">Cancel</button>'+
    '<button type="submit" class="button primary">Save draft</button></div></form>');
  const d=document.getElementById('cerium-quote-dialog');
  updateTotal(d.querySelector('form'));
  d.querySelector('[name=leadId]')?.addEventListener('change',ev=>{
    const lead=ws.leads.find(l=>l.id===ev.target.value);
    if(!lead)return;
    const form=ev.target.form;
    if(!form.elements.customerName.value)form.elements.customerName.value=lead.name;
    if(!form.elements.customerEmail.value)form.elements.customerEmail.value=lead.email||'';
    if(!form.elements.customerPhone.value)form.elements.customerPhone.value=lead.phone||'';
    if(!form.elements.address.value)form.elements.address.value=lead.address||'';
  });
}
function convertDialog(quote,ws){
  const baseDay=businessLocalDate(ws.account?.timeZone);
  // Advance the calendar date, not 24 elapsed hours, across DST changes.
  const date=new Date(Date.parse(baseDay+'T12:00:00Z')+86400000).toISOString().slice(0,10);
  const crew=[{id:'',name:'Unassigned'},...(ws.crew||[]).filter(c=>c.active)];
  show(header('Turn approval into a job','Choose an appointment time. Billing items carry through to the future invoice.')+
    '<form data-quote-form="convert" data-quote-id="'+e(quote.id)+'"><div class="quotes-modal-body">'+
    '<div class="quotes-convert-summary"><strong>'+e(quote.title)+'</strong>'+
    '<span>'+e(quote.customerName)+' · '+e(fmt(quote.total,quote.currency||ws.account?.currency))+'</span></div>'+
    '<div class="quotes-form-grid">'+
    '<label>Start time (business local)<input type="datetime-local" name="startAt" required value="'+date+'T09:00"></label>'+
    '<label>End time (business local)<input type="datetime-local" name="endAt" required value="'+date+'T10:00"></label>'+
    '<label class="quote-wide">Assigned crew<select name="workerId">'+crew.map(c=>
      '<option value="'+e(c.id)+'">'+e(c.name)+'</option>').join('')+'</select></label></div>'+
    '<p class="quotes-subtle">Business time zone: '+e(US_TIME_ZONES[ws.account?.timeZone]||'Not set — using your browser clock')+'. The job starts in Scheduled status. Completing it creates a draft invoice with the approved items.</p>'+
    '<p class="quotes-error" hidden role="alert"></p></div>'+
    '<div class="quotes-modal-actions"><button class="button secondary" type="button" data-quote-action="close">Cancel</button>'+
    '<button class="button primary" type="submit">Create scheduled job</button></div></form>');
}
function shareDialog(url){
  show(header('Your approval link is ready',
    'The estimate is locked and ready for your customer. CERIUM has not sent an email.')+
    '<div class="quotes-modal-body"><label class="quotes-share-label">Private customer approval link'+
    '<input id="cerium-share-url" readonly value="'+e(url)+'"></label>'+
    '<p class="quotes-subtle">Only the person you share this link with should review and respond to this estimate. The link expires in 30 days.</p></div>'+
    '<div class="quotes-modal-actions"><button class="button secondary" type="button" data-quote-action="close">Close</button>'+
    '<button class="button primary" type="button" data-quote-action="copy-link">Copy link</button></div>');
}
async function copyLink(url,toast){
  if(navigator.clipboard?.writeText){
    try{await navigator.clipboard.writeText(url);toast('Private approval link copied. Share it with your customer.');return;}catch{}
  }
  window.prompt('Copy this private approval link:',url);
  toast('Approval link ready to share.');
}
export function initializeQuotesUI({API,refresh,getWorkspace,isReadOnly,toast}){
  handlers={API,refresh,getWorkspace,isReadOnly,toast};
  document.addEventListener('cerium:new-quote',event=>{
    if(isReadOnly())return toast('Your trial has ended. Estimates are read-only.',true);
    const ws=getWorkspace();if(ws)editQuote(ws,'',event.detail?.leadId||'');
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape')document.querySelectorAll('.quote-more[open]').forEach(menu=>{menu.open=false;});
  });
  document.addEventListener('click',async event=>{
    document.querySelectorAll('.quote-more[open]').forEach(menu=>{
      if(!menu.contains(event.target))menu.open=false;
    });
    const button=event.target.closest('[data-quote-action]');if(!button)return;
    const action=button.dataset.quoteAction,id=button.dataset.quoteId;
    if(action==='close'){close();return;}
    if(action==='copy-link'){
      const input=document.getElementById('cerium-share-url');
      if(input)await copyLink(input.value,toast);
      return;
    }
    if(action==='add-item'){const parent=button.closest('form')?.querySelector('[data-quote-items]');if(parent?.children.length>=20)return toast('Maximum 20 estimate lines.',true);
      parent?.insertAdjacentHTML('beforeend',row());updateTotal(button.closest('form'));return;}
    if(action==='remove-item'){const el=button.closest('[data-quote-item]'),p=el?.parentElement;
      if(p?.children.length>1){el.remove();updateTotal(button.closest('form'));}return;}
    const ws=getWorkspace();if(!ws)return;
    if(action==='view-job'){location.hash='#jobs';return;}
    if(isReadOnly())return toast('Your trial has ended. Estimates are read-only.',true);
    if(action==='new'||action==='edit'){editQuote(ws,id);return;}
    if(action==='convert'){const q=ws.quotes.find(x=>x.id===id);if(q)convertDialog(q,ws);return;}
    if(working)return;
    if(action==='share'&&!confirm('Create a private approval link? The estimate becomes read-only. No email is sent automatically.'))return;
    if(action==='delete'&&!confirm('Permanently delete this estimate? Existing jobs remain safe.'))return;
    if(!['share','copy','delete'].includes(action))return;
    working=true;button.disabled=true;
    try{
      if(action==='share'){const result=await API.sendQuote(id);await refresh();shareDialog(result.url);toast('Approval link created. Nothing was emailed.');}
      else if(action==='copy'){const result=await API.quoteLink(id);shareDialog(result.url);}
      else {await API.deleteQuote(id);await refresh();toast('Estimate deleted.');}
    }catch(error){toast(error.message||'Could not complete estimate action.',true);}
    finally{working=false;button.disabled=false;}
  });
  document.addEventListener('input',event=>{
    if(event.target.matches('[data-quote-field]'))updateTotal(event.target.closest('form'));
  });
  document.addEventListener('submit',async event=>{
    const form=event.target.closest('[data-quote-form]');if(!form)return;
    event.preventDefault();if(working||isReadOnly())return;
    working=true;
    const submit=form.querySelector('[type=submit]'),err=form.querySelector('.quotes-error');
    submit.disabled=true;err.hidden=true;
    try{
      const data=Object.fromEntries(new FormData(form));
      if(form.dataset.quoteForm==='edit'){
        data.items=[...form.querySelectorAll('[data-quote-item]')].map(it=>{
          const value=k=>it.querySelector('[data-quote-field="'+k+'"]').value.trim();
          return {description:value('description'),qty:Number(value('qty')),rate:Number(value('rate'))};
        });
        if(data.items.some(i=>!i.description))throw Error('Enter a description for every line item.');
        if(data.items.reduce((s,i)=>s+i.qty*i.rate,0)<=0)throw Error('An estimate needs a total greater than zero.');
        if(form.dataset.quoteId)await API.updateQuote(form.dataset.quoteId,data);
        else await API.createQuote(data);
        close();await refresh();toast('Estimate draft saved.');
      }else{
        if(data.startAt>=data.endAt)throw Error('The end time must be after the start time.');
        const result=await API.convertQuote(form.dataset.quoteId,data);
        close();await refresh();toast('Approved estimate converted to a scheduled job.');
        location.hash='#jobs';
      }
    }catch(error){err.textContent=error.message||'Please review the form.';err.hidden=false;}
    finally{working=false;submit.disabled=false;}
  });
}
