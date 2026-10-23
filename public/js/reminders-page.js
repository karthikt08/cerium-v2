import {escapeHTML as esc} from './workspace-model.js';
import {businessLocalDateTime,businessLocalToInstant,US_TIME_ZONES} from './us-market.js';

const labels={
  scheduled:'Scheduled',sending:'Sending',sent:'Sent',cancelled:'Cancelled',
  skipped:'Skipped',review:'Needs review',
};
const fmtDate=(s,timeZone='')=>{
  const d=new Date(s);
  return Number.isFinite(d.getTime())?d.toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',...(timeZone?{timeZone}:{})}):'—';
};
export function renderRemindersPage(ws,readOnly=false){
  const reminders=ws.reminders||[];
  const used=new Set(reminders.map(r=>String(r.invoiceId)));
  const eligible=(ws.invoices||[]).filter(i=>
    ['Sent','Overdue'].includes(i.status)&&i.customerEmail&&Number(i.total)>0&&!used.has(String(i.id)));
  const pending=reminders.filter(r=>r.status==='scheduled').length;
  const review=reminders.filter(r=>r.status==='review').length;
  const optouts=new Set((ws.reminderOptouts||[]).map(x=>x.email));
  const timeZone=ws.account?.timeZone||'';
  const defaultTime=businessLocalDateTime(timeZone,new Date(Date.now()+3*86400000));
  return '<div class="reminders-view">'+
    '<div class="page-heading"><div><p class="eyebrow">CUSTOMER COMMUNICATION</p><h1>Payment reminders</h1>'+
    '<p class="page-description">Schedule considerate invoice follow-ups that stop when an invoice is paid or a customer opts out.</p></div></div>'+
    '<div class="reminders-stats"><div><strong>'+pending+'</strong><span>Scheduled</span></div>'+
    '<div><strong>'+reminders.filter(r=>r.status==='sent').length+'</strong><span>Sent</span></div>'+
    '<div><strong>'+review+'</strong><span>Needs review</span></div></div>'+
    '<div class="notice"><div><strong>Controlled delivery</strong><p>Messages are only sent if your server has live SMTP enabled. Each reminder requires your approval and confirmation of customer consent. Emails are never automatically enabled when you deploy CERIUM.</p></div></div>'+
    '<div class="reminders-columns"><section class="panel"><div class="reminders-heading"><h2>Schedule a reminder</h2><p>One approved reminder per invoice. Draft and paid invoices cannot be reminded.</p></div>'+
    (readOnly?'<p class="reminders-info">Your trial has ended. Existing reminders remain visible, but you cannot schedule new ones.</p>':
      '<form id="reminder-form" class="reminders-form">'+
      '<label>Sent invoice<select name="invoiceId" required><option value="">Choose an invoice</option>'+
        eligible.map(i=>'<option value="'+esc(i.id)+'" '+(optouts.has(i.customerEmail.trim().toLowerCase())?'disabled':'')+'>'+
          '#'+esc(i.id)+' — '+esc(i.customerName)+' ('+esc(i.customerEmail)+')</option>').join('')+
      '</select></label>'+
      '<label>Reminder time ('+esc(timeZone?((timeZone==='Asia/Kolkata'?'India Standard Time':US_TIME_ZONES[timeZone])||'business local time'):'your device local time')+')<input name="dueAt" type="datetime-local" value="'+defaultTime+'" required></label>'+
      '<label class="reminders-check"><input name="consentConfirmed" type="checkbox" required><span>I confirm this customer agreed to receive invoice reminders by email.</span></label>'+
      '<label class="reminders-check"><input name="approved" type="checkbox" required><span>I approve scheduling this payment reminder.</span></label>'+
      '<p class="reminders-info">No SMS, bulk email campaigns, or automatic payment charges. If an invoice is marked paid before dispatch, the reminder is skipped.</p>'+
      '<p class="reminders-error" role="alert" hidden></p>'+
      '<button class="button primary" type="submit" '+(eligible.some(i=>!optouts.has(i.customerEmail.trim().toLowerCase()))?'':'disabled')+'>Schedule reminder</button></form>')+
      '</section><section class="panel"><div class="reminders-heading"><h2>Delivery queue</h2><p>Every reminder is stored durably, even across server restarts.</p></div>'+
        (reminders.length?'<div class="reminders-list">'+reminders.map(r=>
          '<div class="reminder-row"><div><strong>Invoice #'+esc(r.invoiceId)+'</strong>'+
          '<span>'+esc(r.email)+'</span><small>'+esc(fmtDate(r.dueAt,timeZone))+'</small>'+
          (r.error?'<small class="reminders-error-text">'+esc(r.error)+'</small>':'')+'</div>'+
          '<div class="reminder-row-actions"><span class="reminder-status">'+esc(labels[r.status]||r.status)+'</span>'+
          (r.status==='scheduled'&&!readOnly?'<button class="button secondary" data-reminder-cancel="'+esc(r.id)+'" type="button">Cancel</button>':'')+
          '</div></div>').join('')+'</div>':'<div class="jobs-empty">No reminders scheduled yet.</div>')+
      '</section></div>'+
    '</div>';
}
export function initializeRemindersUI({API,refresh,getWorkspace,toast,isReadOnly}){
  document.addEventListener('submit',event=>{
    if(event.target.id!=='reminder-form')return;
    event.preventDefault();
    if(isReadOnly())return toast('Trial ended — reminders are read-only.',true);
    const form=event.target;
    const error=form.querySelector('.reminders-error');
    const btn=form.querySelector('[type=submit]');
    if(btn.disabled)return;
    btn.disabled=true;error.hidden=true;
    (async()=>{
      const values=Object.fromEntries(new FormData(form));
      const timeZone=getWorkspace()?.account?.timeZone||'';
      const dueAt=businessLocalToInstant(values.dueAt,timeZone);
      const payload={
        invoiceId:values.invoiceId,dueAt,
        consentConfirmed:form.elements.consentConfirmed.checked,
        approved:form.elements.approved.checked,
      };
      await API.createReminder(payload);
      await refresh();
      toast('Reminder scheduled and awaiting delivery.');
    })().catch(err=>{error.textContent=err.message;error.hidden=false;})
      .finally(()=>{btn.disabled=false;});
  });
  document.addEventListener('click',event=>{
    const btn=event.target.closest('[data-reminder-cancel]');if(!btn)return;
    if(isReadOnly())return toast('Trial ended — reminders are read-only.',true);
    if(!confirm('Cancel this payment reminder?'))return;
    btn.disabled=true;
    (async()=>{await API.cancelReminder(btn.dataset.reminderCancel);await refresh();toast('Reminder cancelled.');})()
      .catch(e=>{btn.disabled=false;toast(e.message,true);});
  });
}
