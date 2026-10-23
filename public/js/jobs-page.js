// CERIUM Jobs & Dispatch — no calendar, SMS, or location provider required.
import {escapeHTML as esc} from './workspace-model.js';

let weekShift = 0;
let filter = 'all';
let dispatch = null;
let busy = false;
const statuses = ['Scheduled','Confirmed','In progress','Completed','Cancelled'];
const dayFmt = new Intl.DateTimeFormat('en-US',{weekday:'short',month:'short',day:'numeric'});
const longFmt = new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric'});
const dateAt = v => new Date(v+'T12:00:00');
const isoDay = v => `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}-${String(v.getDate()).padStart(2,'0')}`;
const today = () => isoDay(new Date());
const monday = () => { const d=dateAt(today());d.setDate(d.getDate()-((d.getDay()+6)%7)+weekShift*7);return d;};
const hour = v => v?.slice(11,16) || '—';
const dateTime = v => v ? `${longFmt.format(dateAt(v.slice(0,10)))} · ${hour(v)}` : 'Unscheduled';
const workerName = (ws,id) => ws.crew?.find(c=>c.id===id)?.name || 'Unassigned';
const statusClass = s => ({Scheduled:'blue',Confirmed:'purple','In progress':'orange',Completed:'green',Cancelled:'gray'})[s]||'blue';
const safeData = s => esc(s||'');
function billingItemRow(item={description:'',qty:1,rate:0},locked=false) {
  return `<div class="job-billing-row" data-job-billing-row>
    <label>Description<input data-billing-field="description" maxlength="180" ${locked?'disabled':''} value="${esc(item.description)}" placeholder="Labor, materials..."></label>
    <label>Qty<input data-billing-field="qty" type="number" ${locked?'disabled':''} min="0.01" max="10000" step="0.01" value="${esc(item.qty)}"></label>
    <label>Rate<input data-billing-field="rate" type="number" ${locked?'disabled':''} min="0" max="1000000" step="0.01" value="${esc(item.rate)}"></label>
    <button type="button" class="button secondary" data-job-action="remove-item" ${locked?'disabled':''} aria-label="Remove item">×</button>
  </div>`;
}
function updateJobBillingTotal(form){
  if(!form)return;
  const amount=[...form.querySelectorAll('[data-job-billing-row]')].reduce((sum,row)=>{
    const number=key=>Number(row.querySelector('[data-billing-field="'+key+'"]')?.value||0);
    return sum+number('qty')*number('rate');
  },0);
  const currency=dispatch?.getWorkspace()?.account?.currency||'USD';
  const target=form.querySelector('[data-job-billing-total]');
  if(target)target.textContent=new Intl.NumberFormat('en-US',{style:'currency',currency:currency==='INR'?'INR':'USD'}).format(amount);
}
const active = j => j.status !== 'Cancelled' && j.status !== 'Completed';
const selectOptions = (options,selected) => options.map(x=>`<option value="${safeData(x.value)}" ${x.value===selected?'selected':''}>${esc(x.label)}</option>`).join('');
function dayHeader(d) {return `<span>${dayFmt.format(d)}</span><strong>${d.getDate()}</strong>`;}
function card(job,ws,ro=false) {
  return `<button type="button" data-job-action="edit" data-job-id="${esc(job.id)}" class="job-tile ${statusClass(job.status)}" ${ro?'disabled title="Trial ended — read-only"':''}>
    <span class="job-tile-time">${hour(job.startAt)}–${hour(job.endAt)}</span>
    <strong>${esc(job.title)}</strong><span>${esc(job.customerName)}</span>
    <small>${esc(workerName(ws,job.workerId))}</small></button>`;
}
export function renderJobsPage(ws,readOnly=false) {
  const jobs=ws.jobs||[],crew=ws.crew||[],start=monday(),end=new Date(start);end.setDate(start.getDate()+6);
  const week=[];for(let i=0;i<7;i++){const d=new Date(start);d.setDate(start.getDate()+i);week.push(d);}
  const selected=jobs.filter(j=>filter==='all'?true:filter==='unassigned'?!j.workerId:filter==='active'?active(j):j.status===filter);
  const upcoming=selected.filter(j=>j.startAt.slice(0,10)>=today()).slice(0,12);
  const weekJobs=selected.filter(j=>j.startAt.slice(0,10)>=isoDay(start)&&j.startAt.slice(0,10)<=isoDay(end));
  const count=jobs.filter(j=>j.startAt.slice(0,10)===today()&&active(j)).length;
  const assigned=weekJobs.filter(j=>j.workerId).length;
  const open=jobs.filter(j=>active(j)&&!j.workerId).length;
  return `<div class="jobs">
    <div class="page-heading"><div><p class="eyebrow">FIELD OPERATIONS</p><h1>Jobs & dispatch</h1><p class="page-description">Plan the week, assign your crew, and keep every job on track.</p></div>
      <div class="heading-actions"><button class="button secondary" data-job-action="crew">Manage crew</button><button class="button primary" data-job-action="new" ${readOnly?'disabled':''}>+ Schedule a job</button></div></div>
    <div class="jobs-stats">
      <div class="jobs-stat"><span>Jobs today</span><strong>${count}</strong><small>Active appointments</small></div>
      <div class="jobs-stat"><span>Assigned this week</span><strong>${assigned}</strong><small>${weekJobs.length} jobs on the board</small></div>
      <div class="jobs-stat"><span>Awaiting assignment</span><strong>${open}</strong><small>Active jobs without crew</small></div>
      <div class="jobs-stat"><span>Available crew</span><strong>${crew.filter(c=>c.active).length}</strong><small>Active crew members</small></div>
    </div>
    <section class="panel jobs-panel">
      <div class="jobs-tools">
        <div><h2>Weekly schedule</h2><p>${longFmt.format(start)} – ${longFmt.format(end)}, ${end.getFullYear()}</p></div>
        <div class="jobs-tools-actions"><select data-jobs-filter aria-label="Filter jobs">${selectOptions([
          {value:'all',label:'All jobs'},{value:'active',label:'Active jobs'},{value:'unassigned',label:'Unassigned'},
          ...statuses.map(x=>({value:x,label:x}))],filter)}</select>
          <button class="button secondary" data-job-action="previous" aria-label="Previous week">←</button>
          <button class="button secondary" data-job-action="today">Today</button>
          <button class="button secondary" data-job-action="next" aria-label="Next week">→</button></div>
      </div>
      <div class="job-calendar" role="region" aria-label="Weekly schedule" tabindex="0">
        ${week.map(d=>{const key=isoDay(d),dayJobs=weekJobs.filter(j=>j.startAt.slice(0,10)===key);
          return `<div class="job-day ${key===today()?'job-current':''}"><div class="job-day-top">${dayHeader(d)}<span class="job-day-count">${dayJobs.length}</span></div>
            <div class="job-day-items">${dayJobs.map(j=>card(j,ws,readOnly)).join('')||'<p class="job-day-empty">No jobs</p>'}</div>
            ${readOnly?'':`<button class="job-day-add" data-job-action="new" data-job-date="${key}" aria-label="Schedule on ${key}">+ Add</button>`}</div>`}).join('')}
      </div>
    </section>
    <div class="jobs-bottom">
      <section class="panel"><div class="jobs-section-head"><h2>Upcoming jobs</h2><span>${upcoming.length} shown</span></div>
        ${upcoming.length? `<div class="jobs-upcoming">${upcoming.map(j=>`<div class="jobs-upcoming-row">
          <div class="jobs-upcoming-date"><strong>${dateAt(j.startAt.slice(0,10)).getDate()}</strong><span>${longFmt.format(dateAt(j.startAt.slice(0,10))).split(' ')[0]}</span></div>
          <div class="jobs-upcoming-info"><strong>${esc(j.title)}</strong><span>${esc(j.customerName)} · ${dateTime(j.startAt)}</span><small>${esc(workerName(ws,j.workerId))}${j.address?' · '+esc(j.address):''}</small></div>
          <span class="job-status ${statusClass(j.status)}">${esc(j.status)}</span>
          <button class="button secondary" data-job-action="edit" data-job-id="${esc(j.id)}" ${readOnly?'disabled':''}>Details</button>
          </div>`).join('')}</div>` : '<div class="jobs-empty">No upcoming jobs. Schedule one to start organizing your work.</div>'}
      </section>
      <section class="panel"><div class="jobs-section-head"><h2>Your crew</h2><button class="button secondary" data-job-action="crew">Manage</button></div>
      ${crew.filter(c=>c.active).length?`<div class="jobs-crew-preview">${crew.filter(c=>c.active).map(c=>`<div class="jobs-crew-person"><span class="jobs-crew-avatar">${esc(c.name.slice(0,1).toUpperCase())}</span><div><strong>${esc(c.name)}</strong><span>${esc(c.role||'Team member')}</span></div><small>${jobs.filter(j=>j.workerId===c.id&&active(j)).length} active</small></div>`).join('')}</div>`:'<div class="jobs-empty">Add your first crew member to start assigning work.</div>'}
      </section>
    </div>
    ${readOnly?'<p class="jobs-readonly">Trial ended — you can view schedules, but changes require an active plan.</p>':''}
  </div>`;
}
function openDialog(markup) {
  let d=document.querySelector('#cerium-job-dialog');
  if(!d){d=document.createElement('dialog');d.id='cerium-job-dialog';d.className='jobs-dialog';document.body.append(d);}
  d.innerHTML=markup;d.showModal();d.querySelector('input,select,button')?.focus();
}
const dialogTop=(title,detail)=>`<div class="jobs-modal-header"><h2>${title}</h2><p>${detail}</p><button type="button" aria-label="Close" data-job-action="close">×</button></div>`;
function formJob(ws,id='',date=today()) {
  if(dispatch.isReadOnly())return dispatch.toast('Trial ended. Jobs are read-only.',true);
  const j=id?ws.jobs.find(x=>x.id===id):null;
  if(id&&!j)return dispatch.toast('Job not found.',true);
  const items = j?.billableItems?.length ? j.billableItems : [{description:'Service labor',qty:1,rate:0}];
  const start=j?.startAt||date+'T09:00',end=j?.endAt||date+'T10:00';
  const workers=[{value:'',label:'Unassigned'},...ws.crew.filter(c=>c.active||c.id===j?.workerId).map(c=>({value:c.id,label:c.name+(c.active?'':' (archived)')}))];
  const leadOpts=[{value:'',label:'No linked lead'},...ws.leads.map(l=>({value:l.id,label:l.name}))];
  openDialog(`${dialogTop(j?'Edit job':'Schedule a job','Set the appointment, assign a team member, and save the details.')}
    <form data-job-form="job" data-job-id="${esc(j?.id||'')}"><div class="jobs-modal-body">
    <label>Job title<input name="title" required maxlength="120" value="${esc(j?.title||'')}" placeholder="e.g. AC service & repair"></label>
    <label>Customer name<input name="customerName" required maxlength="120" value="${esc(j?.customerName||'')}" placeholder="Customer or business name"></label>
    <label>Linked lead<select name="leadId">${selectOptions(leadOpts,j?.leadId||'')}</select></label>
    <label>Assigned crew<select name="workerId">${selectOptions(workers,j?.workerId||'')}</select></label>
    <label>Start time<input name="startAt" type="datetime-local" required value="${esc(start)}"></label>
    <label>End time<input name="endAt" type="datetime-local" required value="${esc(end)}"></label>
    <label>Status<select name="status">${selectOptions(statuses.map(s=>({value:s,label:s})),j?.status||'Scheduled')}</select></label>
    <label>Customer phone<input name="customerPhone" type="tel" maxlength="40" value="${esc(j?.customerPhone||'')}" placeholder="Optional"></label>
    <label class="jobs-wide">Job address<input name="address" maxlength="240" value="${esc(j?.address||'')}" placeholder="Service location"></label>
    <label class="jobs-wide">Notes<textarea name="notes" maxlength="1500" rows="3" placeholder="Access instructions, equipment, materials...">${esc(j?.notes||'')}</textarea></label>
    <div class="jobs-billing jobs-wide"><div class="jobs-billing-header"><strong>Invoice line items</strong><span>Saved with this job and used to prepare its draft invoice on completion.</span></div>
      <div data-billing-rows>${items.map(item=>billingItemRow(item,!!j?.invoiceGenerated)).join('')}</div>
      <button type="button" class="button secondary" data-job-action="add-item" ${j?.invoiceGenerated?'disabled':''}>+ Add line item</button><strong class="jobs-billing-total">Estimated total: <span data-job-billing-total>—</span></strong>
      <p class="muted">${j?.invoiceGenerated?'Billing items have been copied to an invoice. Edit its line items in Invoices instead.':'Set quantities and rates before completing the job. Zero-value drafts require pricing before being marked sent.'}</p>
    </div>
    ${j?.invoiceId ? `<p class="jobs-linked-invoice jobs-wide">Invoice prepared: <strong>#${esc(j.invoiceId)}</strong> · <button type="button" class="button secondary" data-job-action="invoice" data-invoice-id="${esc(j.invoiceId)}">Review invoice →</button></p>` : j?.invoiceGenerated ? '<p class="jobs-linked-invoice jobs-wide">The original draft invoice was deleted. It will not be generated again automatically.</p>' : ''}
    <p class="jobs-form-error" role="alert" hidden></p></div>
    <div class="jobs-modal-actions">${j?'<button type="button" class="button secondary" data-job-action="delete" data-job-id="'+esc(j.id)+'">Delete job</button>':''}
    <button type="button" class="button secondary" data-job-action="close">Cancel</button><button type="submit" class="button primary">${j?'Save changes':'Schedule job'}</button></div>
    </form>`);
  updateJobBillingTotal(document.querySelector('#cerium-job-dialog [data-job-form="job"]'));
  const lead=document.querySelector('#cerium-job-dialog [name=leadId]');
  lead?.addEventListener('change',()=>{
    const v=ws.leads.find(x=>x.id===lead.value);if(!v)return;
    const f=lead.closest('form');if(!f.elements.customerName.value)f.elements.customerName.value=v.name;
    if(!f.elements.customerPhone.value)f.elements.customerPhone.value=v.phone||'';
    if(!f.elements.address.value)f.elements.address.value=v.address||'';
  });
}
function formCrew(ws) {
  openDialog(`${dialogTop('Manage crew','Keep an organized roster for job assignments.')}
    <div class="jobs-modal-body"><div class="jobs-crew-list">${(ws.crew||[]).map(c=>`<div class="jobs-crew-item"><strong>${esc(c.name)}</strong><small>${esc(c.role||'Team member')}${c.active?'':' · Archived'}</small>${c.active&&!dispatch.isReadOnly()?`<button type="button" class="button secondary" data-job-action="archive" data-worker-id="${esc(c.id)}">Archive</button>`:''}</div>`).join('')||'<p>No team members yet.</p>'}</div>
    ${dispatch.isReadOnly()?'':`<form data-job-form="crew" class="jobs-add-crew"><label>Name<input name="name" required maxlength="100" placeholder="Crew member name"></label><label>Role<input name="role" maxlength="80" placeholder="Technician, electrician..."></label><label>Phone (optional)<input name="phone" maxlength="40"></label><p class="jobs-form-error" role="alert" hidden></p><button type="submit" class="button primary">Add crew member</button></form>`}
    </div><div class="jobs-modal-actions"><button class="button secondary" data-job-action="close">Done</button></div>`);
}
export function initializeJobsUI({API,refresh,getWorkspace,isReadOnly,toast}) {
  dispatch={API,refresh,getWorkspace,isReadOnly,toast};
  document.addEventListener('click',async event=>{
    const el=event.target.closest('[data-job-action]');if(!el)return;
    const action=el.dataset.jobAction;const ws=getWorkspace();if(!ws)return;
    if(action==='previous'||action==='next'||action==='today') {
      weekShift=action==='today'?0:weekShift+(action==='previous'?-1:1);
      await refresh();return;
    }
    if(action==='close'){el.closest('dialog')?.close();return;}
    if(action==='crew'){formCrew(ws);return;}
    if(action==='invoice'){
      el.closest('dialog')?.close();
      const id=el.dataset.invoiceId;
      document.dispatchEvent(new CustomEvent('cerium:open-invoice',{detail:{id}}));
      return;
    }
    if(action==='add-item'){
      const parent=el.closest('form')?.querySelector('[data-billing-rows]');
      if(parent && parent.children.length<20) {parent.insertAdjacentHTML('beforeend',billingItemRow());updateJobBillingTotal(parent.closest('form'));}
      else toast('Maximum 20 billing items.',true);
      return;
    }
    if(action==='remove-item'){
      const row=el.closest('[data-job-billing-row]'),parent=row?.parentElement;
      if(parent?.children.length>1){row.remove();updateJobBillingTotal(parent.closest('form'));}
      else toast('Keep at least one line item.',true);
      return;
    }
    if(isReadOnly())return toast('Your trial has ended. Business records are read-only.',true);
    if(action==='new'||action==='edit')return formJob(ws,el.dataset.jobId||'',el.dataset.jobDate||today());
    if(busy)return;
    if(action==='archive') {
      if(!confirm('Archive this crew member? Active jobs must be reassigned first.'))return;
      busy=true;try{await API.archiveCrew(el.dataset.workerId);await refresh();formCrew(getWorkspace());toast('Crew member archived.');}catch(err){toast(err.message,true);}finally{busy=false;}return;
    }
    if(action==='delete') {
      if(!confirm('Permanently delete this job?'))return;
      busy=true;try{await API.deleteJob(el.dataset.jobId);el.closest('dialog')?.close();await refresh();toast('Job deleted.');}catch(err){toast(err.message,true);}finally{busy=false;}
    }
  });
  document.addEventListener('input',event=>{if(event.target.matches('[data-billing-field]'))updateJobBillingTotal(event.target.closest('form'));});
  document.addEventListener('change',event=>{
    if(event.target.matches('[data-jobs-filter]')){filter=event.target.value;refresh().catch(e=>toast(e.message,true));}
  });
  document.addEventListener('submit',async event=>{
    const form=event.target.closest('[data-job-form]');if(!form)return;
    event.preventDefault();if(busy)return;
    if(isReadOnly())return toast('Trial ended. Changes are locked.',true);
    busy=true;const error=form.querySelector('.jobs-form-error'),submit=form.querySelector('[type=submit]');
    if(submit)submit.disabled=true;
    try{
      const data=Object.fromEntries(new FormData(form));
      if(form.dataset.jobForm==='job') {
        data.billableItems=[...form.querySelectorAll('[data-job-billing-row]')].map(row=>{
          const val=key=>row.querySelector('[data-billing-field="'+key+'"]').value.trim();
          return {description:val('description'),qty:Number(val('qty')),rate:Number(val('rate'))};
        }).filter(row=>row.description || row.rate);
        if(data.billableItems.some(item=>!item.description))throw Error('Enter a description for each priced line item.');
        if(data.endAt<=data.startAt)throw Error('The end time must be after the start time.');
        if(form.dataset.jobId)await API.updateJob(form.dataset.jobId,data);else await API.createJob(data);
      }else await API.addCrew(data);
      const type=form.dataset.jobForm;
      form.closest('dialog')?.close();await refresh();
      if(type==='crew')formCrew(getWorkspace());
      toast(type==='crew'?'Crew member added.':data.status==='Completed'?'Job completed. An invoice draft is ready to review.':'Job saved.');
    }catch(e){if(error){error.textContent=e.message;error.hidden=false;}else toast(e.message,true);}
    finally{busy=false;if(submit)submit.disabled=false;}
  });
}
