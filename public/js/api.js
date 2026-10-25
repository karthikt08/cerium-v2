/**
 * CERIUM — PRODUCTION API SERVICE LAYER (js/api.js)
 * Connects the frontend workspace directly to the secure Express backend REST endpoints.
 * Automatically injects CSRF tokens, manages authentication state, and handles errors.
 * Exports both standard ES modules and attaches to global window.CeriumAPI.
 */

let cachedCsrfToken = '';
let cachedUser = null;

/* ---------- Date helpers (local time, YYYY-MM-DD) ---------- */
export function pad(n) { return n < 10 ? '0' + n : String(n); }
export function toDateStr(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
export function todayStr() { return toDateStr(new Date()); }
export function parseDateStr(s) {
  const p = String(s || '').split('-').map(Number);
  return new Date(p[0] || 2026, (p[1] || 1) - 1, p[2] || 1);
}
export function addDays(dateStr, n) {
  const d = parseDateStr(dateStr);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}
export function daysBetween(a, b) {
  return Math.round((parseDateStr(b) - parseDateStr(a)) / 86400000);
}
export function termsToDays(terms) {
  if (terms === 'Due on receipt') return 0;
  const m = /(\d+)/.exec(String(terms || ''));
  return m ? Number(m[1]) : 15;
}

export function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || 'friend';
}

export function dateText(iso) {
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export function failText(status) {
  if (status === 401) return 'Your sign-in ended. Please log in again.';
  if (status === 403) return 'The security check failed. Please reload the page and try again.';
  if (status === 429) return 'Too many tries. Please wait a few minutes and try again.';
  return 'Something went wrong on our side. Please try again in a minute.';
}

export async function ensureAuth() {
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

export async function request(endpoint, options = {}) {
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
    if (typeof window !== 'undefined' && window.location) {
      const returnTo = encodeURIComponent(window.location.pathname + window.location.hash);
      window.location.href = '/login.html?returnTo=' + returnTo;
    }
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
    if(res.status===403&&data?.error==='onboarding_required'&&typeof window!=='undefined')
      window.location.assign('/verify.html');
    const err = new Error(data && data.message ? data.message : (data.error || 'Request failed'));
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

// Asks the server: who am I, and am I on the waitlist?
export async function getMe({strict=false}={}) {
  try {
    const res = await fetch('/api/me', {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      if(strict&&res.status!==401)throw new Error('Could not check your account. Check your connection and try again.');
      return { signedIn: false };
    }
    const me = await res.json();
    if (me.signedIn) {
      cachedCsrfToken = me.csrfToken || '';
      cachedUser = me.user || null;
    }
    return me;
  } catch (err) {
    if(strict)throw err;
    return { signedIn: false };
  }
}

// Changes something on the server (join, delete, sign out).
export async function send(method, url, body) {
  const csrf = cachedCsrfToken || await ensureAuth();
  const headers = { Accept: 'application/json' };
  if (csrf) headers['X-CSRF-Token'] = csrf;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    /* some replies have no body */
  }
  return { ok: res.ok, status: res.status, data };
}

export const CeriumAPI = {
  async saveWorkspacePreferences(payload){return request('/api/workspace/preferences',{method:'PATCH',body:JSON.stringify(payload)});},
  async getBusinessSetup(){return request('/api/business/setup');},
  async saveBusinessSetupStep(step,fields){return request('/api/business/setup',{method:'POST',body:JSON.stringify({step,fields})});},
  async completeBusinessSetup(confirmBusinessDetails,revision){return request('/api/business/setup/complete',{method:'POST',body:JSON.stringify({confirmBusinessDetails,revision})});},
  async getBusinessProfile(){return request('/api/business/profile');},
  async saveBusinessProfile(payload){return request('/api/business/profile',{method:'POST',body:JSON.stringify(payload)});},
  todayStr,
  addDays,
  daysBetween,
  termsToDays,
  getMe,
  send,
  firstName,
  dateText,
  failText,

  async getWorkspace() {
    return request('/api/workspace', { method: 'GET' });
  },

  async createQuote(payload){return request('/api/quotes',{method:'POST',body:JSON.stringify(payload)});},
  async updateQuote(id,payload){return request('/api/quotes/'+encodeURIComponent(id),{method:'PATCH',body:JSON.stringify(payload)});},
  async sendQuote(id){return request('/api/quotes/'+encodeURIComponent(id)+'/send',{method:'POST'});},
  async quoteLink(id){return request('/api/quotes/'+encodeURIComponent(id)+'/link',{method:'GET'});},
  async convertQuote(id,payload){return request('/api/quotes/'+encodeURIComponent(id)+'/convert',{method:'POST',body:JSON.stringify(payload)});},
  async deleteQuote(id){return request('/api/quotes/'+encodeURIComponent(id),{method:'DELETE'});},

  async createReminder(payload) {return request('/api/reminders',{method:'POST',body:JSON.stringify(payload)});},
  async cancelReminder(id) {return request('/api/reminders/'+encodeURIComponent(id),{method:'DELETE'});},

  async createJob(payload) { return request('/api/jobs', { method:'POST', body:JSON.stringify(payload) }); },
  async updateJob(id,payload) { return request('/api/jobs/'+encodeURIComponent(id), { method:'PATCH', body:JSON.stringify(payload) }); },
  async deleteJob(id) { return request('/api/jobs/'+encodeURIComponent(id), { method:'DELETE' }); },
  async createJobInvoice(id) { return request('/api/jobs/'+encodeURIComponent(id)+'/invoice', { method:'POST' }); },
  async addCrew(payload) { return request('/api/crew', { method:'POST', body:JSON.stringify(payload) }); },
  async archiveCrew(id) { return request('/api/crew/'+encodeURIComponent(id), { method:'DELETE' }); },

  async previewLeadImport(upload) {
    return request('/api/import/leads/preview', { method:'POST', body:JSON.stringify(upload) });
  },
  async commitLeadImport(upload) {
    return request('/api/import/leads/commit', { method:'POST', body:JSON.stringify(upload) });
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
    if (typeof window !== 'undefined' && window.location) {
      window.location.href = '/api/me/export';
    }
  },

  async deleteWorkspaceData() {
    return request('/api/me/data', { method: 'DELETE' });
  },

  async deleteAccount() {
    return request('/api/me', { method: 'DELETE' });
  },

  // Billing identity: phone OTP is sent by the backend, never by the browser.
  async getBillingIdentity() {
    return request('/api/billing/identity', { method: 'GET' });
  },
  async startBillingPhone(phone, confirmCountry, declaredCountry) {
    return request('/api/billing/identity/start', { method: 'POST', body: JSON.stringify({ phone, confirmCountry, declaredCountry }) });
  },
  async verifyBillingPhone(code) {
    return request('/api/billing/identity/verify', { method: 'POST', body: JSON.stringify({ code }) });
  },

  // Billing & Subscriptions
  async createRecurringSubscription() {
    return request('/api/billing/subscription', { method: 'POST' });
  },
  async verifyRecurringSubscription(data) {
    return request('/api/billing/subscription/verify', { method: 'POST', body: JSON.stringify(data) });
  },
  async cancelRecurringSubscription() {
    return request('/api/billing/subscription/cancel', { method: 'POST' });
  },
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
    if (typeof window !== 'undefined' && window.location) {
      window.location.href = '/login.html';
    }
  },
};

if (typeof window !== 'undefined') {
  window.CeriumAPI = CeriumAPI;
}

export default CeriumAPI;
