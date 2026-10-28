// Manual custom payment dues: separate from invoice settlement and reminder dispatch.
import {escapeHTML as esc,money,dateLabel} from './workspace-model.js';
import {openPaymentDueImport} from './payment-due-import-ui.js';
import {businessLocalDate} from './us-market.js';

const renderStatus=(due,today)=>due.status==='Settled'?'Settled':due.dueDate<today?'Overdue':due.dueDate===today?'Due today':'Upcoming';

export function renderPaymentDuesPage(ws,readOnly=false,subview='all'){
  const dues=ws.paymentDues||[],today=businessLocalDate(ws.account?.timeZone);
  const outstanding=dues.filter(d=>d.status==='Open');
  const overdue=outstanding.filter(d=>d.dueDate<today);
  const dueToday=outstanding.filter(d=>d.dueDate===today);
  const currency=ws.account?.currency||'USD';
  const sum=rows=>money(rows.filter(d=>d.currency===currency).reduce((n,d)=>n+Number(d.amount),0),currency);

  const displayRows=subview==='tracking'?
    outstanding.sort((a,b)=>a.dueDate.localeCompare(b.dueDate)):
    dues;

  const rows=displayRows.map(d=>{
    const status=renderStatus(d,today),name=esc(d.customerName),label=esc(d.description);
    return '<div class="due-row" data-due-row="'+esc(d.id)+'">'+
      '<div class="due-row-main"><strong>'+name+'</strong><span>'+label+'</span>'+
      (d.reference?'<small>Ref: '+esc(d.reference)+'</small>':'')+
      (d.notes?'<small>'+esc(d.notes)+'</small>':'')+'</div>'+
      '<div class="due-row-amount"><strong>'+esc(money(d.amount,d.currency))+'</strong><span>Due '+esc(dateLabel(d.dueDate))+'</span></div>'+
      '<span class="due-status'+(status==='Overdue'?' overdue':'')+'">'+esc(status)+'</span>'+
      (readOnly?'': '<div class="due-row-actions">'+
        '<button type="button" class="button secondary" data-due-edit="'+esc(d.id)+'">Edit</button>'+
        '<button type="button" class="button secondary" data-due-status="'+esc(d.id)+'">'+(d.status==='Settled'?'Reopen':'Mark settled')+'</button>'+
        '<button type="button" class="text-button due-delete" data-due-delete="'+esc(d.id)+'">Delete</button>'+
      '</div>')+'</div>';
  }).join('');

  const subviewExtra=subview==='tracking'?`
    <section class="panel" style="margin-bottom:24px">
      <div class="panel-header"><div class="panel-title"><h2>Flexible due-date tracking</h2></div><span class="badge blue">Timeline View</span></div>
      <div class="settings-content">
        <p class="muted">Track custom commitments by urgency. Flexible due dates allow contractors to manage staggered deposits, progress billing checkpoints, and multi-stage client promises.</p>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-top:16px">
          <div class="report-stat" style="border-left:3px solid #e11d48"><span>Overdue dues</span><strong>${overdue.length}</strong><small>${esc(sum(overdue))}</small></div>
          <div class="report-stat" style="border-left:3px solid #f59e0b"><span>Due today</span><strong>${dueToday.length}</strong><small>${esc(sum(dueToday))}</small></div>
          <div class="report-stat" style="border-left:3px solid #3b82f6"><span>Open pipeline</span><strong>${outstanding.length}</strong><small>${esc(sum(outstanding))}</small></div>
        </div>
      </div>
    </section>`:subview==='amounts'?`
    <section class="panel" style="margin-bottom:24px">
      <div class="panel-header"><div class="panel-title"><h2>Custom due amounts &amp; allocation</h2></div><span class="badge purple">Amounts</span></div>
      <div class="settings-content">
        <p class="muted">Record non-standard payment splits such as 50% deposit on contract signing, 25% rough-in completion, and 25% final sign-off. Dues remain distinct from formal invoice accounting.</p>
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:16px">
          <a class="button secondary" href="#billing/payments/ledger">Open Payment Ledger &amp; Allocation &rarr;</a>
          <button type="button" class="button secondary" data-open-dues-import>Import Bulk Dues &rarr;</button>
        </div>
      </div>
    </section>`:subview==='import'?`
    <section class="panel" style="margin-bottom:24px">
      <div class="panel-header"><div class="panel-title"><h2>Import custom dues</h2></div><span class="badge green">Spreadsheet</span></div>
      <div class="settings-content">
        <p class="muted">Upload your customer dues list in CSV or Excel format. Preview, match columns, and validate records before saving.</p>
        <div style="margin-top:16px">
          <button type="button" class="button primary" data-open-dues-import>Launch Dues Importer &rarr;</button>
        </div>
      </div>
    </section>`:'';

  return '<div class="payment-dues-page" data-payment-dues-page>'+
    '<div class="page-heading"><div><p class="eyebrow">BILLING & PAYMENTS</p><h1>Custom dues</h1>'+
    '<p class="page-description">Record balances, advances or installments that do not fit a standard invoice schedule.</p></div>'+
    (readOnly?'':'<div class="heading-actions"><button type="button" class="button secondary" data-open-dues-import>Import Excel / CSV</button></div>')+'</div>'+
    '<div class="due-summary">'+
      '<div class="due-summary-card"><span>Open dues</span><strong>'+outstanding.length+'</strong><small>'+esc(sum(outstanding))+' in '+esc(currency)+'</small></div>'+
      '<div class="due-summary-card"><span>Overdue dues</span><strong>'+overdue.length+'</strong><small>'+esc(sum(overdue))+' in '+esc(currency)+'</small></div>'+
      '<div class="due-summary-card"><span>Settled records</span><strong>'+dues.filter(d=>d.status==='Settled').length+'</strong><small>Manually confirmed only</small></div></div>'+
    subviewExtra+
    '<div class="due-layout">'+
      '<section class="panel due-editor"><div class="panel-header"><div class="panel-title"><h2>Add a payment due</h2></div>'+
      '<p class="panel-subtitle">One amount and due date per record. Add more records for installments.</p></div>'+
      '<div class="panel-body">'+
        (readOnly?'<p class="notice">This workspace is read-only. Your saved dues remain visible.</p>':
        '<form id="custom-due-form" class="due-form">'+
          '<input type="hidden" name="id" value="">'+
          '<div class="form-grid">'+
          '<label class="field">Customer / party <input type="text" name="customerName" maxlength="120" required autocomplete="organization"></label>'+
          '<label class="field">Amount ('+esc(currency)+') <input type="number" name="amount" min="0.01" max="100000000" step="0.01" required></label>'+
          '<label class="field">Due date <input type="date" name="dueDate" value="'+esc(today)+'" required></label>'+
          '<label class="field">Reference (optional) <input type="text" name="reference" maxlength="100" placeholder="External invoice or order number"></label>'+
          '<label class="field full">What is this due for? <input type="text" name="description" maxlength="180" required placeholder="Advance, second installment, unpaid balance..."></label>'+
          '<label class="field full">Notes (optional) <textarea name="notes" maxlength="1200" rows="3"></textarea></label>'+
          '</div><p class="due-note">A due is a manual record only; it does not send a reminder, charge a customer or update an invoice.</p>'+
          '<p class="form-error" id="due-error" role="alert" hidden></p>'+
          '<div class="due-form-actions"><button class="button secondary" type="button" data-due-cancel hidden>Cancel edit</button>'+
          '<button class="button primary" type="submit" data-due-submit>Save due</button></div></form>')+
      '</div></section>'+
      '<section class="panel due-register"><div class="panel-header"><div class="panel-title"><h2>Due register</h2></div>'+
      '<p class="panel-subtitle">These records are not proof that a payment was received.</p></div>'+
      '<div class="panel-body"><p class="due-count">'+dues.length+' '+(dues.length===1?'record':'records')+'</p>'+
      (rows||'<div class="due-empty">No custom dues recorded. Add an advance, installment or other amount due to get started.</div>')+
      '</div></section></div>'+
    '<p class="due-footer">Dues remain separate from your invoice totals and bank matches. Confirm actual receipt before marking a due settled.</p>'+
  '</div>';
}

export function initializePaymentDuesUI({root,api,getWorkspace,readOnly,refresh,toast}){
  const page=root.querySelector('[data-payment-dues-page]');
  if(!page)return;
  const form=page.querySelector('#custom-due-form'),err=page.querySelector('#due-error');
  const fail=message=>{if(!err)return;err.textContent=message;err.hidden=false;};
  const reset=()=>{
    if(!form)return;
    form.reset();form.elements.namedItem('id').value='';
    const today=businessLocalDate(getWorkspace()?.account?.timeZone);
    form.elements.namedItem('dueDate').value=today;
    page.querySelector('[data-due-submit]').textContent='Save due';
    page.querySelector('[data-due-cancel]').hidden=true;
    if(err){err.hidden=true;err.textContent='';}
  };
  if(form)form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(readOnly())return;
    if(err)err.hidden=true;
    const data=Object.fromEntries(new FormData(form)),id=data.id;
    delete data.id;
    const save=page.querySelector('[data-due-submit]');
    save.disabled=true;
    try{
      if(id)await api.updatePaymentDue(id,data);
      else await api.createPaymentDue(data);
      await refresh();
      toast(id?'Payment due updated.':'Payment due saved.');
    }catch(error){fail(error.message||'Could not save payment due.');}
    finally{save.disabled=false;}
  });
  page.addEventListener('click',async event=>{
    if(event.target.closest('[data-open-dues-import]')){
      if(readOnly())return;
      try{openPaymentDueImport({api,onComplete:refresh,readOnly:readOnly()});}
      catch(error){toast(error.message||'Cannot open the importer.',true);}
      return;
    }
    if(event.target.closest('[data-due-cancel]')){reset();return;}
    const edit=event.target.closest('[data-due-edit]');
    if(edit&&form&&!readOnly()){
      const item=getWorkspace().paymentDues.find(d=>d.id===edit.dataset.dueEdit);
      if(!item)return;
      for(const key of ['id','customerName','amount','dueDate','reference','description','notes']){
        form.elements.namedItem(key).value=key==='id'?item.id:item[key]??'';
      }
      page.querySelector('[data-due-submit]').textContent='Save changes';
      page.querySelector('[data-due-cancel]').hidden=false;
      form.elements.namedItem('customerName').focus();
      if(err)err.hidden=true;
      return;
    }
    const status=event.target.closest('[data-due-status]'),del=event.target.closest('[data-due-delete]');
    if((!status&&!del)||readOnly())return;
    const id=status?.dataset.dueStatus||del.dataset.dueDelete;
    const item=getWorkspace()?.paymentDues?.find(d=>d.id===id);
    if(!item)return;
    const changing=Boolean(status);
    const next=changing?(item.status==='Open'?'Settled':'Open'):null;
    const prompt=changing?
      (next==='Settled'?'Confirm you actually received '+money(item.amount,item.currency)+' from '+item.customerName+'? This will NOT update an invoice or initiate payment.':'Reopen this payment due as unpaid?'):
      'Delete this custom due for '+item.customerName+'? This cannot be undone.';
    if(!window.confirm(prompt))return;
    const button=status||del;button.disabled=true;
    try{
      if(changing)await api.setPaymentDueStatus(id,{status:next,confirmed:true});
      else await api.deletePaymentDue(id);
      await refresh();
      toast(changing?'Payment due status updated.':'Payment due deleted.');
    }catch(error){toast(error.message||'Could not update the payment due.',true);}
    finally{button.disabled=false;}
  });
}
