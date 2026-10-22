/* Local demo data layer; no credentials, payments or bank access are sent. */
(() => {
'use strict';
/**
 * ============================================================================
 * CERIUM V2 — SELF-CONTAINED CONTRACTOR DEMO API LAYER (js/api.js)
 * ============================================================================
 * Pre-populated with a rich, realistic contractor dataset (Apex Roofing & Construction /
 * Karthik Thyagarajulu) covering all 5 core pillars promised on the Cerium landing page:
 *   1. Morning Overview / Launchpad ("Let's Get In" morning briefing)
 *   2. Leads Pipeline (New -> Quoted -> Booked -> Done Kanban + Table)
 *   3. Scheduled Follow-ups (Due Today, Call / SMS action alerts)
 *   4. Net 15/30 Invoicing & Printable PDF Generation
 *   5. Chase Bank Deposit Matching (Auto-matched deposits to open invoices)
 *   6. Customer Reviews Engine (Finished job review tracking + 5★ testimonials)
 *
 * Runs 100% self-contained in browser with persistent LocalStorage (`cerium_demo_v2`),
 * zero setup, zero login blockers, and instant reset / simulation capabilities.
 * ============================================================================
 */

const STORAGE_KEY = 'cerium_demo_v2';
const SIMULATED_DELAY_MS = 90;
const TRIAL_DAYS = 15;
const DEFAULT_USER_NAME = 'Karthik Thyagarajulu';

function delay(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms !== undefined ? ms : SIMULATED_DELAY_MS);
  });
}

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
  const days = { 'Net 15': 15, 'Net 30': 30, 'Due on receipt': 0 };
  if (!(terms in days)) throw new Error('Choose valid payment terms.');
  return days[terms];
}
function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || 'Karthik';
}
function dateText(iso) {
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}
function failText(status) {
  if (status === 401) return 'Your sign-in ended. Please log in again.';
  if (status === 403) return 'The security check failed. Please reload the page and try again.';
  if (status === 429) return 'Too many tries. Please wait a few minutes and try again.';
  return 'Something went wrong on our side. Please try again in a minute.';
}

function computeInvoiceTotal(inv) {
  if (!inv || !Array.isArray(inv.items)) return 0;
  return inv.items.reduce((sum, item) => sum + cents(Number(item.qty) * Number(item.rate)), 0) / 100;
}
function nextNumber(list, field, floor) {
  return (list || []).reduce(function (max, item) {
    const n = parseInt(String(item[field] || '').replace(/\D/g, ''), 10);
    return isNaN(n) ? max : Math.max(max, n);
  }, floor - 1) + 1;
}

/* ---------- Rich Demo Dataset (Apex Roofing & Construction) ---------- */
function getRichDemoState() {
  const today = todayStr();
  return {
    account: {
      id: 'usr_demo_karthik',
      name: DEFAULT_USER_NAME,
      businessName: 'Apex Roofing & Construction',
      trade: 'Roofing & Exterior Remodeling',
      email: 'karthik@apexroofingatx.com',
      phone: '(512) 555-ROOF',
      location: 'Austin, Texas',
      country: 'US',
      currency: 'USD',
      googlePlaceUrl: 'https://g.page/r/apex-roofing-austin/review',
      trialStartedAt: addDays(today, -3),
      trialDaysTotal: TRIAL_DAYS,
      trialDaysRemaining: 12,
      planStatus: 'trial',
      monthlyPrice: 20,
      bankConnected: true,
      bankName: 'Chase Business Premier Checking (*8824)',
      bankLastSynced: '10 minutes ago'
    },
    leads: [
      {
        id: 'LD-101',
        name: 'Marcus Sterling',
        phone: '(512) 555-0142',
        email: 'marcus.sterling@gmail.com',
        address: '4812 Mesa Dr, Austin, TX 78731',
        source: 'Google Search',
        stage: 'Quoted',
        value: 4850,
        nextFollowUp: today,
        notes: 'Chimney flashing repair & architectural shingle replacement. Sent detailed itemized quote.',
        createdAt: addDays(today, -4)
      },
      {
        id: 'LD-102',
        name: 'Elena Rostova',
        phone: '(512) 555-0188',
        email: 'elena.rostova@outlook.com',
        address: '1204 Barton Hills, Austin, TX 78704',
        source: 'Referral',
        stage: 'Quoted',
        value: 12400,
        nextFollowUp: today,
        notes: 'Standing seam 24-gauge metal roof upgrade with high-temp underlayment. Requested color swatches.',
        createdAt: addDays(today, -5)
      },
      {
        id: 'LD-103',
        name: 'David & Sarah Miller',
        phone: '(512) 555-0176',
        email: 'david.miller@austin.rr.com',
        address: '7701 Oak Ridge, Austin, TX 78749',
        source: 'Repeat Customer',
        stage: 'New',
        value: 3200,
        nextFollowUp: addDays(today, 1),
        notes: 'Skylight leak in master bath + cedar shake roof inspection. Callback requested before noon.',
        createdAt: addDays(today, -1)
      },
      {
        id: 'LD-104',
        name: 'Carlos Mendez',
        phone: '(512) 555-0133',
        email: 'carlos.mendez@mendezlaw.com',
        address: '3105 Exposition Blvd, Austin, TX 78703',
        source: 'Repeat Customer',
        stage: 'Booked',
        value: 6800,
        nextFollowUp: addDays(today, 2),
        notes: 'Garage & breezeway re-roofing. Deposit invoiced; crew scheduled for Wednesday 8am.',
        createdAt: addDays(today, -8)
      },
      {
        id: 'LD-105',
        name: 'Rebecca Thorne',
        phone: '(512) 555-0164',
        email: 'rthorne@thornedesign.com',
        address: '2209 Windsor Rd, Austin, TX 78703',
        source: 'Google Search',
        stage: 'Done',
        value: 8950,
        nextFollowUp: addDays(today, -10),
        notes: 'Complete architectural tear-off & replacement with GAF Timberline HDZ + ridge vent. 5★ review received!',
        createdAt: addDays(today, -25)
      },
      {
        id: 'LD-106',
        name: 'Robert Chen',
        phone: '(512) 555-0199',
        email: 'robert.chen@chentech.io',
        address: '1502 Enfield Rd, Austin, TX 78703',
        source: 'Phone Call',
        stage: 'New',
        value: 1950,
        nextFollowUp: today,
        notes: 'Emergency storm tarping and tile repair after weekend wind gust. Insurance adjuster meeting Friday.',
        createdAt: today
      },
      {
        id: 'LD-107',
        name: 'Patricia Vance',
        phone: '(512) 555-0115',
        email: 'patricia.vance@gmail.com',
        address: '8904 Balcones Dr, Austin, TX 78759',
        source: 'Word of Mouth',
        stage: 'Booked',
        value: 5400,
        nextFollowUp: addDays(today, 3),
        notes: '6-inch seamless aluminum gutters and fascia board replacement. Material drop on Monday.',
        createdAt: addDays(today, -3)
      },
      {
        id: 'LD-108',
        name: 'Travis Henderson',
        phone: '(512) 555-0128',
        email: 'travis@hendersonauto.com',
        address: '4100 S Congress Ave, Austin, TX 78745',
        source: 'Google Maps',
        stage: 'Done',
        value: 2450,
        nextFollowUp: addDays(today, -14),
        notes: 'Commercial shop flat roof silicone elastomeric sealing. Work complete and paid.',
        createdAt: addDays(today, -30)
      }
    ],
    followUps: [
      {
        id: 'FU-301',
        leadId: 'LD-101',
        contactName: 'Marcus Sterling',
        phone: '(512) 555-0142',
        channel: 'Call',
        task: 'Follow up on $4,850 chimney flashing & shingle quote; answer hail warranty questions',
        dueDate: today,
        done: false
      },
      {
        id: 'FU-302',
        leadId: 'LD-102',
        contactName: 'Elena Rostova',
        phone: '(512) 555-0188',
        channel: 'SMS',
        task: 'Text standing seam metal color samples (Charcoal vs Matte Black)',
        dueDate: today,
        done: false
      },
      {
        id: 'FU-303',
        leadId: 'LD-106',
        contactName: 'Robert Chen',
        phone: '(512) 555-0199',
        channel: 'Call',
        task: 'Confirm insurance adjuster meeting time (2:00 PM Friday) on Enfield Rd tarping',
        dueDate: today,
        done: false
      },
      {
        id: 'FU-304',
        leadId: 'LD-104',
        contactName: 'Carlos Mendez',
        phone: '(512) 555-0133',
        channel: 'Call',
        task: 'Confirm ABC Supply shingle delivery time for Wednesday morning',
        dueDate: addDays(today, 1),
        done: false
      },
      {
        id: 'FU-305',
        leadId: 'LD-107',
        contactName: 'Patricia Vance',
        phone: '(512) 555-0115',
        channel: 'Call',
        task: 'Confirm gutter crew arrival time and driveway access',
        dueDate: addDays(today, -1),
        done: true
      }
    ],
    invoices: [
      {
        id: '1040',
        customerName: 'Marcus Sterling',
        customerEmail: 'marcus.sterling@gmail.com',
        customerAddress: '4812 Mesa Dr, Austin, TX 78731',
        jobTitle: 'Emergency Storm Tarping & Assessment',
        issueDate: addDays(today, -18),
        terms: 'Net 15',
        dueDate: addDays(today, -3),
        status: 'Overdue',
        items: [
          { description: 'Emergency 30x40 heavy-duty roof tarp installation & ridge securing', qty: 1, rate: 1250 },
          { description: 'Drone storm damage photographic inspection & engineering report', qty: 1, rate: 700 }
        ],
        notes: 'Payment overdue by 3 days. Please remit promptly or contact us if you need assistance.'
      },
      {
        id: '1041',
        customerName: 'Elena Rostova',
        customerEmail: 'elena.rostova@outlook.com',
        customerAddress: '1204 Barton Hills, Austin, TX 78704',
        jobTitle: 'Standing Seam Metal Roof - Material Deposit (50%)',
        issueDate: addDays(today, -5),
        terms: 'Net 15',
        dueDate: addDays(today, 10),
        status: 'Sent',
        items: [
          { description: '50% Material deposit: 24-gauge standing seam metal panels & trim', qty: 1, rate: 4480 }
        ],
        notes: 'Deposit required prior to custom panel roll-forming. Thank you!'
      },
      {
        id: '1042',
        customerName: 'David & Sarah Miller',
        customerEmail: 'david.miller@austin.rr.com',
        customerAddress: '7701 Oak Ridge, Austin, TX 78749',
        jobTitle: 'Skylight Replacement & Custom Copper Flashing',
        issueDate: today,
        terms: 'Net 15',
        dueDate: addDays(today, 15),
        status: 'Draft',
        items: [
          { description: 'Velux solar-powered fresh air skylight unit & solar shade', qty: 1, rate: 1950 },
          { description: 'Custom soldered 16-oz copper step flashing & roof integration', qty: 1, rate: 1250 }
        ],
        notes: 'Draft quote invoice. Ready to review and send to customer.'
      },
      {
        id: '1043',
        customerName: 'Carlos Mendez',
        customerEmail: 'carlos.mendez@mendezlaw.com',
        customerAddress: '3105 Exposition Blvd, Austin, TX 78703',
        jobTitle: 'Phase 1: Garage Tear-Off & Deck Repair',
        issueDate: addDays(today, -8),
        terms: 'Net 15',
        dueDate: addDays(today, 7),
        status: 'Sent',
        items: [
          { description: 'Tear-off existing 2-layer composition shingles and haul off debris', qty: 1, rate: 1450 },
          { description: 'Replace 4 sheets of water-damaged 1/2" CDX plywood decking', qty: 4, rate: 165 }
        ],
        notes: 'Phase 1 complete. Phase 2 installation begins Wednesday.'
      },
      {
        id: '1039',
        customerName: 'Rebecca Thorne',
        customerEmail: 'rthorne@thornedesign.com',
        customerAddress: '2209 Windsor Rd, Austin, TX 78703',
        jobTitle: 'GAF Timberline HDZ Architectural Re-Roof Complete',
        issueDate: addDays(today, -25),
        terms: 'Net 15',
        dueDate: addDays(today, -10),
        status: 'Paid',
        paidAt: addDays(today, -10),
        items: [
          { description: 'Complete 34-square tear-off & GAF Timberline HDZ architectural shingles', qty: 34, rate: 235 },
          { description: 'Cobra III ridge vent ventilation system installation', qty: 1, rate: 960 }
        ],
        notes: 'Paid in full via Bank Wire. 50-year manufacturer warranty transfer registered.'
      },
      {
        id: '1038',
        customerName: 'Travis Henderson',
        customerEmail: 'travis@hendersonauto.com',
        customerAddress: '4100 S Congress Ave, Austin, TX 78745',
        jobTitle: 'Commercial Flat Roof Silicone Restoration',
        issueDate: addDays(today, -30),
        terms: 'Net 15',
        dueDate: addDays(today, -15),
        status: 'Paid',
        paidAt: addDays(today, -14),
        items: [
          { description: 'High-pressure wash, seam reinforcement & 2 coats Gaco Western silicone coating', qty: 1, rate: 2450 }
        ],
        notes: 'Paid in full via Company Check #4412. 10-year leak-free warranty included.'
      }
    ],
    bankTransactions: [
      {
        id: 'TX-901',
        description: 'Zelle transfer from CARLOS MENDEZ - REF INV-1043',
        date: today,
        amount: 2110.00,
        status: 'pending_match',
        suggestedInvoiceId: '1043'
      },
      {
        id: 'TX-902',
        description: 'Direct Deposit / ACH - STERLING M MESA DR',
        date: addDays(today, -1),
        amount: 1950.00,
        status: 'pending_match',
        suggestedInvoiceId: '1040'
      },
      {
        id: 'TX-900',
        description: 'Wire Transfer REBECCA THORNE ARCH ROOF',
        date: addDays(today, -10),
        amount: 8950.00,
        status: 'matched',
        suggestedInvoiceId: '1039'
      },
      {
        id: 'TX-899',
        description: 'Check deposit #4412 Henderson Auto',
        date: addDays(today, -14),
        amount: 2450.00,
        status: 'matched',
        suggestedInvoiceId: '1038'
      }
    ],
    reviews: [
      {
        id: 'RV-501',
        customerName: 'Rebecca Thorne',
        customerPhone: '(512) 555-0164',
        customerEmail: 'rthorne@thornedesign.com',
        jobTitle: 'GAF Timberline HDZ Architectural Re-Roof Complete',
        completedDate: addDays(today, -10),
        status: 'Reviewed',
        lastSentAt: addDays(today, -10),
        rating: 5,
        reviewSnippet: '“Karthik and his crew were punctual, immaculate with site cleanup, and finished our entire roof in 2 days. Best contractor experience we’ve had in Austin!”'
      },
      {
        id: 'RV-502',
        customerName: 'Travis Henderson',
        customerPhone: '(512) 555-0128',
        customerEmail: 'travis@hendersonauto.com',
        jobTitle: 'Commercial Flat Roof Silicone Restoration',
        completedDate: addDays(today, -14),
        status: 'Reviewed',
        lastSentAt: addDays(today, -14),
        rating: 5,
        reviewSnippet: '“Fast quote, stopped our commercial flat roof leak before the heavy rains hit. Invoicing was straightforward and professional.”'
      },
      {
        id: 'RV-503',
        customerName: 'Patricia Vance',
        customerPhone: '(512) 555-0115',
        customerEmail: 'patricia.vance@gmail.com',
        jobTitle: 'Seamless Gutters & Fascia Replacement',
        completedDate: addDays(today, -3),
        status: 'Sent',
        lastSentAt: addDays(today, -2),
        rating: null,
        reviewSnippet: ''
      },
      {
        id: 'RV-504',
        customerName: 'Carlos Mendez',
        customerPhone: '(512) 555-0133',
        customerEmail: 'carlos.mendez@mendezlaw.com',
        jobTitle: 'Garage & Breezeway Re-roofing',
        completedDate: today,
        status: 'Not Asked',
        lastSentAt: null,
        rating: null,
        reviewSnippet: ''
      }
    ],
    messages: [
      {
        id: 'MSG-1',
        category: 'Feedback',
        subject: 'Loving the bank match feature',
        body: 'The 1-click match from Chase directly into the invoice is saving me at least 30 minutes every evening. Great job!',
        replyTo: 'karthik@apexroofingatx.com',
        via: 'In-app Form',
        createdAt: addDays(today, -2) + 'T16:20:00Z'
      }
    ]
  };
}


const COLLECTIONS = ['leads', 'followUps', 'invoices', 'bankTransactions', 'reviews', 'messages'];
const ID_RULES = { leads: ['LD-', 101], followUps: ['FU-', 301], invoices: ['', 1001], bankTransactions: ['TX-', 910], reviews: ['RV-', 501], messages: ['MSG-', 1] };
const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const clone = value => JSON.parse(JSON.stringify(value));
// Compensate for binary floating-point error at decimal half-cent boundaries.
const cents = value => {
  const number = Number(value);
  return Math.round((number + Number.EPSILON * Math.max(1, Math.abs(number))) * 100);
};
function text(value, label, required = false, max = 5000) {
  label = ({name:'Customer name', customerName:'Customer name', contactName:'Customer name', jobTitle:'Job description', task:'Follow-up task', businessName:'Business name', notes:'Notes'})[label] || label;
  const result = String(value == null ? '' : value).trim();
  if (required && !result) throw new Error(label + ' is required.');
  if (result.length > max) throw new Error(label + ' is too long (maximum ' + max + ' characters).');
  return result;
}
function email(value) {
  const result = text(value, 'Email', false, 254);
  if (result && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new Error('Enter a valid email address.');
  return result;
}
function money(value, label = 'Amount') {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1e9) throw new Error(label + ' must be between 0 and 1,000,000,000.');
  return cents(number) / 100;
}
function choice(value, allowed, label) {
  if (!allowed.includes(value)) throw new Error('Choose a valid ' + label + '.');
  return value;
}
function date(value, label, optional = false) {
  if (optional && !value) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || toDateStr(parseDateStr(value)) !== value) throw new Error('Enter a valid ' + label + '.');
  return value;
}
function reviewUrl(value) {
  const result = text(value, 'Review link', false, 2048);
  if (!result) return '';
  let url;
  try { url = new URL(result); } catch { throw new Error('Enter a complete HTTPS review link.'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Use a secure HTTPS review link.');
  return url.href;
}
function readSavedData() {
  try { return localStorage.getItem(STORAGE_KEY); }
  catch { throw new Error('Browser storage is unavailable. Allow local storage for Cerium, then retry.'); }
}
function saveStore(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch { throw new Error('Your changes could not be saved. Browser storage is full or blocked. Export your data and free some space, then try again.'); }
  return clone(state);
}
function normalize(state) {
  if (!state || typeof state !== 'object' || !state.account || typeof state.account !== 'object' || Array.isArray(state.account)) throw new Error('Saved workspace is damaged. Download a backup before resetting.');
  const fields = { leads: ['name', 'phone', 'email', 'address', 'source', 'stage', 'notes'], followUps: ['contactName', 'phone', 'channel', 'task', 'dueDate'], invoices: ['customerName', 'customerEmail', 'customerAddress', 'jobTitle', 'status', 'issueDate', 'dueDate', 'terms', 'notes'], bankTransactions: ['description', 'date', 'status'], reviews: ['customerName', 'customerPhone', 'customerEmail', 'jobTitle', 'completedDate', 'status', 'reviewSnippet'], messages: ['category', 'subject', 'body', 'replyTo', 'via', 'createdAt'] };
  state.account = Object.assign({}, getRichDemoState().account, state.account);
  if (!['USD', 'INR'].includes(state.account.currency)) state.account.currency = 'USD';
  for (const key of ['name', 'businessName', 'trade', 'email', 'phone', 'location', 'googlePlaceUrl']) state.account[key] = String(state.account[key] || '');
  state.counters = state.counters && typeof state.counters === 'object' ? state.counters : {};
  for (const key of COLLECTIONS) {
    if (!Array.isArray(state[key])) throw new Error('Saved workspace is missing ' + key + '. Download a backup before resetting.');
    const ids = new Set();
    for (const item of state[key]) {
      if (!item || typeof item !== 'object' || !item.id || ids.has(String(item.id))) throw new Error('Saved workspace contains an invalid record. Download a backup before resetting.');
      item.id = String(item.id); ids.add(item.id);
      for (const field of fields[key]) item[field] = String(item[field] == null ? '' : item[field]);
      if (key === 'invoices') {
        if (!Array.isArray(item.items) || !item.items.length || item.items.some(i => !i || !Number.isFinite(Number(i.qty)) || Number(i.qty) <= 0 || !Number.isFinite(Number(i.rate)) || Number(i.rate) < 0)) throw new Error('Saved invoice has invalid line items. Download a backup before resetting.');
        item.amountPaid = money(item.amountPaid == null ? (item.status === 'Paid' ? computeInvoiceTotal(item) : 0) : item.amountPaid);
      }
      if (key === 'bankTransactions') {
        item.amount = money(item.amount);
        if (item.status === 'matched' && item.appliedAmount == null) item.appliedAmount = item.amount;
      }
      if (key === 'leads') item.value = money(item.value || 0);
    }
    state.counters[key] = Math.max(Number(state.counters[key]) || 0, nextNumber(state[key], 'id', ID_RULES[key][1]) - 1);
  }
  state.schemaVersion = 3;
  return state;
}
function getState() {
  const raw = readSavedData();
  if (!raw) return saveStore(normalize(getRichDemoState()));
  let state;
  try { state = JSON.parse(raw); } catch { throw new Error('Saved workspace cannot be read. Download a backup before resetting.'); }
  return normalize(state);
}
function newId(state, key) { return ID_RULES[key][0] + (++state.counters[key]); }
function record(state, key, id, label) {
  const item = state[key].find(item => item.id === String(id));
  if (!item) throw new Error((label || 'Record') + ' no longer exists. Refresh and try again.');
  return item;
}
function refreshDerived(state) {
  const today = todayStr();
  const used = Math.max(0, daysBetween(state.account.trialStartedAt || today, today));
  state.account.trialDaysRemaining = Math.max(0, (state.account.trialDaysTotal || TRIAL_DAYS) - used);
  state.invoices.forEach(inv => {
    inv.total = computeInvoiceTotal(inv);
    inv.balance = Math.max(0, cents(inv.total) - cents(inv.amountPaid)) / 100;
    if (inv.status !== 'Draft') inv.status = inv.balance === 0 ? 'Paid' : (inv.dueDate < today ? 'Overdue' : 'Sent');
    if (inv.status !== 'Paid') delete inv.paidAt;
  });
  return state;
}
function queueReview(state, lead) {
  if (state.reviews.some(r => r.leadId === lead.id)) return;
  state.reviews.unshift({ id: newId(state, 'reviews'), leadId: lead.id, customerName: lead.name, customerPhone: lead.phone, customerEmail: lead.email, jobTitle: lead.notes ? lead.notes.slice(0, 160) : 'Completed service job', completedDate: todayStr(), status: 'Not Asked', lastSentAt: null, rating: null, reviewSnippet: '' });
}
async function ensureAuth() { return null; }
async function getMe() { const state = getState(); return { signedIn: false, demo: true, user: { id: state.account.id, name: state.account.name, email: state.account.email } }; }
async function getWorkspace() { await delay(30); return refreshDerived(getState()); }
function leadFields(p, base = {}) {
  const l = Object.assign({ name: '', phone: '', email: '', address: '', source: 'Google Search', stage: 'New', value: 0, nextFollowUp: todayStr(), notes: '' }, base);
  for (const key of ['name', 'phone', 'address', 'source', 'notes']) if (has(p, key)) l[key] = text(p[key], key, key === 'name', key === 'notes' ? 5000 : 300);
  l.name = text(l.name, 'Customer name', true, 300);
  if (has(p, 'email')) l.email = email(p.email);
  if (has(p, 'stage')) l.stage = choice(p.stage, ['New', 'Quoted', 'Booked', 'Done'], 'lead stage');
  if (has(p, 'value')) l.value = money(p.value, 'Job value');
  if (has(p, 'nextFollowUp')) l.nextFollowUp = date(p.nextFollowUp, 'follow-up date', true);
  return l;
}
async function createLead(p) {
  await delay(); const state = getState(); const lead = leadFields(p);
  lead.id = newId(state, 'leads'); lead.createdAt = todayStr(); state.leads.unshift(lead);
  if (p.createReminder !== false && lead.nextFollowUp && lead.stage !== 'Done') state.followUps.unshift({ id: newId(state, 'followUps'), leadId: lead.id, contactName: lead.name, phone: lead.phone, channel: 'Call', task: lead.notes ? 'Follow up: ' + lead.notes.slice(0, 140) : 'Follow up on ' + lead.source + ' inquiry', dueDate: lead.nextFollowUp, done: false });
  if (lead.stage === 'Done') queueReview(state, lead);
  saveStore(state); return lead;
}
async function updateLead(id, updates) {
  await delay(); const state = getState(); const lead = record(state, 'leads', id, 'Lead'); const oldStage = lead.stage;
  Object.assign(lead, leadFields(updates, lead));
  if (lead.stage === 'Done' && oldStage !== 'Done') queueReview(state, lead);
  // Keep linked reminders in sync without changing their individual tasks or completion state.
  state.followUps.filter(f => f.leadId === lead.id).forEach(f => { f.contactName = lead.name; f.phone = lead.phone; if (!f.done && has(updates, 'nextFollowUp') && lead.nextFollowUp) f.dueDate = lead.nextFollowUp; if (lead.stage === 'Done' && oldStage !== 'Done') f.done = true; });
  saveStore(state); return lead;
}
async function removeRecord(key, id) {
  await delay(); const state = getState(); record(state, key, id); state[key] = state[key].filter(item => item.id !== String(id));
  if (key === 'leads') state.followUps.filter(f => f.leadId === id).forEach(f => { f.leadId = null; });
  if (key === 'invoices') state.bankTransactions.filter(t => t.suggestedInvoiceId === String(id)).forEach(t => { t.suggestedInvoiceId = null; t.status = 'pending_match'; delete t.appliedAmount; });
  saveStore(state); return { ok: true };
}
async function deleteLead(id) { return removeRecord('leads', id); }
function followupFields(p, base = {}) {
  const f = Object.assign({ contactName: '', phone: '', channel: 'Call', task: '', dueDate: todayStr(), done: false }, base);
  for (const key of ['contactName', 'phone', 'task']) if (has(p, key)) f[key] = text(p[key], key, key !== 'phone');
  text(f.contactName, 'Customer name', true); text(f.task, 'Follow-up task', true);
  if (has(p, 'channel')) f.channel = choice(p.channel, ['Call', 'SMS', 'Email', 'Site Visit'], 'contact method');
  if (has(p, 'dueDate')) f.dueDate = date(p.dueDate, 'due date');
  return f;
}
async function createFollowUp(p) { await delay(); const s = getState(); const f = followupFields(p); f.id = newId(s, 'followUps'); f.leadId = p.leadId || null; if (f.leadId) record(s, 'leads', f.leadId, 'Lead'); s.followUps.unshift(f); saveStore(s); return f; }
async function updateFollowUp(id, p) { await delay(); const s = getState(); const f = record(s, 'followUps', id, 'Follow-up'); Object.assign(f, followupFields(p, f)); saveStore(s); return f; }
async function toggleFollowUp(id) { await delay(); const s = getState(); const f = record(s, 'followUps', id, 'Follow-up'); f.done = !f.done; saveStore(s); return f; }
async function deleteFollowUp(id) { return removeRecord('followUps', id); }
function invoiceFields(p, base = {}) {
  const inv = Object.assign({ customerName: '', customerEmail: '', customerAddress: '', jobTitle: '', issueDate: todayStr(), terms: 'Net 15', status: 'Sent', items: [], amountPaid: 0, notes: 'Thank you for your business!' }, base);
  for (const key of ['customerName', 'customerAddress', 'jobTitle', 'notes']) if (has(p, key)) inv[key] = text(p[key], key, key === 'customerName' || key === 'jobTitle');
  text(inv.customerName, 'Customer name', true); text(inv.jobTitle, 'Job description', true);
  if (has(p, 'customerEmail')) inv.customerEmail = email(p.customerEmail);
  if (has(p, 'issueDate')) inv.issueDate = date(p.issueDate, 'issue date');
  if (has(p, 'terms')) { termsToDays(p.terms); inv.terms = p.terms; }
  if (!inv.dueDate || has(p, 'terms') || has(p, 'issueDate')) inv.dueDate = addDays(inv.issueDate, termsToDays(inv.terms));
  if (has(p, 'dueDate')) inv.dueDate = date(p.dueDate, 'due date');
  if (inv.dueDate < inv.issueDate) throw new Error('Due date cannot be before the issue date.');
  if (has(p, 'items')) {
    if (!Array.isArray(p.items) || !p.items.length || p.items.length > 100) throw new Error('Add between 1 and 100 line items.');
    inv.items = p.items.map(item => {
      const qty = Number(item.qty);
      if (!Number.isFinite(qty) || qty <= 0 || qty > 1e6) throw new Error('Line-item quantity must be greater than zero.');
      return { description: text(item.description, 'Line-item description', true), qty, rate: money(item.rate, 'Rate') };
    });
  } else if (has(p, 'amount') && p.amount !== null && p.amount !== '') {
    const amount = money(p.amount);
    if (!inv.items.length) inv.items = [{ description: inv.jobTitle, qty: 1, rate: amount }];
    else if (cents(amount) !== cents(computeInvoiceTotal(inv))) {
      if (inv.items.length > 1 || Number(inv.items[0].qty) !== 1) throw new Error('Edit the individual line items to change this invoice total.');
      inv.items = [Object.assign({}, inv.items[0], { rate: amount })];
    }
    if (inv.items.length === 1 && has(p, 'jobTitle') && inv.items[0].description === base.jobTitle) {
      inv.items = [Object.assign({}, inv.items[0], { description: inv.jobTitle })];
    }
  }
  inv.total = computeInvoiceTotal(inv);
  if (!Number.isFinite(inv.total) || inv.total <= 0 || inv.total > 1e9) throw new Error('Invoice total must be greater than zero and at most 1,000,000,000.');
  if (cents(inv.total) < cents(inv.amountPaid)) throw new Error('Invoice total cannot be less than payments already recorded.');
  if (has(p, 'status')) {
    choice(p.status, ['Draft', 'Sent', 'Overdue', 'Paid'], 'invoice status');
    inv.status = p.status;
    if (p.status === 'Paid' && base.status !== 'Paid') { inv.amountPaid = inv.total; inv.paidAt = inv.paidAt || todayStr(); }
    else if (p.status !== 'Paid' && base.status === 'Paid') { inv.amountPaid = 0; delete inv.paidAt; }
    if (p.status === 'Draft' && inv.amountPaid > 0) throw new Error('An invoice with payments cannot become a draft.');
  }
  return inv;
}
async function createInvoice(p) { await delay(); const s = getState(); const inv = invoiceFields(p); inv.id = newId(s, 'invoices'); s.invoices.unshift(inv); refreshDerived(s); saveStore(s); return inv; }
async function updateInvoice(id, p) {
  await delay(); const s = refreshDerived(getState()); const inv = record(s, 'invoices', id, 'Invoice');
  if (inv.status === 'Paid' && p.status && p.status !== 'Paid' && s.bankTransactions.some(t => t.status === 'matched' && t.suggestedInvoiceId === inv.id)) throw new Error('Undo the bank match before reopening this invoice.');
  Object.assign(inv, invoiceFields(p, inv)); refreshDerived(s); saveStore(s); return inv;
}
async function updateInvoiceStatus(id, status) { return updateInvoice(id, { status }); }
async function deleteInvoice(id) { return removeRecord('invoices', id); }
function matchingInvoice(state, tx, id) {
  const inv = record(state, 'invoices', id, 'Suggested invoice');
  if (!['Sent', 'Overdue'].includes(inv.status) || inv.balance <= 0) throw new Error('Choose an unpaid, issued invoice.');
  if (tx.amount <= 0 || cents(tx.amount) > cents(inv.balance)) throw new Error('The deposit exceeds this invoice’s remaining balance. Review it before matching.');
  return inv;
}
async function resolveBankMatch(id, action, invoiceId) {
  await delay(); const s = refreshDerived(getState()); const tx = record(s, 'bankTransactions', id, 'Deposit');
  if (!s.account.bankConnected) throw new Error('Enable the sample bank feed first.');
  choice(action, ['confirm', 'dismiss', 'unmatch'], 'bank action');
  if (action === 'unmatch') {
    if (tx.status !== 'matched') throw new Error('This deposit has no match to undo.');
    const inv = record(s, 'invoices', tx.suggestedInvoiceId, 'Invoice');
    inv.amountPaid = Math.max(0, cents(inv.amountPaid) - cents(tx.appliedAmount || tx.amount)) / 100;
    tx.status = 'pending_match'; delete tx.appliedAmount; refreshDerived(s);
  } else {
    if (tx.status !== 'pending_match') throw new Error('This deposit was already processed.');
    if (action === 'confirm') {
      const inv = matchingInvoice(s, tx, invoiceId || tx.suggestedInvoiceId);
      inv.amountPaid = (cents(inv.amountPaid) + cents(tx.amount)) / 100;
      tx.status = 'matched'; tx.suggestedInvoiceId = inv.id; tx.appliedAmount = tx.amount;
      refreshDerived(s); if (inv.status === 'Paid') inv.paidAt = todayStr();
    } else tx.status = 'dismissed';
  }
  saveStore(s); return { transaction: tx, invoice: s.invoices.find(i => i.id === tx.suggestedInvoiceId) };
}
async function syncBankFeed() { await delay(); const s = getState(); if (!s.account.bankConnected) return { connected: false, newCount: 0 }; s.account.bankLastSynced = 'Just now'; saveStore(s); return { connected: true, newCount: 0, demo: true }; }
async function toggleBankConnection() { await delay(); const s = getState(); s.account.bankConnected = !s.account.bankConnected; s.account.bankLastSynced = 'Just now'; saveStore(s); return s.account; }
function reviewFields(p, base = {}) {
  const r = Object.assign({ customerName: '', customerPhone: '', customerEmail: '', jobTitle: '' }, base);
  for (const key of ['customerName', 'customerPhone', 'jobTitle']) if (has(p, key)) r[key] = text(p[key], key, key !== 'customerPhone');
  text(r.customerName, 'Customer name', true); text(r.jobTitle, 'Job description', true);
  if (has(p, 'customerEmail')) r.customerEmail = email(p.customerEmail);
  return r;
}
async function createReviewRequest(p) { await delay(); const s = getState(); const r = Object.assign(reviewFields(p), { id: newId(s, 'reviews'), completedDate: todayStr(), status: 'Not Asked', lastSentAt: null, rating: null, reviewSnippet: '' }); s.reviews.unshift(r); saveStore(s); return r; }
async function updateReview(id, p) { await delay(); const s = getState(); const r = record(s, 'reviews', id, 'Review'); Object.assign(r, reviewFields(p, r)); saveStore(s); return r; }
async function sendReviewRequest(id) { await delay(); const s = getState(); const r = record(s, 'reviews', id, 'Review'); if (r.status === 'Reviewed') throw new Error('A review is already recorded for this job.'); r.status = r.status === 'Not Asked' ? 'Sent' : 'Reminded'; r.lastSentAt = todayStr(); saveStore(s); return r; }
async function markReviewReceived(id) { await delay(); const s = getState(); const r = record(s, 'reviews', id, 'Review'); r.status = 'Reviewed'; saveStore(s); return r; }
async function deleteReview(id) { return removeRecord('reviews', id); }
async function updateAccount(p) {
  await delay(); const s = getState();
  for (const key of ['name', 'businessName', 'trade', 'phone', 'location']) if (has(p, key)) s.account[key] = text(p[key], key, key === 'name' || key === 'businessName', 300);
  if (has(p, 'email')) s.account.email = email(p.email);
  if (has(p, 'currency')) {
    choice(p.currency, ['USD', 'INR'], 'currency');
    if (p.currency !== s.account.currency && (s.invoices.length || s.bankTransactions.length)) throw new Error('Export and clear existing invoices and deposits before changing currency. Existing amounts cannot be converted automatically.');
    s.account.currency = p.currency;
  }
  if (has(p, 'googlePlaceUrl')) s.account.googlePlaceUrl = reviewUrl(p.googlePlaceUrl);
  saveStore(s); return s.account;
}
async function exportMyData() { return refreshDerived(getState()); }
async function deleteWorkspaceData() { await delay(); const s = getState(); COLLECTIONS.forEach(key => { s[key] = []; }); saveStore(s); return s; }
async function deleteAccount() { await delay(); const s = normalize(getRichDemoState()); COLLECTIONS.forEach(key => { s[key] = []; }); s.account = Object.assign(s.account, { name: 'Your name', businessName: 'Your business', email: '', phone: '', location: '', googlePlaceUrl: '', bankConnected: false }); saveStore(s); return { ok: true }; }
async function createMessage(p) { await delay(); const s = getState(); const m = { id: newId(s, 'messages'), category: text(p.category || 'Question', 'Category'), subject: text(p.subject, 'Subject', true, 300), body: text(p.body, 'Message', true), replyTo: email(p.replyTo), via: text(p.via || 'Email draft', 'Method'), createdAt: new Date().toISOString() }; s.messages.unshift(m); saveStore(s); return m; }
async function deleteMessage(id) { return removeRecord('messages', id); }
async function createBillingOrder() { return { orderId: 'demo-only', amount: 2000, currency: 'USD', demo: true }; }
async function verifyBillingPayment() { throw new Error('Real payments are not supported in this demo.'); }
async function simulateTestPayment() { const s = getState(); s.account.planStatus = 'active'; saveStore(s); return { success: true, demo: true }; }
async function getBillingStatus() { return { planStatus: getState().account.planStatus, demo: true }; }
async function logout() { window.location.href = 'index.html'; }
function resetDemoData() { return saveStore(normalize(getRichDemoState())); }
async function simulateIncomingLead() {
  const state = getState();
  const sampleLeads = [
    {
      name: 'Travis Scott & Co.',
      phone: '(512) 555-0182',
      email: 'travis@scottoffices.com',
      address: '2600 E 6th St, Austin, TX 78702',
      source: 'Google Search',
      stage: 'New',
      value: 3600,
      notes: 'Emergency commercial warehouse roof leak near HVAC unit after heavy wind.',
      nextFollowUp: todayStr()
    },
    {
      name: 'Claire Beauchamp',
      phone: '(512) 555-0195',
      email: 'claire.beauchamp@gmail.com',
      address: '3810 Kerbey Ln, Austin, TX 78703',
      source: 'Referral',
      stage: 'New',
      value: 7800,
      notes: 'Historic home cedar shake roof restoration and soldered copper valleys.',
      nextFollowUp: todayStr()
    },
    {
      name: 'Michael Alvarez',
      phone: '(512) 555-0167',
      email: 'malvarez@austinrealty.com',
      address: '1402 Westlake Dr, Austin, TX 78746',
      source: 'Repeat Customer',
      stage: 'New',
      value: 5200,
      notes: 'Pre-sale roof inspection and ridge tile recementing for listing next week.',
      nextFollowUp: todayStr()
    }
  ];
  const chosen = sampleLeads[Math.floor(Math.random() * sampleLeads.length)];
  return createLead(chosen);
}


async function simulateIncomingPayment() {
  await delay(); const s = refreshDerived(getState());
  const inv = s.invoices.find(i => ['Sent', 'Overdue'].includes(i.status) && !s.bankTransactions.some(t => t.suggestedInvoiceId === i.id && t.status === 'pending_match'));
  const tx = { id: newId(s, 'bankTransactions'), description: inv ? 'Sample ACH — ' + inv.customerName + ' INV-' + inv.id : 'Sample deposit — customer reference missing', date: todayStr(), amount: inv ? inv.balance : 1850, status: 'pending_match', suggestedInvoiceId: inv ? inv.id : null };
  s.bankTransactions.unshift(tx); saveStore(s); return tx;
}
const CeriumAPI = { pad, toDateStr, todayStr, parseDateStr, addDays, daysBetween, termsToDays, firstName, dateText, failText, computeInvoiceTotal, ensureAuth, getMe, getWorkspace, createLead, updateLead, deleteLead, createFollowUp, updateFollowUp, toggleFollowUp, deleteFollowUp, createInvoice, updateInvoice, updateInvoiceStatus, deleteInvoice, resolveBankMatch, syncBankFeed, toggleBankConnection, sendReviewRequest, createReviewRequest, updateReview, markReviewReceived, deleteReview, updateAccount, exportMyData, deleteWorkspaceData, deleteAccount, createMessage, deleteMessage, createBillingOrder, verifyBillingPayment, simulateTestPayment, getBillingStatus, logout, resetDemoData, simulateIncomingLead, simulateIncomingPayment, getRichDemoState, readSavedData };
window.CeriumAPI = CeriumAPI;

})();
