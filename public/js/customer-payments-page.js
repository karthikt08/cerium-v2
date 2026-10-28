import {escapeHTML as esc,money} from './workspace-model.js';
import {businessLocalDate} from './us-market.js';
const outstanding=i=>['Sent','Overdue'].includes(i.status)&&Number(i.balance??i.total)>0;
const amountInput=(name,extra='')=>`<input name="${name}" type="number" min="0.0001" max="100000000000" step="0.0001" ${extra}>`;
export function renderCustomerPayments(ws,readOnly=false){
  const rows=ws.customerPayments||[],invoices=ws.invoices.filter(outstanding),currency=ws.account.currency;
  const allocations=()=>`<fieldset class="full-width"><legend>Optional invoice allocations</legend><p class="muted">Amounts left unallocated remain available for later allocation. Verify the customer for each invoice.</p>${invoices.filter(i=>i.currency===currency).map(i=>`<label class="field">#${esc(i.id)} · ${esc(i.customerName)} · ${esc(money(i.balance??i.total,currency))} remaining${amountInput('allocation-'+i.id,`data-allocate-invoice="${esc(i.id)}"`)}</label>`).join('')||'<p>No issued invoices with an outstanding balance.</p>'}</fieldset>`;
  return `<section data-customer-payments><div class="page-heading"><div><h1>Payment ledger</h1><p class="page-description">Record verified customer payments, allocate them to invoices and retain a history of reversals.</p></div></div>
  ${readOnly?'':`<section class="panel"><div class="panel-header"><h2>Record a payment</h2></div><form id="customer-payment-form" class="settings-content form-grid" data-receipt-form>
  <label class="field">Customer<input name="customerName" required maxlength="120"></label><label class="field">Amount (${esc(currency)})${amountInput('amount','required')}</label><label class="field">Received on<input name="paidAt" type="date" required value="${businessLocalDate(ws.account.timeZone)}"></label><label class="field">Unique bank or receipt reference<input name="reference" maxlength="200"></label><label class="field full-width">Notes<textarea name="notes" maxlength="1000"></textarea></label>${allocations()}
  <label class="full-width"><input name="confirmed" type="checkbox" required> I verified receipt of this payment and checked the allocations.</label><p class="form-error full-width" role="alert" data-payment-error hidden></p><button class="button primary" type="submit">Record payment</button></form></section>`}
  <section class="panel"><div class="panel-header"><h2>Recorded receipts</h2><span>${rows.length} records</span></div><div class="settings-content">${rows.map(r=>`<details class="payment-receipt"><summary>${esc(r.customerName)} · ${esc(money(r.amount,r.currency))} · ${esc(r.paidAt)}${r.voidedAt?' · Voided':''}</summary><p>Reference: ${esc(r.reference||'—')} · Unallocated: ${esc(money(r.unallocated,r.currency))}</p><p>${esc(r.notes)}</p><ul>${r.allocations.map(a=>`<li>Invoice #${esc(a.invoiceId)}: ${esc(money(a.amount,r.currency))}${r.voidedAt?' (reversed)':''}</li>`).join('')}</ul>${r.voidedAt?`<p>Voided ${esc(r.voidedAt)}: ${esc(r.voidReason)}</p>`:readOnly?'':`${r.unallocated>0?`<form data-allocate-receipt="${r.id}">${allocations()}<label><input name="confirmed" type="checkbox" required> I checked these allocations.</label><button class="button secondary" type="submit">Allocate remaining payment</button><p data-payment-error role="alert" hidden></p></form>`:''}<form data-void-receipt="${r.id}"><label class="field">Reason for reversal<input name="reason" required maxlength="500"></label><label><input name="confirmed" type="checkbox" required> Reverse this receipt and reopen the affected balances.</label><button class="button secondary" type="submit">Void receipt</button><p data-payment-error role="alert" hidden></p></form>`}</details>`).join('')||'<p>No payments in the ledger yet. Existing paid invoices remain available in Recorded Payments.</p>'}</div></section></section>`;
}
export function initializeCustomerPayments({root,ws,api,refresh,readOnly,toast}){
  const page=root.querySelector('[data-customer-payments]');if(!page)return;
  for(const form of page.querySelectorAll('form')){
    let key=crypto.randomUUID(),busy=false;
    form.addEventListener('input',()=>{if(!busy)key=crypto.randomUUID();});
    form.addEventListener('submit',async event=>{
      event.preventDefault();if(busy||readOnly())return;busy=true;
      const data=Object.fromEntries(new FormData(form)),error=form.querySelector('[data-payment-error]'),controls=[...form.elements];error.hidden=true;
      const allocations=[...form.querySelectorAll('[data-allocate-invoice]')].filter(i=>i.value!=='').map(i=>({invoiceId:i.dataset.allocateInvoice,amount:i.value}));
      controls.forEach(c=>c.disabled=true);
      try{
        if(form.dataset.voidReceipt)await api.customerPaymentAction(form.dataset.voidReceipt,'void',{reason:data.reason,confirmed:data.confirmed==='on'});
        else if(form.dataset.allocateReceipt)await api.customerPaymentAction(form.dataset.allocateReceipt,'allocate',{allocations,confirmed:data.confirmed==='on',requestKey:key});
        else await api.recordCustomerPayment({customerName:data.customerName,amount:data.amount,paidAt:data.paidAt,reference:data.reference,notes:data.notes,currency:ws.account.currency,confirmed:data.confirmed==='on',allocations,requestKey:key});
        document.dispatchEvent(new CustomEvent('cerium:form-saved',{detail:{section:'payments'}}));await refresh();toast('Payment ledger updated.');
      }catch(e){error.textContent=e.message;error.hidden=false;}finally{busy=false;controls.forEach(c=>c.disabled=false);}
    });
  }
}
