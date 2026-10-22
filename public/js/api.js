/**
 * CERIUM — PRODUCTION API SERVICE LAYER (js/api.js)
 * Connects the frontend workspace directly to the secure Express backend REST endpoints.
 * Automatically injects CSRF tokens, manages authentication state, and handles errors.
 */
(function (global) {
  let cachedCsrfToken = '';
  let cachedUser = null;

  /* ---------- Date helpers (local time, YYYY-MM-DD) ---------- */
  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function toDateStr(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function todayStr() { return toDateStr(new Date()); }
  function parseDateStr(s) {
    const p = String(s || '').split('-').map(Number);
    return new Date(p[0] || 2026, (p[1] || 1) - 1, p[2] || 1);
  }
  function addDays(dateStr, n) {
    const d = parseDateStr(dateStr);
    d.setDate(d.getDate() + n);
    return toDateStr(d);
  }
  function daysBetween(a, b) {
    return Math.round((parseDateStr(b) - parseDateStr(a)) / 86400000);
  }
  function termsToDays(terms) {
    const m = /(\d+)/.exec(String(terms || ''));
    return m ? Number(m[1]) : 15;
  }

  async function ensureAuth() {
    if (cachedCsrfToken) return cachedCsrfToken;
    try {
      const res = await fetch('/api/me');
      if (res.ok) {
        const data = await res.json();
        if (data.signedIn) {
          cachedCsrfToken = data.csrfToken;
          cachedUser = data.user;
          return cachedCsrfToken;
        }
      }
    } catch (err) {
      console.warn('Auth check network warning:', err);
    }
    return '';
  }

  async function request(endpoint, options = {}) {
    const csrf = await ensureAuth();
    const headers = Object.assign(
      {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      csrf ? { 'X-CSRF-Token': csrf } : {},
      options.headers || {}
    );

    const res = await fetch(endpoint, Object.assign({}, options, { headers }));

    if (res.status === 401) {
      const returnTo = encodeURIComponent(window.location.pathname + window.location.hash);
      window.location.href = '/login.html?returnTo=' + returnTo;
      throw new Error('Please sign in to continue.');
    }

    if (res.status === 204) {
      return { ok: true };
    }

    const contentType = res.headers.get('content-type') || '';
    let data;
    if (contentType.includes('application/json')) {
      data = await res.json();
    } else {
      data = { text: await res.text() };
    }

    if (!res.ok) {
      const err = new Error(data && data.message ? data.message : (data.error || 'Request failed'));
      err.status = res.status;
      err.data = data;
      throw err;
    }

    return data;
  }

  const CeriumAPI = {
    todayStr: todayStr,
    addDays: addDays,
    daysBetween: daysBetween,
    termsToDays: termsToDays,

    async getMe() {
      const res = await fetch('/api/me');
      if (!res.ok) return { signedIn: false };
      const data = await res.json();
      if (data.signedIn) {
        cachedCsrfToken = data.csrfToken;
        cachedUser = data.user;
      }
      return data;
    },

    async getWorkspace() {
      return request('/api/workspace', { method: 'GET' });
    },

    async createLead(payload) {
      return request('/api/leads', { method: 'POST', body: JSON.stringify(payload) });
    },

    async updateLead(leadId, updates) {
      return request('/api/leads/' + encodeURIComponent(leadId), { method: 'PATCH', body: JSON.stringify(updates) });
    },

    async deleteLead(leadId) {
      return request('/api/leads/' + encodeURIComponent(leadId), { method: 'DELETE' });
    },

    async createFollowUp(payload) {
      return request('/api/followups', { method: 'POST', body: JSON.stringify(payload) });
    },

    async updateFollowUp(id, updates) {
      return request('/api/followups/' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify(updates) });
    },

    async toggleFollowUp(id) {
      return request('/api/followups/' + encodeURIComponent(id) + '/toggle', { method: 'PATCH' });
    },

    async deleteFollowUp(id) {
      return request('/api/followups/' + encodeURIComponent(id), { method: 'DELETE' });
    },

    async createInvoice(payload) {
      return request('/api/invoices', { method: 'POST', body: JSON.stringify(payload) });
    },

    async updateInvoice(id, payload) {
      return request('/api/invoices/' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify(payload) });
    },

    async updateInvoiceStatus(invoiceId, newStatus) {
      return request('/api/invoices/' + encodeURIComponent(invoiceId) + '/status', {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
    },

    async deleteInvoice(id) {
      return request('/api/invoices/' + encodeURIComponent(id), { method: 'DELETE' });
    },

    async resolveBankMatch(txId, action, targetInvoiceId) {
      return request('/api/bank/match', {
        method: 'POST',
        body: JSON.stringify({ txId, action, targetInvoiceId }),
      });
    },

    async syncBankFeed() {
      return request('/api/bank/sync', { method: 'POST' });
    },

    async toggleBankConnection() {
      return request('/api/bank/connection', { method: 'PATCH' });
    },

    async createReviewRequest(payload) {
      return request('/api/reviews', { method: 'POST', body: JSON.stringify(payload) });
    },

    async updateReview(id, updates) {
      return request('/api/reviews/' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify(updates) });
    },

    async sendReviewRequest(id) {
      return request('/api/reviews/' + encodeURIComponent(id) + '/send', { method: 'POST' });
    },

    async markReviewReceived(id) {
      return request('/api/reviews/' + encodeURIComponent(id) + '/complete', { method: 'PATCH' });
    },

    async deleteReview(id) {
      return request('/api/reviews/' + encodeURIComponent(id), { method: 'DELETE' });
    },

    async createMessage(payload) {
      return request('/api/messages', { method: 'POST', body: JSON.stringify(payload) });
    },

    async deleteMessage(id) {
      return request('/api/messages/' + encodeURIComponent(id), { method: 'DELETE' });
    },

    async updateAccount(updates) {
      return request('/api/me', { method: 'PATCH', body: JSON.stringify(updates) });
    },

    async exportMyData() {
      window.location.href = '/api/me/export';
    },

    async deleteWorkspaceData() {
      return request('/api/me/data', { method: 'DELETE' });
    },

    async deleteAccount() {
      return request('/api/me', { method: 'DELETE' });
    },

    // Billing & Subscriptions
    async createBillingOrder() {
      return request('/api/billing/order', { method: 'POST' });
    },

    async verifyBillingPayment(paymentData) {
      return request('/api/billing/verify', { method: 'POST', body: JSON.stringify(paymentData) });
    },

    async simulateTestPayment(orderId) {
      return request('/api/billing/simulate-test-payment', { method: 'POST', body: JSON.stringify({ orderId }) });
    },

    async getBillingStatus() {
      return request('/api/billing/status', { method: 'GET' });
    },

    async logout() {
      await request('/auth/logout', { method: 'POST' });
      cachedCsrfToken = '';
      cachedUser = null;
      window.location.href = '/login.html';
    },
  };

  global.CeriumAPI = CeriumAPI;
})(window);
