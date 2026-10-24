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
      const rzp = new global.Razorpay({
        key: result.keyId,
        subscription_id: result.subscriptionId,
        name: 'CERIUM',
        description: result.currency === 'INR' ? '15-day trial, then ₹500/month plus applicable taxes. UPI AutoPay may be available subject to eligibility; approve the recurring mandate. Cancel anytime.' : '15-day trial, then $20/month. Authorize recurring billing. Cancel anytime.',
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
