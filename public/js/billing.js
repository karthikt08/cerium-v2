/**
 * Cerium recurring billing: no simulated charges, no card numbers stored locally.
 * Razorpay hosts payment authorization. Server webhooks determine final entitlements.
 */
(function (global) {
  async function checkout({ onComplete = () => {}, onError = () => {} } = {}) {
    try {
      const result = await global.CeriumAPI.createRecurringSubscription();
      if (!result.keyId || !result.subscriptionId) throw new Error('Subscription checkout is unavailable.');
      if (result.status === 'authenticated' || result.status === 'active') {
        onComplete({ status: result.status });
        return;
      }
      if (!global.Razorpay) await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        script.onload = resolve;
        script.onerror = () => reject(new Error('Could not load secure payment checkout.'));
        document.head.appendChild(script);
      });
      const scheduled=new Date(Number(result.startAt)*1000);
      const firstCharge=Number.isFinite(scheduled.getTime())
        ?scheduled.toLocaleString(undefined,{year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'})
        :'the disclosed subscription start date';
      const trialDescription=result.trialEligible===false?'Monthly billing. ':'At least 15 full days free. ';
      const rzp = new global.Razorpay({
        key: result.keyId,
        subscription_id: result.subscriptionId,
        name: 'CERIUM',
        description: result.currency === 'INR'
          ?trialDescription+'First ₹500/month debit scheduled '+firstCharge+' plus applicable taxes. UPI AutoPay subject to eligibility. Cancel anytime.'
          :trialDescription+'First $20/month debit scheduled '+firstCharge+'. Authorize recurring billing. Cancel anytime.',
        theme: { color: '#6954b8' },
        handler: async response => {
          try {
            const verified = await global.CeriumAPI.verifyRecurringSubscription(response);
            if (!verified.verified) throw new Error('Payment authorization is still pending.');
            onComplete(verified);
          } catch (err) { onError(err); }
        }
      });
      rzp.on('payment.failed', response => onError(new Error(response?.error?.description || 'Authorization failed.')));
      rzp.open();
    } catch (err) { onError(err); }
  }
  global.CeriumBilling = { startSubscriptionCheckout: checkout };
})(window);
