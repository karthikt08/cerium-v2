/**
 * CERIUM — BILLING & SUBSCRIPTION CHECKOUT HANDLER (js/billing.js)
 * Manages Razorpay checkout dialogs, payment verification, and test payment simulations.
 */
(function (global) {
  async function startSubscriptionCheckout(options = {}) {
    const onComplete = options.onComplete || function () {};
    const onError = options.onError || function () {};

    try {
      const order = await window.CeriumAPI.createBillingOrder();

      // Dynamically load the Razorpay SDK if real credentials are configured
      const isRealKey = order.keyId && !order.keyId.includes('placeholder') && !order.keyId.startsWith('mock_') && !order.keyId.startsWith('rzp_test_placeholder');
      if (isRealKey && typeof window.Razorpay !== 'function') {
        await new Promise(function (resolve, reject) {
          var s = document.createElement('script');
          s.src = '//checkout.razorpay.com/v1/checkout.js';
          s.onload = resolve;
          s.onerror = reject;
          document.head.appendChild(s);
        });
      }

      // Check if real Razorpay SDK is loaded and credentials configured
      if (isRealKey && typeof window.Razorpay === 'function') {
        const rzp = new window.Razorpay({
          key: order.keyId,
          order_id: order.orderId,
          amount: order.amount,
          currency: order.currency || 'USD',
          name: 'Cerium Pro',
          description: 'Cerium Workspace Subscription ($20/month)',
          prefill: {
            name: order.name || '',
            email: order.email || '',
          },
          theme: { color: '#2f5bff' },
          handler: async function (response) {
            try {
              const verifyRes = await window.CeriumAPI.verifyBillingPayment(response);
              if (verifyRes.verified) {
                onComplete({ success: true, planStatus: 'active' });
              } else {
                onError(new Error('Payment verification was not confirmed. Please contact support.'));
              }
            } catch (err) {
              onError(err);
            }
          },
        });
        rzp.on('payment.failed', function (errResp) {
          onError(new Error(errResp.error && errResp.error.description ? errResp.error.description : 'Payment failed.'));
        });
        rzp.open();
        return;
      }

      // Test Mode / Development Simulation Modal
      renderSimulationModal(order, onComplete, onError);
    } catch (err) {
      onError(err);
    }
  }

  function renderSimulationModal(order, onComplete, onError) {
    let modal = document.getElementById('billing-simulation-modal');
    if (!modal) {
      modal = document.createElement('dialog');
      modal.id = 'billing-simulation-modal';
      modal.className = 'c-modal';
      modal.setAttribute('aria-labelledby', 'sim-title');
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div class="modal-hd">
        <h3 id="sim-title">💳 Cerium Pro Subscription Checkout</h3>
        <button class="close-x" type="button" aria-label="Close" id="sim-close-btn">×</button>
      </div>
      <div style="margin:12px 0 18px;font-size:15px;line-height:1.55">
        <p><strong>Plan:</strong> Cerium Pro · $20.00 / month</p>
        <p><strong>Order ID:</strong> <code>${order.orderId}</code></p>
        <p style="color:var(--mut);font-size:13.5px">
          <em>(Notice: Razorpay credentials in development/test mode. You can simulate the verified payment lifecycle below.)</em>
        </p>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap">
        <button class="btn gh sm" type="button" id="sim-cancel-btn">Cancel</button>
        <button class="btn sm" type="button" id="sim-pay-btn" style="background:#05603a">✓ Confirm &amp; Activate Pro</button>
      </div>
    `;

    modal.querySelector('#sim-close-btn').onclick = () => modal.close();
    modal.querySelector('#sim-cancel-btn').onclick = () => modal.close();
    modal.querySelector('#sim-pay-btn').onclick = async () => {
      try {
        const btn = modal.querySelector('#sim-pay-btn');
        btn.disabled = true;
        btn.textContent = 'Processing…';
        const res = await window.CeriumAPI.simulateTestPayment(order.orderId);
        modal.close();
        onComplete({ success: true, planStatus: res.planStatus });
      } catch (err) {
        onError(err);
      }
    };

    modal.showModal();
  }

  global.CeriumBilling = {
    startSubscriptionCheckout,
  };
})(window);
