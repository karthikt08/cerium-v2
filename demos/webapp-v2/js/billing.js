/* Explicitly simulated billing; no external payment SDK or network request. */
(() => {
  window.CeriumBilling = {
    async startSubscriptionCheckout(options = {}) {
      let modal = document.getElementById('billing-simulation-modal');
      if (modal?.open) return;
      if (!modal) {
        modal = document.createElement('dialog'); modal.id='billing-simulation-modal'; modal.className='c-modal'; modal.setAttribute('aria-labelledby','sim-title');
        document.getElementById('pg').appendChild(modal);
      }
      modal.innerHTML = '<div class="modal-hd"><h3 id="sim-title">Preview the Pro plan</h3><button class="close-x" id="sim-close-btn" aria-label="Close dialog">×</button></div><p>This changes the plan badge in your local demo. No subscription is created and no payment is taken.</p><p id="sim-error" role="alert"></p><div class="dialog-actions"><button class="btn gh sm" id="sim-cancel-btn">Cancel</button><button class="btn sm" id="sim-pay-btn">Enable Pro preview</button></div>';
      const button = modal.querySelector('#sim-pay-btn');
      const close = () => { if (!button.disabled) modal.close(); };
      modal.querySelector('#sim-close-btn').onclick = close;
      modal.querySelector('#sim-cancel-btn').onclick = close;
      modal.oncancel = e => { if(button.disabled) e.preventDefault(); };
      button.onclick = async () => {
        button.disabled=true; button.textContent='Saving…';
        try { await window.CeriumAPI.simulateTestPayment(); await options.onComplete?.({success:true,demo:true}); modal.close(); }
        catch(error) { modal.querySelector('#sim-error').textContent=error.message; options.onError?.(error); }
        finally { button.disabled=false; button.textContent='Enable Pro preview'; }
      };
      modal.showModal(); modal.querySelector('#sim-cancel-btn').focus();
    }
  };
})();
