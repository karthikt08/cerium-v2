// server/razorpay.js
//
// Razorpay payment integration client: order creation, payment signature verification,
// and webhook signature verification using HMAC-SHA256 and constant-time comparison.

import { createHmac } from 'node:crypto';
import { safeEqual } from './google.js';

export function makeRazorpay({ keyId, keySecret, webhookSecret, fetchImpl = fetch }) {
  const auth = 'Basic ' + Buffer.from(`${keyId || ''}:${keySecret || ''}`).toString('base64');

  async function createOrder({ amount, currency = 'USD', receipt, notes = {} }) {
    if (!keyId || keyId.includes('paste_key_id') || keyId.startsWith('mock_')) {
      const mockId = `order_mock_${Date.now()}`;
      return { id: mockId, amount, currency, status: 'created', receipt };
    }
    const res = await fetchImpl('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, currency, receipt, notes }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`razorpay order failed (${res.status}): ${errText}`);
    }
    return res.json();
  }

  function verifyPayment({ orderId, paymentId, signature }) {
    if (!keySecret) return false;
    const expected = createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest('hex');
    return safeEqual(String(signature || ''), expected);
  }

  function verifyWebhook(rawBody, signature) {
    if (!webhookSecret) return false;
    const bodyStr = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody || '');
    const expected = createHmac('sha256', webhookSecret).update(bodyStr).digest('hex');
    return safeEqual(String(signature || ''), expected);
  }

  return { createOrder, verifyPayment, verifyWebhook };
}
