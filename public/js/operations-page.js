import {OPERATION_FIELDS} from './operation-fields.js';
import {escapeHTML as esc} from './workspace-model.js';
import {businessLocalDateTime,businessLocalDate} from './us-market.js';

export function renderOperations(ws,kind,readOnly=false,view=''){
  const schema=OPERATION_FIELDS[kind],all=ws.operations?.[kind]||[];
  const records=view==='attendance'?all.filter(r=>!r.endAt):all;
  const now=businessLocalDateTime(ws.account.timeZone),defaults={startAt:now,date:businessLocalDate(ws.account.timeZone),currency:ws.account.currency,breakMinutes:0,body:'Hello {customer}, a friendly reminder for invoice #{invoice}, {amount}, due {dueDate}. Thank you.'};
  const input=([key,label,type,required])=>{
    const attrs=`name="${key}" ${required?'required':''}`;
    const choices=type==='crew'?(ws.crew||[]).map(c=>[c.id,c.name+(c.active?'':' (archived)')]):type==='job'?(ws.jobs||[]).map(j=>[j.id,j.title]):type.includes('|')?type.split('|').map(v=>[v,v]):null;
    const control=choices?`<select ${attrs}><option value="">Choose…</option>${choices.map(([v,l])=>`<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select>`:type==='textarea'?`<textarea ${attrs} rows="5" maxlength="3000">${esc(defaults[key]||'')}</textarea>`:`<input ${attrs} type="${type}" value="${esc(defaults[key]??'')}" ${type==='number'?'min="0" max="1000000000" step="0.01"':'maxlength="200"'}>`;
    return `<label class="field ${type==='textarea'?'full-width':''}">${esc(label)}${control}</label>`;
  };
  const display=(record,key,type)=>type==='crew'?(ws.crew.find(c=>c.id===record[key])?.name||'Unknown crew'):type==='job'?(ws.jobs.find(j=>j.id===record[key])?.title||'—'):String(record[key]??'—');
  const hours=all.reduce((n,r)=>n+(r.endAt?Math.max(0,(Date.parse(r.endAt+'Z')-Date.parse(r.startAt+'Z'))/36e5-Number(r.breakMinutes||0)/60):0),0);
  return `<div data-operation-kind="${kind}"><div class="page-heading"><div><h1>${view==='attendance'?'Attendance':esc(schema.label)}</h1><p class="page-description">${kind==='availability'?'Record actual availability and absences. Dispatch checks these windows and existing appointments.':kind==='timesheets'?'Record business-local shifts and breaks. Open shifts appear in Attendance; completed shifts contribute to recorded hours.':kind==='templates'?'Save reusable message text. A template is used only when explicitly selected for an approved reminder.':'Manage your saved business records.'}</p></div></div>
    ${kind==='timesheets'?`<div class="notice">${all.filter(r=>!r.endAt).length} open shifts · ${hours.toFixed(2)} recorded hours after breaks. This is recorded time, not payroll.</div>`:''}
    ${readOnly?'':`<section class="panel"><div class="panel-header"><h2>Add or edit ${esc(schema.label.toLowerCase())}</h2></div><form class="settings-content form-grid" id="operation-form-${kind}" data-operation-form><input name="id" type="hidden">${schema.fields.map(input).join('')}<p class="form-error full-width" role="alert" data-operation-error hidden></p><div class="subview-actions full-width"><button class="button primary" type="submit">Save record</button><button class="button secondary" type="reset">New record</button></div></form></section>`}
    <section class="panel"><div class="panel-header"><h2>Saved records</h2><span>${records.length} records</span></div><div class="table-scroll" tabindex="0" role="region" aria-label="${esc(schema.label)} records"><table class="data-table"><thead><tr>${schema.fields.map(([,label])=>`<th scope="col">${esc(label)}</th>`).join('')}<th scope="col">Actions</th></tr></thead><tbody>${records.map(r=>`<tr>${schema.fields.map(([key,,type])=>`<td>${esc(display(r,key,type))}</td>`).join('')}<td>${readOnly?'':`<div class="table-actions"><button class="button secondary" data-operation-edit="${r.id}">Edit</button>${kind==='timesheets'&&!r.endAt?`<button class="button secondary" data-operation-clockout="${r.id}">Clock out</button>`:''}<button class="text-button" data-operation-delete="${r.id}">Delete</button></div>`}</td></tr>`).join('')}</tbody></table>${records.length?'':'<p class="report-note muted">No records in this view.</p>'}</div></section></div>`;
}
export function renderDispatchPlanner(ws,readOnly=false){
  const jobs=(ws.jobs||[]).filter(j=>['Scheduled','Confirmed','In progress'].includes(j.status));
  return `<div data-dispatch-planner><div class="page-heading"><div><h1>Dispatch planning</h1><p class="page-description">Review crew with recorded availability for an appointment. Assignments are saved only when you confirm them.</p></div></div><section class="panel"><form class="settings-content" data-dispatch-form><label class="field">Appointment<select name="jobId" required><option value="">Choose a job</option>${jobs.map(j=>`<option value="${j.id}">${esc(j.title)} · ${esc(j.startAt)}</option>`).join('')}</select></label><div class="subview-actions"><button class="button primary" type="submit">Check available crew</button></div><p role="alert" data-dispatch-error></p></form><div class="settings-content" data-dispatch-results></div></section><p class="muted report-note">Availability is based on saved working windows, absences and job conflicts. Unconfigured crew are never reported as available. Travel routes and live GPS are not connected.</p></div>`;
}
export function initializeOperations({root,ws,api,refresh,readOnly,toast}){
  const holder=root.querySelector('[data-operation-kind]');
  if(holder){
    const kind=holder.dataset.operationKind,form=holder.querySelector('[data-operation-form]');
    form?.addEventListener('submit',async event=>{
      event.preventDefault();if(readOnly())return;
      const button=form.querySelector('[type=submit]'),error=form.querySelector('[data-operation-error]');button.disabled=true;error.hidden=true;
      try{const data=Object.fromEntries(new FormData(form));await api.saveOperation(kind,data.id,data);document.dispatchEvent(new CustomEvent('cerium:form-saved',{detail:{section:'operations'}}));await refresh();toast('Record saved.');}
      catch(err){error.textContent=err.message;error.hidden=false;}finally{button.disabled=false;}
    });
    holder.addEventListener('click',async event=>{
      const edit=event.target.closest('[data-operation-edit]'),del=event.target.closest('[data-operation-delete]'),clock=event.target.closest('[data-operation-clockout]');
      if((!edit&&!del&&!clock)||readOnly())return;
      const id=edit?.dataset.operationEdit||del?.dataset.operationDelete||clock?.dataset.operationClockout,r=(ws.operations[kind]||[]).find(r=>r.id===id);if(!r)return;
      if(edit){for(const field of form.elements)if(field.name&&r[field.name]!==undefined)field.value=r[field.name];form.scrollIntoView({block:'start'});form.querySelector('input:not([type=hidden]),select')?.focus();return;}
      if(del&&!confirm('Delete this saved record?'))return;
      const button=del||clock;button.disabled=true;
      try{if(del)await api.deleteOperation(kind,id);else await api.saveOperation(kind,id,{endAt:businessLocalDateTime(ws.account.timeZone)});await refresh();toast(del?'Record deleted.':'Shift completed.');}catch(err){toast(err.message,true);}finally{button.disabled=false;}
    });
  }
  const planner=root.querySelector('[data-dispatch-planner]');
  planner?.querySelector('form').addEventListener('submit',async event=>{
    event.preventDefault();const form=event.target,error=form.querySelector('[data-dispatch-error]'),out=planner.querySelector('[data-dispatch-results]');error.textContent='';
    try{const jobId=form.elements.jobId.value,rows=await api.dispatchCandidates(jobId);out.innerHTML=rows.map(c=>`<div class="task-row"><div class="row-details"><strong>${esc(c.name)}</strong><span>${esc(c.reason)}</span></div>${c.available&&!readOnly()?`<button class="button secondary" data-dispatch-assign="${esc(c.id)}" data-dispatch-job="${esc(jobId)}">Assign</button>`:''}</div>`).join('')||'<p>No active crew members.</p>';}catch(err){error.textContent=err.message;}
  });
  planner?.addEventListener('click',async event=>{
    const button=event.target.closest('[data-dispatch-assign]');if(!button||readOnly())return;
    if(!confirm('Assign this crew member to the selected appointment?'))return;
    button.disabled=true;try{await api.updateJob(button.dataset.dispatchJob,{workerId:button.dataset.dispatchAssign});await refresh();toast('Assignment saved.');}catch(err){toast(err.message,true);}finally{button.disabled=false;}
  });
}
