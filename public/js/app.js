/**
 * ============================================================================
 * CERIUM WORKSPACE — FRONTEND CONTROLLER & STATE MANAGER (js/app.js)
 * ============================================================================
 * Powers:
 *   - Stage 1: Proper First Page ("Let's Get In" Morning Launchpad with
 *     motivational crew quotes, good luck wish, and 3-second daily snapshot)
 *   - Stage 2: Neat, Organized 7-Tab Workspace Shell (Sidebar + Top Tab Strip):
 *       1. Morning Overview (3-Pillar Bento Grid + Bank Match Banner)
 *       2. Leads Pipeline (List View + 4-Stage Kanban Board)
 *       3. Follow-ups (Scheduled Callbacks & SMS Reminders)
 *       4. Invoices & PDF (Net 15/30 Builder & Printable PDF Preview)
 *       5. Bank Match (Optional Read-Only Bank Deposit Matcher)
 *       6. Customer Reviews (Finished Job Review Tracker + Direct Google Link)
 *       7. Account & Data (15-Day Trial, $20/mo Plan, JSON Export & Delete)
 * ============================================================================
 */
(function () {
  const TODAY_STR = window.CeriumAPI.todayStr();

  const CREW_QUOTES = [
    { text: '“Good craftsmanship builds your reputation on the jobsite; fast follow-ups and clear invoices build your business.”', author: '— Daily Crew Mindset · Wishing you great luck on today’s jobs!' },
    { text: '“The crew that calls back first wins the job. Make your three morning calls, send your invoices, and own the day.”', author: '— Contractor’s Morning Rule · Go crush it today!' },
    { text: '“Every finished job deserves a prompt invoice and a 5-star review request. Keep your pipeline moving and your truck rolling.”', author: '— Cerium Field Note · Have a safe, profitable day!' },
    { text: '“Less time chasing paperwork at night means more time for what matters. Let’s knock out today’s list early.”', author: '— Built for People Who Do the Work · Good luck out there!' },
    { text: '“Measure twice, cut once, and write the quote down before you leave the driveway.”', author: '— Jobsite Wisdom · Make it a clean day!' },
    { text: '“A quote that sits unanswered is a customer calling someone else. Pick up the phone first.”', author: '— The Callback Rule · Dial with confidence!' },
    { text: '“Small habits win big seasons: log the lead, set the reminder, send the invoice, ask for the review.”', author: '— Cerium Field Note · One steady step at a time!' },
    { text: '“Your reputation is built one finished job at a time. Leave every site better than you found it.”', author: '— Daily Crew Mindset · Take pride in the work!' },
    { text: '“Done is great, invoiced is better, paid is best. Close the loop on every job.”', author: '— Contractor’s Cash-Flow Rule · Get paid for the good work!' },
    { text: '“Customers remember how you made them feel long after they forget the price. Be clear, be kind, be on time.”', author: '— Service Business Basics · Show up and shine!' },
    { text: '“Don’t carry the whole week in your head. Write it down, check it off, and drive with a clear mind.”', author: '— Cerium Field Note · Travel light today!' },
    { text: '“A tidy truck, a clear quote, and a friendly follow-up beat the lowest bid more often than you’d think.”', author: '— Tailgate Talk · Go earn it today!' },
    { text: '“Ask for the review while the customer is still smiling at the finished work.”', author: '— The Five-Star Rule · Let your work do the talking!' },
    { text: '“Hard work gets you to the job. Good follow-up gets you the next ten.”', author: '— Daily Crew Mindset · Keep the momentum going!' },
    { text: '“The best time to send the invoice was when you finished the job. The second best time is right now.”', author: '— Contractor’s Cash-Flow Rule · Hit send!' },
    { text: '“Slow is smooth and smooth is fast. A calm morning plan saves a chaotic afternoon.”', author: '— Jobsite Wisdom · Breathe, plan, go!' },
    { text: '“Every lead is someone with a real problem hoping you’ll call back. Be the reason it gets solved.”', author: '— Service Business Basics · You’ve got this!' },
    { text: '“Safety first, quality second, paperwork third, and none of them optional.”', author: '— Tailgate Talk · Stay safe out there!' },
    { text: '“Consistency beats intensity. Five minutes of follow-up every morning outworks a panicked Friday.”', author: '— Cerium Field Note · Start strong today!' },
    { text: '“Take care of your customers, your crew, and your cash flow, and the rest tends to take care of itself.”', author: '— Daily Crew Mindset · Here’s to a profitable day!' },
    { text: '“Build something you’d be proud to put your name on, then make sure everyone knows who built it.”', author: '— Jobsite Wisdom · Make your mark today!' },
    { text: '“Today’s hustle is tomorrow’s steady business. Keep showing up; it adds up.”', author: '— Built for People Who Do the Work · Good luck, boss!' }
  ];

  const FOUNDERS_EMAIL = 'cerium.founders@gmail.com';
  // Paste your donation page link here (Stripe Payment Link, Buy Me a Coffee, GoFundMe, PayPal.me, etc.).
  // While it is empty, the Donate button opens an email to the founders instead.
  const DONATE_URL = '';

  const AppState = {
    inWorkspace: false,
    quoteIndex: 0,
    quoteOrder: [],
    pendingDelete: null,
    currentTab: 'today',
    workspace: null,
    leadStageFilter: 'All',
    leadSourceFilter: 'All',
    leadSearch: '',
    leadViewMode: 'table', // 'table' | 'board'
    followUpFilter: 'due', // 'due' | 'upcoming' | 'done' | 'all'
    invoiceStatusFilter: 'All',
    invoiceSearch: '',
    reviewStatusFilter: 'All',
    activeInvoiceId: null
  };

  function userFirstName() {
    const ws = AppState.workspace;
    const full = (ws && ws.account && ws.account.name) || '';
    return full.trim().split(/\s+/)[0] || 'there';
  }

  function longDateLabel(withYear) {
    const opts = { weekday: 'long', month: 'short', day: 'numeric' };
    if (withYear) opts.year = 'numeric';
    return new Date().toLocaleDateString('en-US', opts);
  }

  function formatMoney(amount, currency) {
    const num = Number(amount) || 0;
    const cur = currency || (AppState.workspace && AppState.workspace.account && AppState.workspace.account.currency) || 'USD';
    if (cur === 'INR') {
      return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showToast(message, type) {
    const stack = document.getElementById('toast-stack');
    if (!stack) return;
    const item = document.createElement('div');
    item.className = 'toast ' + (type || 'ok');
    item.textContent = message;
    stack.appendChild(item);
    setTimeout(function () {
      item.style.opacity = '0';
      item.style.transform = 'translateY(8px)';
      item.style.transition = 'opacity 0.25s, transform 0.25s';
      setTimeout(function () {
        if (item.parentNode) item.parentNode.removeChild(item);
      }, 260);
    }, 3200);
  }

  function copyTextToClipboard(text, successMsg) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        showToast(successMsg || 'Copied to clipboard!', 'ok');
      }).catch(function () {
        fallbackCopy(text, successMsg);
      });
    } else {
      fallbackCopy(text, successMsg);
    }
  }

  function fallbackCopy(text, successMsg) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      showToast(successMsg || 'Copied to clipboard!', 'ok');
    } catch (err) {
      showToast('Copy ready: ' + text, 'info');
    }
    document.body.removeChild(ta);
  }

  function computeMetrics() {
    const ws = AppState.workspace;
    if (!ws) return { newLeadsCount: 0, activeInquiryCount: 0, dueFollowUpsCount: 0, unpaidTotal: 0, overdueTotal: 0, pendingMatchesCount: 0, unaskedReviewsCount: 0 };

    const activeInquiryCount = ws.leads.filter(function (l) { return l.stage === 'New' || l.stage === 'Quoted'; }).length;
    const dueFollowUpsCount = ws.followUps.filter(function (f) { return !f.done && f.dueDate <= TODAY_STR; }).length;

    let unpaidTotal = 0;
    let overdueTotal = 0;
    ws.invoices.forEach(function (inv) {
      const total = Number(inv.total) || 0;
      if (inv.status === 'Sent' || inv.status === 'Overdue') {
        unpaidTotal += total;
      }
      if (inv.status === 'Overdue') {
        overdueTotal += total;
      }
    });

    const pendingMatchesCount = ws.account.bankConnected
      ? ws.bankTransactions.filter(function (t) { return t.status === 'pending_match'; }).length
      : 0;

    const unaskedReviewsCount = ws.reviews.filter(function (r) { return r.status === 'Not Asked'; }).length;

    return {
      newLeadsCount: ws.leads.filter(function (l) { return l.stage !== 'Done'; }).length,
      activeInquiryCount: activeInquiryCount,
      dueFollowUpsCount: dueFollowUpsCount,
      unpaidTotal: unpaidTotal,
      overdueTotal: overdueTotal,
      pendingMatchesCount: pendingMatchesCount,
      unaskedReviewsCount: unaskedReviewsCount
    };
  }

  function renderWelcomeScreen() {
    const ws = AppState.workspace;
    if (!ws) return;
    const m = computeMetrics();
    const firstName = userFirstName();

    const wName = document.getElementById('welcome-user-name');
    if (wName) wName.textContent = firstName;

    const wLuck = document.getElementById('welcome-luck-text');
    if (wLuck) wLuck.textContent = longDateLabel(false) + ' · Wishing you great luck & smooth jobs today!';

    const wTrial = document.getElementById('welcome-trial-pill');
    if (wTrial) {
      wTrial.textContent = ws.account.planStatus === 'active'
        ? 'Pro Plan · $20/mo Active'
        : ('15-Day Free Trial · ' + ws.account.trialDaysRemaining + (ws.account.trialDaysRemaining === 1 ? ' day' : ' days') + ' left');
    }

    const wCalls = document.getElementById('welcome-stat-calls');
    if (wCalls) wCalls.textContent = m.dueFollowUpsCount + ' due';

    const wUnpaid = document.getElementById('welcome-stat-unpaid');
    if (wUnpaid) wUnpaid.textContent = formatMoney(m.unpaidTotal);

    const wMatches = document.getElementById('welcome-stat-matches');
    if (wMatches) wMatches.textContent = m.pendingMatchesCount + (m.pendingMatchesCount === 1 ? ' match' : ' matches');
  }

  function shuffledQuoteOrder(avoidFirst) {
    const order = CREW_QUOTES.map(function (_, i) { return i; });
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = order[i]; order[i] = order[j]; order[j] = tmp;
    }
    if (avoidFirst !== undefined && order.length > 1 && order[0] === avoidFirst) {
      const swap = order[0]; order[0] = order[1]; order[1] = swap;
    }
    return order;
  }

  function showQuote(index) {
    const q = CREW_QUOTES[index];
    const qText = document.getElementById('welcome-quote-text');
    const qAuthor = document.getElementById('welcome-quote-author');
    if (qText) qText.textContent = q.text;
    if (qAuthor) qAuthor.textContent = q.author;
  }

  function cycleWelcomeQuote() {
    if (!AppState.quoteOrder.length) AppState.quoteOrder = shuffledQuoteOrder(AppState.quoteIndex);
    AppState.quoteIndex = AppState.quoteOrder.shift();
    showQuote(AppState.quoteIndex);
  }

  function enterWorkspace(targetTab) {
    AppState.inWorkspace = true;
    const welcomeEl = document.getElementById('welcome-screen');
    const shellEl = document.getElementById('workspace-shell');
    if (welcomeEl) welcomeEl.hidden = true;
    if (shellEl) shellEl.hidden = false;
    switchTab(targetTab || 'today');
  }

  function showWelcomeScreen() {
    AppState.inWorkspace = false;
    renderWelcomeScreen();
    const welcomeEl = document.getElementById('welcome-screen');
    const shellEl = document.getElementById('workspace-shell');
    if (shellEl) shellEl.hidden = true;
    if (welcomeEl) welcomeEl.hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderHeaderAndBadges() {
    const ws = AppState.workspace;
    if (!ws) return;
    const m = computeMetrics();

    const badgeToday = document.getElementById('nav-badge-today');
    const badgeLeads = document.getElementById('nav-badge-leads');
    const badgeFollowups = document.getElementById('nav-badge-followups');
    const badgeInvoices = document.getElementById('nav-badge-invoices');
    const badgeBank = document.getElementById('nav-badge-bank');
    const badgeReviews = document.getElementById('nav-badge-reviews');

    if (badgeToday) badgeToday.textContent = String(m.dueFollowUpsCount + m.pendingMatchesCount);
    if (badgeLeads) badgeLeads.textContent = String(m.newLeadsCount);
    if (badgeFollowups) badgeFollowups.textContent = String(m.dueFollowUpsCount);
    if (badgeInvoices) badgeInvoices.textContent = String(ws.invoices.filter(function (i) { return i.status === 'Sent' || i.status === 'Overdue'; }).length);
    if (badgeBank) badgeBank.textContent = String(m.pendingMatchesCount);
    if (badgeReviews) badgeReviews.textContent = String(m.unaskedReviewsCount);

    const trialText = document.getElementById('header-trial-text');
    if (trialText) {
      if (ws.account.planStatus === 'active') {
        trialText.textContent = 'Pro Plan · $20/mo Active';
      } else {
        trialText.textContent = ws.account.trialDaysRemaining + (ws.account.trialDaysRemaining === 1 ? ' day' : ' days') + ' left in free trial';
      }
    }

    const avInitials = document.getElementById('header-av-initials');
    const avName = document.getElementById('header-av-name');
    if (avInitials) {
      const parts = (ws.account.name || 'K').trim().split(/\s+/).filter(Boolean);
      avInitials.textContent = parts.map(function (p) { return p[0]; }).join('').slice(0, 2).toUpperCase();
    }
    if (avName) {
      const np = (ws.account.name || '').trim().split(/\s+/).filter(Boolean);
      avName.textContent = np.length > 1 ? (np[0] + ' ' + np[np.length - 1][0] + '.') : (np[0] || 'Account');
    }
  }

  function renderTodayView() {
    const ws = AppState.workspace;
    if (!ws) return;
    const m = computeMetrics();

    const greetName = document.getElementById('today-greet-name');
    if (greetName) greetName.textContent = userFirstName();
    const todayDate = document.getElementById('today-date-label');
    if (todayDate) todayDate.textContent = 'Morning Command Center · ' + longDateLabel(true);

    document.getElementById('kpi-leads').textContent = String(m.newLeadsCount);
    document.getElementById('kpi-leads-sub').textContent = m.activeInquiryCount + ' open in New / Quoted';
    document.getElementById('kpi-followups').textContent = String(m.dueFollowUpsCount);
    document.getElementById('kpi-unpaid').textContent = formatMoney(m.unpaidTotal);
    document.getElementById('kpi-overdue').textContent = formatMoney(m.overdueTotal);
    const overdueNames = ws.invoices.filter(function (i) { return i.status === 'Overdue'; });
    document.getElementById('kpi-overdue-sub').textContent = overdueNames.length === 0
      ? 'Nothing overdue'
      : (overdueNames.length === 1 ? ('Invoice #' + overdueNames[0].id + ' (' + overdueNames[0].customerName + ')') : (overdueNames.length + ' overdue invoices'));

    // Pillar 1: Follow-ups due today
    const fuListEl = document.getElementById('today-followups-list');
    const todayFus = ws.followUps.filter(function (f) {
      return f.done ? f.dueDate === TODAY_STR : f.dueDate <= TODAY_STR;
    });

    if (todayFus.length === 0) {
      fuListEl.innerHTML = '<div class="empty-box"><b>All caught up!</b><span>No callbacks due today. Add one with + Add Callback.</span></div>';
    } else {
      fuListEl.innerHTML = todayFus.map(function (f) {
        return (
          '<div class="pn-row">' +
            '<input type="checkbox" data-action="toggle-followup" data-id="' + escapeHtml(f.id) + '" ' + (f.done ? 'checked' : '') + ' aria-label="Mark follow-up done">' +
            '<div class="row-main">' +
              '<span class="row-title ' + (f.done ? 'd' : '') + '">' + escapeHtml(f.contactName) + '</span>' +
              '<span class="row-meta">' + escapeHtml(f.task) + ' · ' + escapeHtml(f.phone) + '</span>' +
            '</div>' +
            '<span class="c ' + (f.done ? 'g' : 'b') + '">' + (f.done ? 'Done' : escapeHtml(f.channel)) + '</span>' +
          '</div>'
        );
      }).join('');
    }

    // Pillar 2: Open Invoices list
    const invListEl = document.getElementById('today-invoices-list');
    const activeInvs = ws.invoices.slice(0, 4);
    if (activeInvs.length === 0) {
      invListEl.innerHTML = '<div class="empty-box"><b>No invoices yet</b><span>Create your first Net 15/30 invoice with + Invoice.</span></div>';
    } else {
      invListEl.innerHTML = activeInvs.map(function (inv) {
        const badgeClass = inv.status === 'Paid' ? 'g' : (inv.status === 'Overdue' ? 'o' : (inv.status === 'Sent' ? 'b' : ''));
        return (
          '<div class="pn-row">' +
            '<div class="row-main">' +
              '<span class="row-title">#' + escapeHtml(inv.id) + ' · ' + escapeHtml(inv.customerName) + '</span>' +
              '<span class="row-meta">' + escapeHtml(inv.terms) + ' · Due ' + escapeHtml(inv.dueDate) + '</span>' +
            '</div>' +
            '<span class="row-amt">' + formatMoney(inv.total) + '</span>' +
            '<em class="c ' + badgeClass + '">' + escapeHtml(inv.status) + '</em>' +
            '<button class="btn gh xs" type="button" data-action="preview-invoice" data-id="' + escapeHtml(inv.id) + '">PDF</button>' +
          '</div>'
        );
      }).join('');
    }

    // Pillar 3: Customer Review Requests
    const nextReviewsEl = document.getElementById('today-reviews-list');
    const pendingRevs = ws.reviews.filter(function (r) { return r.status !== 'Reviewed'; }).slice(0, 4);
    if (pendingRevs.length === 0) {
      nextReviewsEl.innerHTML = (ws.reviews.length === 0
        ? '<div class="empty-box"><b>No finished jobs yet</b><span>Move a lead to Done and it shows up here for a review request.</span></div>'
        : '<div class="empty-box"><b>Everyone asked!</b><span>All finished jobs have received your Google link.</span></div>');
    } else {
      nextReviewsEl.innerHTML = pendingRevs.map(function (r) {
        const badgeClass = r.status === 'Not Asked' ? 'o' : 'b';
        return (
          '<div class="pn-row">' +
            '<div class="row-main">' +
              '<span class="row-title">' + escapeHtml(r.customerName) + '</span>' +
              '<span class="row-meta">' + escapeHtml(r.jobTitle) + '</span>' +
            '</div>' +
            '<em class="c ' + badgeClass + '">' + escapeHtml(r.status) + '</em>' +
            '<button class="btn xs" type="button" data-action="send-review-request" data-id="' + escapeHtml(r.id) + '">' +
              (r.status === 'Not Asked' ? 'Ask' : 'Remind') +
            '</button>' +
          '</div>'
        );
      }).join('');
    }

    // Bottom Bank Match Banner
    const matchBoxEl = document.getElementById('today-bank-match-box');
    const pendingMatches = ws.account.bankConnected
      ? ws.bankTransactions.filter(function (t) { return t.status === 'pending_match'; })
      : [];

    if (!ws.account.bankConnected) {
      matchBoxEl.innerHTML =
        '<div class="mc" style="background:#f4f6fa;color:var(--mut);border-color:var(--ln)">' +
          '<div class="mc-info"><b>Read-only bank matching is paused</b><span>Connect your bank in the Bank Match tab to automatically spot deposits that pay open invoices.</span></div>' +
          '<button type="button" data-action="switch-tab" data-tab="bank">Open Bank Match</button>' +
        '</div>';
    } else if (pendingMatches.length === 0) {
      matchBoxEl.innerHTML =
        '<div class="mc" style="background:#d9f2e4;color:#05603a">' +
          '<div class="mc-info"><b style="color:#05603a">' + (ws.bankTransactions.length === 0 ? 'No deposits to match yet' : 'All bank deposits matched') + '</b><span>Read-only feed from ' + escapeHtml(ws.account.bankName || 'your bank') + ' is synced (' + escapeHtml(ws.account.bankLastSynced || 'just now') + ').</span></div>' +
          '<button type="button" class="no" style="color:#05603a;box-shadow:inset 0 0 0 1.5px #05603a" data-action="sync-bank">Check for new deposits</button>' +
        '</div>';
    } else {
      const topTx = pendingMatches[0];
      const matchedInv = ws.invoices.find(function (i) { return i.id === String(topTx.suggestedInvoiceId); });
      const invLabel = matchedInv
        ? ('Invoice #' + matchedInv.id + ' (' + matchedInv.customerName + ')')
        : ('Invoice #' + topTx.suggestedInvoiceId);

      matchBoxEl.innerHTML =
        '<div class="mc">' +
          '<div class="mc-info">' +
            '<b>Read-Only Bank Match Suggestion (' + pendingMatches.length + ' waiting)</b>' +
            '<span>Deposit <b>' + formatMoney(topTx.amount) + '</b> (' + escapeHtml(topTx.description) + ') matches <b>' + escapeHtml(invLabel) + '</b></span>' +
            '<div class="match-visual">' +
              '<span class="tg">+ ' + formatMoney(topTx.amount) + ' Bank Deposit</span>' +
              '<i class="dsh" aria-hidden="true"></i>' +
              '<span class="tg">Invoice #' + escapeHtml(topTx.suggestedInvoiceId) + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="mc-actions">' +
            '<button type="button" data-action="confirm-bank-match" data-tx-id="' + escapeHtml(topTx.id) + '" data-inv-id="' + escapeHtml(topTx.suggestedInvoiceId) + '">Confirm match</button>' +
            '<button type="button" class="no" data-action="dismiss-bank-match" data-tx-id="' + escapeHtml(topTx.id) + '">Not a match</button>' +
          '</div>' +
        '</div>';
    }
  }

  function renderLeadsAndFollowUpsViews() {
    const ws = AppState.workspace;
    if (!ws) return;

    const q = AppState.leadSearch.toLowerCase().trim();
    const filteredLeads = ws.leads.filter(function (l) {
      const stageMatch = AppState.leadStageFilter === 'All' || l.stage === AppState.leadStageFilter;
      const sourceMatch = AppState.leadSourceFilter === 'All' || l.source === AppState.leadSourceFilter;
      const textMatch = !q ||
        l.name.toLowerCase().includes(q) ||
        l.notes.toLowerCase().includes(q) ||
        l.phone.toLowerCase().includes(q) ||
        l.address.toLowerCase().includes(q) ||
        l.source.toLowerCase().includes(q);
      return stageMatch && sourceMatch && textMatch;
    });

    document.querySelectorAll('[data-lead-stage]').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-lead-stage') === AppState.leadStageFilter);
    });
    document.querySelectorAll('[data-lead-view]').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-lead-view') === AppState.leadViewMode);
    });

    const tableContainer = document.getElementById('leads-table-container');
    const boardContainer = document.getElementById('leads-board-container');

    if (AppState.leadViewMode === 'board') {
      tableContainer.hidden = true;
      boardContainer.hidden = false;
      const stages = ['New', 'Quoted', 'Booked', 'Done'];
      boardContainer.innerHTML = '<div class="kanban-grid">' + stages.map(function (st) {
        const colLeads = filteredLeads.filter(function (l) { return l.stage === st; });
        const colSum = colLeads.reduce(function (acc, l) { return acc + (Number(l.value) || 0); }, 0);
        const chipCls = st === 'Done' ? 'g' : (st === 'Booked' ? 'b' : (st === 'Quoted' ? 'o' : ''));
        return (
          '<div class="kanban-col">' +
            '<div class="kanban-col-hd">' +
              '<em class="c ' + chipCls + '">' + st + ' (' + colLeads.length + ')</em>' +
              '<b style="font-size:13px;font-variant-numeric:tabular-nums">' + formatMoney(colSum) + '</b>' +
            '</div>' +
            (colLeads.length === 0
              ? '<p style="margin:12px 0;font-size:13px;color:var(--mut);text-align:center">No leads in ' + st + '</p>'
              : colLeads.map(function (l) {
                  return (
                    '<div class="kanban-card">' +
                      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">' +
                        '<b style="font-size:14.5px">' + escapeHtml(l.name) + '</b>' +
                        '<span style="display:flex;align-items:center;gap:6px"><span style="font-weight:700;color:var(--ac);font-size:13.5px">' + formatMoney(l.value) + '</span>' + recordActions('lead', l.id) + '</span>' +
                      '</div>' +
                      '<p style="margin:6px 0;font-size:13px;color:var(--mut)">' + escapeHtml(l.notes) + '</p>' +
                      '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;gap:6px;flex-wrap:wrap">' +
                        '<span class="c" style="font-size:11px">' + escapeHtml(l.source) + '</span>' +
                        '<select class="stage-select" data-action="change-lead-stage" data-id="' + escapeHtml(l.id) + '" aria-label="Lead stage">' +
                          ['New', 'Quoted', 'Booked', 'Done'].map(function (opt) {
                            return '<option value="' + opt + '" ' + (l.stage === opt ? 'selected' : '') + '>' + opt + '</option>';
                          }).join('') +
                        '</select>' +
                      '</div>' +
                    '</div>'
                  );
                }).join('')) +
          '</div>'
        );
      }).join('') + '</div>';
    } else {
      tableContainer.hidden = false;
      boardContainer.hidden = true;
      const tbody = document.getElementById('leads-tbody');
      if (filteredLeads.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6"><div class="empty-box">' + (ws.leads.length === 0
          ? '<b>No leads yet</b><span>Press + Save New Lead to log your first inquiry.</span>'
          : '<b>No leads match your filter</b><span>Try clearing the search query or adding a new lead.</span>') + '</div></td></tr>';
      } else {
        tbody.innerHTML = filteredLeads.map(function (l) {
          const isDueToday = l.nextFollowUp <= TODAY_STR && l.stage !== 'Done';
          return (
            '<tr>' +
              '<td>' +
                '<b style="display:block;font-size:14.5px">' + escapeHtml(l.name) + '</b>' +
                '<span style="font-size:12.5px;color:var(--mut)">' + escapeHtml(l.phone) + ' · ' + escapeHtml(l.address) + '</span>' +
              '</td>' +
              '<td><span class="c">' + escapeHtml(l.source) + '</span></td>' +
              '<td>' +
                '<select class="stage-select" data-action="change-lead-stage" data-id="' + escapeHtml(l.id) + '" aria-label="Change stage for ' + escapeHtml(l.name) + '">' +
                  ['New', 'Quoted', 'Booked', 'Done'].map(function (opt) {
                    return '<option value="' + opt + '" ' + (l.stage === opt ? 'selected' : '') + '>' + opt + '</option>';
                  }).join('') +
                '</select>' +
              '</td>' +
              '<td style="max-width:250px;font-size:13px;color:var(--mut)">' + escapeHtml(l.notes) + '</td>' +
              '<td>' +
                '<span class="c ' + (isDueToday ? 'o' : 'b') + '">' + (l.nextFollowUp === TODAY_STR ? 'Today' : escapeHtml(l.nextFollowUp)) + '</span>' +
              '</td>' +
              '<td class="num-col">' +
                '<div style="display:flex;align-items:center;justify-content:flex-end;gap:8px">' +
                  '<span>' + formatMoney(l.value) + '</span>' +
                  '<button class="btn gh xs" type="button" data-action="lead-to-invoice" data-id="' + escapeHtml(l.id) + '">Invoice</button>' +
                  recordActions('lead', l.id) +
                '</div>' +
              '</td>' +
            '</tr>'
          );
        }).join('');
      }
    }

    // Tab 3: Follow-up Reminders list
    document.querySelectorAll('[data-fu-filter]').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-fu-filter') === AppState.followUpFilter);
    });

    const filteredFus = ws.followUps.filter(function (f) {
      if (AppState.followUpFilter === 'due') return !f.done && f.dueDate <= TODAY_STR;
      if (AppState.followUpFilter === 'upcoming') return !f.done && f.dueDate > TODAY_STR;
      if (AppState.followUpFilter === 'done') return f.done;
      return true;
    });

    const fuContainer = document.getElementById('leads-followups-list');
    if (filteredFus.length === 0) {
      fuContainer.innerHTML = '<div class="empty-box"><b>No reminders in this filter</b><span>Switch filter pills or schedule a new follow-up call.</span></div>';
    } else {
      fuContainer.innerHTML = filteredFus.map(function (f) {
        return (
          '<div class="pn-row">' +
            '<input type="checkbox" data-action="toggle-followup" data-id="' + escapeHtml(f.id) + '" ' + (f.done ? 'checked' : '') + ' aria-label="Toggle reminder">' +
            '<div class="row-main">' +
              '<span class="row-title ' + (f.done ? 'd' : '') + '">' + escapeHtml(f.contactName) + ' — ' + escapeHtml(f.task) + '</span>' +
              '<span class="row-meta">' + escapeHtml(f.channel) + ' · ' + escapeHtml(f.phone) + ' · Due ' + (f.dueDate === TODAY_STR ? 'Today' : escapeHtml(f.dueDate)) + '</span>' +
            '</div>' +
            '<span class="c ' + (f.done ? 'g' : (f.dueDate <= TODAY_STR ? 'o' : 'b')) + '">' + (f.done ? 'Completed' : (f.dueDate <= TODAY_STR ? 'Due Today' : escapeHtml(f.dueDate))) + '</span>' +
            recordActions('followup', f.id) +
          '</div>'
        );
      }).join('');
    }
  }

  function renderInvoicesAndBankViews() {
    const ws = AppState.workspace;
    if (!ws) return;

    document.querySelectorAll('[data-inv-status]').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-inv-status') === AppState.invoiceStatusFilter);
    });

    const q = AppState.invoiceSearch.toLowerCase().trim();
    const filteredInvs = ws.invoices.filter(function (inv) {
      const statusOk = AppState.invoiceStatusFilter === 'All' || inv.status === AppState.invoiceStatusFilter;
      const textOk = !q ||
        inv.id.toLowerCase().includes(q) ||
        inv.customerName.toLowerCase().includes(q) ||
        inv.jobTitle.toLowerCase().includes(q);
      return statusOk && textOk;
    });

    const tbody = document.getElementById('invoices-tbody');
    if (filteredInvs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6"><div class="empty-box">' + (ws.invoices.length === 0
        ? '<b>No invoices yet</b><span>Press + Create Invoice to bill your first customer.</span>'
        : '<b>No invoices match your filter</b><span>Create a new invoice or adjust status filters.</span>') + '</div></td></tr>';
    } else {
      tbody.innerHTML = filteredInvs.map(function (inv) {
        const badgeCls = inv.status === 'Paid' ? 'g' : (inv.status === 'Overdue' ? 'o' : (inv.status === 'Sent' ? 'b' : ''));
        return (
          '<tr>' +
            '<td><b>#' + escapeHtml(inv.id) + '</b><span style="display:block;font-size:12px;color:var(--mut)">Issued ' + escapeHtml(inv.issueDate) + '</span></td>' +
            '<td><b>' + escapeHtml(inv.customerName) + '</b><span style="display:block;font-size:12.5px;color:var(--mut)">' + escapeHtml(inv.jobTitle) + '</span></td>' +
            '<td><span class="c">' + escapeHtml(inv.terms) + '</span><span style="display:block;font-size:12px;color:var(--mut);margin-top:3px">Due ' + escapeHtml(inv.dueDate) + '</span></td>' +
            '<td><em class="c ' + badgeCls + '">' + escapeHtml(inv.status) + '</em></td>' +
            '<td class="num-col">' + formatMoney(inv.total) + '</td>' +
            '<td style="text-align:right;white-space:nowrap">' +
              '<button class="btn gh xs" type="button" data-action="preview-invoice" data-id="' + escapeHtml(inv.id) + '">View / PDF</button> ' +
              (inv.status !== 'Paid'
                ? '<button class="btn xs" type="button" data-action="mark-invoice-paid" data-id="' + escapeHtml(inv.id) + '">Mark Paid</button>'
                : '<span style="font-size:12px;color:#05603a;font-weight:600;padding:0 6px">✓ Paid</span>') + ' ' +
              recordActions('invoice', inv.id) +
            '</td>' +
          '</tr>'
        );
      }).join('');
    }

    // Tab 5: Read-Only Bank Feed & Deposit Matcher
    const bankContainer = document.getElementById('invoices-bank-feed');
    const syncStatusEl = document.getElementById('bank-feed-status-label');
    if (syncStatusEl) {
      syncStatusEl.textContent = ws.account.bankConnected
        ? ('Read-only · ' + ws.account.bankName + ' · Synced ' + ws.account.bankLastSynced)
        : 'Bank feed disconnected (Optional read-only mode)';
    }

    if (!ws.account.bankConnected) {
      bankContainer.innerHTML =
        '<div class="empty-box">' +
          '<b>Optional Read-Only Bank Connection is Off</b>' +
          '<span>Connect your bank to automatically match deposits to open invoices. We never see your bank password.</span>' +
          '<div style="margin-top:14px"><button class="btn sm" type="button" data-action="toggle-bank-connection">Connect Read-Only Bank Feed</button></div>' +
        '</div>';
    } else if (ws.bankTransactions.length === 0) {
      bankContainer.innerHTML = '<div class="empty-box"><b>No deposits yet</b><span>New read-only bank deposits will appear here with a suggested invoice match for you to confirm.</span></div>';
    } else {
      bankContainer.innerHTML = ws.bankTransactions.map(function (tx) {
        const isPending = tx.status === 'pending_match';
        const isMatched = tx.status === 'matched';
        const badgeCls = isMatched ? 'g' : (isPending ? 'b' : '');
        const badgeText = isMatched ? (tx.suggestedInvoiceId ? ('Matched to #' + tx.suggestedInvoiceId) : 'Matched') : (isPending ? (tx.suggestedInvoiceId ? ('Suggested: #' + tx.suggestedInvoiceId) : 'Needs review') : 'Dismissed');
        return (
          '<div class="pn-row">' +
            '<div class="row-main">' +
              '<span class="row-title">' + escapeHtml(tx.description) + '</span>' +
              '<span class="row-meta">Deposit on ' + escapeHtml(tx.date) + ' · Read-only bank transaction</span>' +
            '</div>' +
            '<span class="row-amt" style="color:#05603a">+ ' + formatMoney(tx.amount) + '</span>' +
            '<em class="c ' + badgeCls + '">' + escapeHtml(badgeText) + '</em>' +
            (isPending
              ? '<button class="btn xs" type="button" data-action="confirm-bank-match" data-tx-id="' + escapeHtml(tx.id) + '" data-inv-id="' + escapeHtml(tx.suggestedInvoiceId) + '">Confirm</button>' +
                '<button class="btn gh xs" type="button" data-action="dismiss-bank-match" data-tx-id="' + escapeHtml(tx.id) + '">Dismiss</button>'
              : '') +
          '</div>'
        );
      }).join('');
    }
  }

  function renderReviewsView() {
    const ws = AppState.workspace;
    if (!ws) return;

    document.querySelectorAll('[data-rev-status]').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-rev-status') === AppState.reviewStatusFilter);
    });

    const placeInput = document.getElementById('google-review-link-input');
    if (placeInput && document.activeElement !== placeInput) {
      placeInput.value = ws.account.googlePlaceUrl || '';
    }

    const filteredRevs = ws.reviews.filter(function (r) {
      return AppState.reviewStatusFilter === 'All' || r.status === AppState.reviewStatusFilter;
    });

    const listEl = document.getElementById('reviews-list-container');
    if (filteredRevs.length === 0) {
      listEl.innerHTML = '<div class="empty-box">' + (ws.reviews.length === 0
        ? '<b>No finished jobs yet</b><span>Move a lead to Done, or press + Send Review Request, and it is tracked here.</span>'
        : '<b>No finished jobs in this filter</b><span>Every finished job gets tracked here so everyone gets asked for a review.</span>') + '</div>';
    } else {
      listEl.innerHTML = filteredRevs.map(function (r) {
        const badgeCls = r.status === 'Reviewed' ? 'g' : (r.status === 'Not Asked' ? 'o' : 'b');
        return (
          '<div class="pn-row">' +
            '<div class="row-main">' +
              '<span class="row-title">' + escapeHtml(r.customerName) + ' · <span style="font-weight:500">' + escapeHtml(r.jobTitle) + '</span></span>' +
              '<span class="row-meta">Finished ' + escapeHtml(r.completedDate) + ' · ' + escapeHtml(r.customerPhone) + ' · ' + escapeHtml(r.customerEmail) + (r.lastSentAt ? (' · Last sent ' + escapeHtml(r.lastSentAt)) : '') + '</span>' +
              (r.reviewSnippet ? '<span style="display:block;margin-top:5px;font-size:13px;color:var(--ink);font-style:italic">★★★★★ ' + escapeHtml(r.reviewSnippet) + '</span>' : '') +
            '</div>' +
            '<em class="c ' + badgeCls + '">' + escapeHtml(r.status) + '</em>' +
            '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
              (r.status !== 'Reviewed'
                ? '<button class="btn sm" type="button" data-action="send-review-request" data-id="' + escapeHtml(r.id) + '">' + (r.status === 'Not Asked' ? 'Send Google Link' : 'Send Follow-up') + '</button>' +
                  '<button class="btn gh xs" type="button" data-action="mark-review-received" data-id="' + escapeHtml(r.id) + '">Mark 5★ Received</button>'
                : '<span class="c g">5.0 ★ Verified</span>') +
              recordActions('review', r.id) +
            '</div>' +
          '</div>'
        );
      }).join('');
    }
  }

  function renderAccountView() {
    const ws = AppState.workspace;
    if (!ws) return;
    const acc = ws.account;

    document.getElementById('acc-name-input').value = acc.name || '';
    document.getElementById('acc-biz-input').value = acc.businessName || '';
    document.getElementById('acc-trade-input').value = acc.trade || '';
    document.getElementById('acc-email-input').value = acc.email || '';
    document.getElementById('acc-phone-input').value = acc.phone || '';
    document.getElementById('acc-loc-input').value = acc.location || '';
    document.getElementById('acc-currency-select').value = acc.currency || 'USD';

    const planBadge = document.getElementById('acc-plan-badge');
    const planDesc = document.getElementById('acc-plan-desc');
    const subBtn = document.getElementById('acc-subscribe-btn');

    if (acc.planStatus === 'active') {
      planBadge.className = 'c g';
      planBadge.textContent = 'Active Pro Plan · $20/month';
      planDesc.textContent = 'Your $20/month Cerium Pro subscription is active. All premium features unlocked.';
      subBtn.textContent = '✓ Active Pro Subscription';
      subBtn.disabled = true;
    } else if (acc.planStatus === 'expired') {
      planBadge.className = 'c o';
      planBadge.textContent = 'Trial Completed';
      planDesc.textContent = 'Your 15-day free trial has completed. Upgrade to Cerium Pro ($20/month) for unlimited invoices, bank matching, and reviews.';
      subBtn.textContent = 'Upgrade to Pro ($20/month)';
      subBtn.disabled = false;
    } else {
      planBadge.className = 'c b';
      planBadge.textContent = '15-Day Free Trial (' + acc.trialDaysRemaining + ' days left)';
      planDesc.textContent = 'Your first 15 days are free. No card required to trial. Then $20/month for unlimited use.';
      subBtn.textContent = 'Upgrade to Pro ($20/month)';
      subBtn.disabled = false;
    }

    const bankStateBadge = document.getElementById('acc-bank-badge');
    const bankToggleBtn = document.getElementById('acc-bank-toggle-btn');
    if (acc.bankConnected) {
      bankStateBadge.className = 'c g';
      bankStateBadge.textContent = 'Connected (Read-Only): ' + acc.bankName;
      bankToggleBtn.textContent = 'Disconnect Bank Feed';
    } else {
      bankStateBadge.className = 'c';
      bankStateBadge.textContent = 'Not Connected';
      bankToggleBtn.textContent = 'Connect Read-Only Bank';
    }
  }

  function renderAll() {
    renderWelcomeScreen();
    renderHeaderAndBadges();
    renderTodayView();
    renderLeadsAndFollowUpsViews();
    renderInvoicesAndBankViews();
    renderReviewsView();
    renderAccountView();
    renderMessagesView();
    renderDonateButton();
  }

  function switchTab(tabId) {
    AppState.currentTab = tabId;
    document.querySelectorAll('.nav-tab').forEach(function (btn) {
      const isMatch = btn.getAttribute('data-tab') === tabId;
      btn.classList.toggle('active', isMatch);
      btn.setAttribute('aria-selected', isMatch ? 'true' : 'false');
    });

    document.querySelectorAll('.view-section').forEach(function (sec) {
      sec.hidden = sec.id !== ('view-' + tabId);
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openModal(id) {
    const dlg = document.getElementById(id);
    if (!dlg) return;
    // Date fields default to today (a form reset would otherwise bring back a stale date)
    [['nl-followup', 'new-lead-modal'], ['nfu-date', 'new-followup-modal']].forEach(function (pair) {
      const input = document.getElementById(pair[0]);
      if (input && pair[1] === id && !input.value) input.value = TODAY_STR;
    });
    if (typeof dlg.showModal === 'function') {
      dlg.showModal();
    } else {
      dlg.setAttribute('open', 'open');
    }
  }

  function closeModal(id) {
    const dlg = document.getElementById(id);
    if (!dlg) return;
    if (typeof dlg.close === 'function') {
      dlg.close();
    } else {
      dlg.removeAttribute('open');
    }
  }

  function openInvoicePreviewModal(invoiceId) {
    const ws = AppState.workspace;
    if (!ws) return;
    const inv = ws.invoices.find(function (i) { return i.id === String(invoiceId); });
    if (!inv) return;
    AppState.activeInvoiceId = inv.id;

    const container = document.getElementById('invoice-preview-body');
    const badgeCls = inv.status === 'Paid' ? 'g' : (inv.status === 'Overdue' ? 'o' : (inv.status === 'Sent' ? 'b' : ''));

    container.innerHTML =
      '<div class="inv-sheet">' +
        '<div class="inv-sheet-top">' +
          '<div>' +
            '<div class="lg" style="font-size:20px;margin-bottom:6px">' +
              '<svg width="26" height="26" viewBox="0 0 30 30" aria-hidden="true"><rect width="30" height="30" rx="9" fill="#0c1729"/><path d="M8 21 22 9" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><circle cx="8" cy="21" r="2.6" fill="#2f5bff"/><circle cx="22" cy="9" r="2.6" fill="#2f5bff"/></svg>' +
              escapeHtml(ws.account.businessName || ws.account.name || 'Your Business') +
            '</div>' +
            '<p style="margin:0;font-size:13px;color:var(--mut)">' + escapeHtml([ws.account.location, ws.account.phone, ws.account.email].filter(Boolean).join(' · ')) + '</p>' +
          '</div>' +
          '<div style="text-align:right">' +
            '<span class="ey" style="justify-content:flex-end">INVOICE #' + escapeHtml(inv.id) + '</span>' +
            '<em class="c ' + badgeCls + '" style="margin-top:6px">' + escapeHtml(inv.status) + '</em>' +
          '</div>' +
        '</div>' +
        '<div class="inv-meta-grid">' +
          '<div><small style="color:var(--mut);font-size:11.5px;display:block">BILL TO</small><b>' + escapeHtml(inv.customerName) + '</b><span style="display:block;font-size:12.5px;color:var(--mut)">' + escapeHtml(inv.customerAddress || inv.customerEmail || '') + '</span></div>' +
          '<div><small style="color:var(--mut);font-size:11.5px;display:block">ISSUE DATE & TERMS</small><b>' + escapeHtml(inv.issueDate) + '</b><span style="display:block;font-size:12.5px;color:var(--mut)">Terms: ' + escapeHtml(inv.terms) + '</span></div>' +
          '<div><small style="color:var(--mut);font-size:11.5px;display:block">DUE DATE</small><b>' + escapeHtml(inv.dueDate) + '</b><span style="display:block;font-size:12.5px;color:var(--mut)">Job: ' + escapeHtml(inv.jobTitle) + '</span></div>' +
        '</div>' +
        '<table class="c-table">' +
          '<thead><tr><th>Description</th><th class="num-col">Qty</th><th class="num-col">Rate</th><th class="num-col">Line Total</th></tr></thead>' +
          '<tbody>' +
            (inv.items || []).map(function (item) {
              const lineTotal = (Number(item.qty) || 1) * (Number(item.rate) || 0);
              return (
                '<tr>' +
                  '<td>' + escapeHtml(item.description) + '</td>' +
                  '<td class="num-col">' + escapeHtml(item.qty) + '</td>' +
                  '<td class="num-col">' + formatMoney(item.rate) + '</td>' +
                  '<td class="num-col">' + formatMoney(lineTotal) + '</td>' +
                '</tr>'
              );
            }).join('') +
          '</tbody>' +
        '</table>' +
        '<div class="inv-total-box">' +
          '<span>Total Due</span>' +
          '<span>' + formatMoney(inv.total) + '</span>' +
        '</div>' +
        '<p style="margin:16px 0 0;font-size:13px;color:var(--mut)"><b>Notes:</b> ' + escapeHtml(inv.notes || 'Thank you for your business!') + '</p>' +
      '</div>';

    openModal('invoice-preview-modal');
  }

  function downloadCurrentInvoiceFile() {
    const ws = AppState.workspace;
    if (!ws || !AppState.activeInvoiceId) return;
    const inv = ws.invoices.find(function (i) { return i.id === String(AppState.activeInvoiceId); });
    if (!inv) return;

    const previewBody = document.getElementById('invoice-preview-body');
    const htmlDoc = '<!doctype html><html><head><meta charset="utf-8"><title>Invoice #' + inv.id + ' - ' + (ws.account.businessName || ws.account.name) + '</title>' +
      '<style>body{font-family:system-ui,sans-serif;color:#0c1729;padding:40px;max-width:800px;margin:0 auto}' +
      'table{width:100%;border-collapse:collapse;margin:20px 0}th,td{padding:12px;border-bottom:1px solid #dde3ee;text-align:left}' +
      '.num-col{text-align:right}.inv-sheet-top{display:flex;justify-content:space-between;border-bottom:2px solid #0c1729;padding-bottom:20px}' +
      '.inv-meta-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;background:#f4f6fa;padding:16px;border-radius:12px;margin:20px 0}' +
      '.inv-total-box{margin-left:auto;width:260px;display:flex;justify-content:space-between;font-size:20px;font-weight:700;border-top:2px solid #0c1729;padding-top:12px}</style>' +
      '</head><body>' + (previewBody ? previewBody.innerHTML : '') + '</body></html>';

    const blob = new Blob([htmlDoc], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Cerium-Invoice-' + inv.id + '.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Downloaded Invoice #' + inv.id + ' printable file!', 'ok');
  }


  /* ================= Edit / Copy / Delete of saved records ================= */
  const FORM_META = {
    lead:     { modal: 'new-lead-modal',     form: 'new-lead-form',     title: 'nl-title',  submit: 'nl-submit',  newTitle: 'Save a new lead',                  editTitle: 'Edit lead',          newBtn: 'Save Lead & Reminder',     label: 'lead' },
    followup: { modal: 'new-followup-modal', form: 'new-followup-form', title: 'nfu-title', submit: 'nfu-submit', newTitle: 'Schedule follow-up reminder',      editTitle: 'Edit follow-up',     newBtn: 'Add Reminder',             label: 'follow-up' },
    invoice:  { modal: 'new-invoice-modal',  form: 'new-invoice-form',  title: 'ni-title',  submit: 'ni-submit',  newTitle: 'Create customer invoice',          editTitle: 'Edit invoice',       newBtn: 'Create & Save Invoice',    label: 'invoice' },
    review:   { modal: 'new-review-modal',   form: 'new-review-form',   title: 'nr-title',  submit: 'nr-submit',  newTitle: 'Ask customer for a Google review', editTitle: 'Edit review record', newBtn: 'Send Direct Review Link',  label: 'review record' }
  };

  function recordActions(type, id) {
    return '<button class="btn gh xs menu-btn" type="button" data-action="toggle-menu" data-type="' + type + '" data-id="' + escapeHtml(id) +
      '" aria-haspopup="menu" aria-label="More actions">⋯</button>';
  }

  function hideRecMenu() {
    const m = document.getElementById('rec-menu');
    if (m) m.hidden = true;
  }

  function showRecMenu(btn) {
    const m = document.getElementById('rec-menu');
    if (!m) return;
    const key = btn.getAttribute('data-type') + btn.getAttribute('data-id');
    if (!m.hidden && m.getAttribute('data-for') === key) { hideRecMenu(); return; }
    m.setAttribute('data-for', key);
    m.querySelectorAll('button').forEach(function (b) {
      b.setAttribute('data-type', btn.getAttribute('data-type'));
      b.setAttribute('data-id', btn.getAttribute('data-id'));
    });
    m.hidden = false;
    AppState.menuOpenedAt = Date.now();
    const r = btn.getBoundingClientRect();
    const mw = m.offsetWidth, mh = m.offsetHeight;
    const left = Math.max(8, Math.min(window.innerWidth - mw - 8, r.right - mw));
    const top = (r.bottom + mh + 8 > window.innerHeight) ? Math.max(8, r.top - mh - 4) : r.bottom + 4;
    m.style.left = left + 'px';
    m.style.top = top + 'px';
    const first = m.querySelector('button');
    if (first) first.focus();
  }

  function setFormMode(type, editId) {
    const meta = FORM_META[type];
    if (!meta) return;
    const form = document.getElementById(meta.form);
    const hidden = form && form.querySelector('input[name="id"]');
    if (hidden) hidden.value = editId || '';
    const title = document.getElementById(meta.title);
    if (title) title.textContent = editId ? meta.editTitle : meta.newTitle;
    const btn = document.getElementById(meta.submit);
    if (btn) btn.textContent = editId ? 'Save changes' : meta.newBtn;
    if (type === 'invoice') {
      const amt = document.getElementById('inv-amount');
      const note = document.getElementById('inv-amount-note');
      if (amt) amt.disabled = false;
      if (note) note.hidden = true;
    }
  }

  /** Opening a "new" dialog always starts from a clean form in create mode. */
  function prepareNewForm(modalId) {
    Object.keys(FORM_META).forEach(function (type) {
      const meta = FORM_META[type];
      if (meta.modal !== modalId) return;
      document.getElementById(meta.form).reset();
      setFormMode(type, '');
    });
  }

  function setVal(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value === undefined || value === null ? '' : value;
  }

  function findRecord(type, id) {
    const ws = AppState.workspace;
    const lists = { lead: ws.leads, followup: ws.followUps, invoice: ws.invoices, review: ws.reviews, message: ws.messages };
    return (lists[type] || []).find(function (r) { return String(r.id) === String(id); });
  }

  function openEditRecord(type, id) {
    const rec = findRecord(type, id);
    if (!rec) { showToast('That record no longer exists.', 'warn'); return; }

    if (type === 'message') {
      setVal('msg-category', rec.category);
      setVal('msg-reply', rec.replyTo);
      setVal('msg-subject', rec.subject);
      setVal('msg-body', rec.body);
      switchTab('messages');
      showToast('Loaded into the message form. Edit it and send again.', 'ok');
      return;
    }

    const meta = FORM_META[type];
    document.getElementById(meta.form).reset();
    setFormMode(type, id);
    if (type === 'lead') {
      setVal('nl-name', rec.name); setVal('nl-phone', rec.phone); setVal('nl-email', rec.email);
      setVal('nl-source', rec.source); setVal('nl-stage', rec.stage); setVal('nl-value', rec.value);
      setVal('nl-address', rec.address); setVal('nl-followup', rec.nextFollowUp); setVal('nl-notes', rec.notes);
    } else if (type === 'followup') {
      setVal('nfu-name', rec.contactName); setVal('nfu-phone', rec.phone); setVal('nfu-channel', rec.channel);
      setVal('nfu-date', rec.dueDate); setVal('nfu-task', rec.task);
    } else if (type === 'invoice') {
      setVal('inv-customer-name', rec.customerName); setVal('inv-customer-email', rec.customerEmail);
      setVal('inv-customer-address', rec.customerAddress); setVal('inv-job-title', rec.jobTitle);
      setVal('inv-terms', rec.terms); setVal('inv-status', rec.status); setVal('inv-notes', rec.notes);
      setVal('inv-amount', rec.total);
      if ((rec.items || []).length > 1) {
        document.getElementById('inv-amount').disabled = true;
        document.getElementById('inv-amount-note').hidden = false;
      }
    } else if (type === 'review') {
      setVal('nr-name', rec.customerName); setVal('nr-phone', rec.customerPhone);
      setVal('nr-email', rec.customerEmail); setVal('nr-job', rec.jobTitle);
    }
    openModal(meta.modal);
  }

  function recordToText(type, r) {
    const money = function (n) { return formatMoney(n); };
    const lines = [];
    if (type === 'lead') {
      lines.push('Lead: ' + r.name, 'Phone: ' + (r.phone || '-'), 'Email: ' + (r.email || '-'), 'Address: ' + (r.address || '-'),
        'Source: ' + r.source, 'Stage: ' + r.stage, 'Estimated value: ' + money(r.value), 'Next follow-up: ' + (r.nextFollowUp || '-'), 'Notes: ' + (r.notes || '-'));
    } else if (type === 'followup') {
      lines.push('Follow-up: ' + r.contactName, 'Phone: ' + (r.phone || '-'), 'Channel: ' + r.channel, 'Due: ' + r.dueDate,
        'Task: ' + (r.task || '-'), 'Status: ' + (r.done ? 'Done' : 'Open'));
    } else if (type === 'invoice') {
      lines.push('Invoice #' + r.id, 'Customer: ' + r.customerName, 'Email: ' + (r.customerEmail || '-'), 'Address: ' + (r.customerAddress || '-'),
        'Job: ' + (r.jobTitle || '-'), 'Issued: ' + r.issueDate, 'Terms: ' + r.terms, 'Due: ' + r.dueDate, 'Status: ' + r.status);
      (r.items || []).forEach(function (it) { lines.push('  - ' + it.description + ': ' + (it.qty || 1) + ' x ' + money(it.rate)); });
      lines.push('Total: ' + money(r.total), 'Notes: ' + (r.notes || '-'));
    } else if (type === 'review') {
      lines.push('Review record: ' + r.customerName, 'Phone: ' + (r.customerPhone || '-'), 'Email: ' + (r.customerEmail || '-'),
        'Job: ' + (r.jobTitle || '-'), 'Completed: ' + r.completedDate, 'Status: ' + r.status);
    } else if (type === 'message') {
      lines.push('To: ' + FOUNDERS_EMAIL, 'Category: ' + r.category, 'Subject: ' + r.subject, '', r.body);
    }
    return lines.join('\n');
  }

  function recordName(type, r) {
    if (type === 'invoice') return 'Invoice #' + r.id + ' (' + r.customerName + ')';
    if (type === 'followup' || type === 'lead') return r.contactName || r.name;
    if (type === 'review') return r.customerName + '’s review record';
    return '“' + r.subject + '”';
  }

  function askDeleteRecord(type, id) {
    const rec = findRecord(type, id);
    if (!rec) return;
    AppState.pendingDelete = { type: type, id: id };
    const kind = type === 'message' ? 'message' : FORM_META[type].label;
    document.getElementById('delete-record-text').textContent =
      'This permanently deletes the ' + kind + ' ' + recordName(type, rec) + '. This can’t be undone.' +
      (type === 'lead' ? ' Its follow-ups and review record are kept; delete them separately if you want them gone too.' : '');
    openModal('delete-record-modal');
  }

  async function confirmDeleteRecord() {
    const pd = AppState.pendingDelete;
    if (!pd) return;
    const api = window.CeriumAPI;
    const calls = { lead: api.deleteLead, followup: api.deleteFollowUp, invoice: api.deleteInvoice, review: api.deleteReview, message: api.deleteMessage };
    await calls[pd.type](pd.id);
    AppState.pendingDelete = null;
    closeModal('delete-record-modal');
    AppState.workspace = await api.getWorkspace();
    renderAll();
    showToast('Deleted.', 'ok');
  }

  /* ================= Messages to the founders ================= */
  function appInfoText() {
    return 'Tab: ' + AppState.currentTab + ' | Browser: ' + navigator.userAgent + ' | Screen: ' + window.innerWidth + 'x' + window.innerHeight + ' | Date: ' + new Date().toISOString();
  }

  /** Returns the composed message, or null if the form is incomplete. */
  function readMessageForm() {
    const form = document.getElementById('new-message-form');
    if (!form.reportValidity()) return null;
    const category = document.getElementById('msg-category').value;
    const subject = document.getElementById('msg-subject').value.trim();
    const text = document.getElementById('msg-body').value.trim();
    const replyTo = document.getElementById('msg-reply').value.trim();
    const withInfo = document.getElementById('msg-include-info').checked;
    const name = (AppState.workspace.account.name || '').trim();
    const body = text + '\n\n— ' + name + ' (' + replyTo + ')' + (withInfo ? '\n\n--- App info ---\n' + appInfoText() : '');
    return { category: category, subject: subject, text: text, replyTo: replyTo, mailSubject: '[Cerium · ' + category + '] ' + subject, mailBody: body };
  }

  async function saveMessageCopy(m, via) {
    await window.CeriumAPI.createMessage({ category: m.category, subject: m.subject, body: m.text, replyTo: m.replyTo, via: via });
    AppState.workspace = await window.CeriumAPI.getWorkspace();
    renderMessagesView();
  }

  async function sendMessageViaEmailApp() {
    const m = readMessageForm();
    if (!m) return;
    await saveMessageCopy(m, 'Email app');
    document.getElementById('msg-subject').value = '';
    document.getElementById('msg-body').value = '';
    window.location.href = 'mailto:' + FOUNDERS_EMAIL + '?subject=' + encodeURIComponent(m.mailSubject) + '&body=' + encodeURIComponent(m.mailBody);
    showToast('Your email app should open. Press Send there to deliver it. A copy is saved below.', 'ok');
  }

  async function sendMessageViaGmail() {
    const m = readMessageForm();
    if (!m) return;
    await saveMessageCopy(m, 'Gmail');
    document.getElementById('msg-subject').value = '';
    document.getElementById('msg-body').value = '';
    window.open('//mail.google.com/mail/?view=cm&fs=1&to=' + encodeURIComponent(FOUNDERS_EMAIL) +
      '&su=' + encodeURIComponent(m.mailSubject) + '&body=' + encodeURIComponent(m.mailBody), '_blank', 'noopener');
    showToast('Gmail opened in a new tab. Press Send there to deliver it.', 'ok');
  }

  function renderMessagesView() {
    const ws = AppState.workspace;
    const reply = document.getElementById('msg-reply');
    if (reply && !reply.value && document.activeElement !== reply) reply.value = ws.account.email || '';
    const list = document.getElementById('messages-list');
    if (!list) return;
    if (!ws.messages.length) {
      list.innerHTML = '<div class="empty-box"><b>No messages yet</b><span>Messages you send to the founders will be kept here.</span></div>';
      return;
    }
    list.innerHTML = ws.messages.map(function (m) {
      const excerpt = m.body.length > 160 ? m.body.slice(0, 160) + '…' : m.body;
      return '<div class="pn-row"><div class="row-main">' +
        '<span class="row-title">' + escapeHtml(m.subject) + '</span>' +
        '<span class="row-meta">' + escapeHtml(m.category) + ' · ' + escapeHtml(String(m.createdAt).slice(0, 10)) + ' · via ' + escapeHtml(m.via) + '</span>' +
        '<span style="display:block;margin-top:5px;font-size:13px;color:var(--mut);white-space:pre-wrap">' + escapeHtml(excerpt) + '</span>' +
      '</div>' + recordActions('message', m.id) + '</div>';
    }).join('');
  }

  /* ================= Donate ================= */
  function renderDonateButton() {
    const btn = document.getElementById('donate-primary');
    if (btn) btn.textContent = DONATE_URL ? 'Donate' : 'Email us to chip in';
  }

  function handleDonateNow() {
    if (DONATE_URL) {
      window.open(DONATE_URL, '_blank', 'noopener');
    } else {
      window.location.href = 'mailto:' + FOUNDERS_EMAIL + '?subject=' + encodeURIComponent('Supporting Cerium') +
        '&body=' + encodeURIComponent('Hi Cerium team,\n\nI would like to support Cerium. How can I contribute?\n\nThank you!');
    }
    closeModal('donate-modal');
  }

  async function initApp() {
    AppState.workspace = await window.CeriumAPI.getWorkspace();
    AppState.quoteIndex = Math.floor(Math.random() * CREW_QUOTES.length);
    showQuote(AppState.quoteIndex);
    renderAll();

    document.addEventListener('click', function (e) {
      handleClick(e).catch(function (err) {
        console.error(err);
        showToast('Something went wrong: ' + (err && err.message ? err.message : 'please try again.'), 'warn');
      });
    });

    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hideRecMenu(); });
    window.addEventListener('scroll', function () {
      // ignore the tail of a smooth scroll that was already running when the menu opened
      if (Date.now() - (AppState.menuOpenedAt || 0) > 350) hideRecMenu();
    }, true);
    window.addEventListener('resize', hideRecMenu);

    // Keyboard support for div[role="button"] cards (Enter / Space)
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const el = e.target;
      if (el && el.getAttribute && el.getAttribute('role') === 'button' && el.tagName !== 'BUTTON') {
        e.preventDefault();
        el.click();
      }
    });

    // Click on the dimmed backdrop closes a dialog
    document.addEventListener('mousedown', function (e) {
      if (e.target && e.target.tagName === 'DIALOG' && e.target.open) {
        const r = e.target.getBoundingClientRect();
        const outside = e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
        if (outside) e.target.close();
      }
    });

    async function handleClick(e) {
      if (!e.target.closest('#rec-menu') && !e.target.closest('[data-action="toggle-menu"]')) hideRecMenu();
      const actionEl = e.target.closest('[data-action]');
      if (actionEl) {
        const action = actionEl.getAttribute('data-action');
        if (action === 'enter-workspace') {
          e.preventDefault();
          const targetTab = actionEl.getAttribute('data-tab') || 'today';
          enterWorkspace(targetTab);
          showToast('Welcome in, ' + userFirstName() + '! Wishing you a great day on the job.', 'ok');
          return;
        }
        if (action === 'enter-and-modal') {
          e.preventDefault();
          enterWorkspace('leads');
          prepareNewForm(actionEl.getAttribute('data-modal'));
          openModal(actionEl.getAttribute('data-modal'));
          return;
        }
        if (action === 'show-welcome') {
          e.preventDefault();
          showWelcomeScreen();
          return;
        }
        if (action === 'cycle-quote') {
          e.preventDefault();
          cycleWelcomeQuote();
          return;
        }
      }

      const tabBtn = e.target.closest('[data-tab]');
      if (tabBtn && (tabBtn.classList.contains('nav-tab') || tabBtn.getAttribute('data-action') === 'switch-tab')) {
        e.preventDefault();
        switchTab(tabBtn.getAttribute('data-tab'));
        return;
      }

      const stageFilterBtn = e.target.closest('[data-lead-stage]');
      if (stageFilterBtn) {
        AppState.leadStageFilter = stageFilterBtn.getAttribute('data-lead-stage');
        renderLeadsAndFollowUpsViews();
        return;
      }

      const viewModeBtn = e.target.closest('[data-lead-view]');
      if (viewModeBtn) {
        AppState.leadViewMode = viewModeBtn.getAttribute('data-lead-view');
        renderLeadsAndFollowUpsViews();
        return;
      }

      const fuFilterBtn = e.target.closest('[data-fu-filter]');
      if (fuFilterBtn) {
        AppState.followUpFilter = fuFilterBtn.getAttribute('data-fu-filter');
        renderLeadsAndFollowUpsViews();
        return;
      }

      const invStatusBtn = e.target.closest('[data-inv-status]');
      if (invStatusBtn) {
        AppState.invoiceStatusFilter = invStatusBtn.getAttribute('data-inv-status');
        renderInvoicesAndBankViews();
        return;
      }

      const revStatusBtn = e.target.closest('[data-rev-status]');
      if (revStatusBtn) {
        AppState.reviewStatusFilter = revStatusBtn.getAttribute('data-rev-status');
        renderReviewsView();
        return;
      }

      if (!actionEl) return;
      const action = actionEl.getAttribute('data-action');

      if (action === 'open-modal') {
        prepareNewForm(actionEl.getAttribute('data-modal'));
        openModal(actionEl.getAttribute('data-modal'));
      } else if (action === 'close-modal') {
        closeModal(actionEl.getAttribute('data-modal'));
      } else if (action === 'toggle-followup') {
        const id = actionEl.getAttribute('data-id');
        const updated = await window.CeriumAPI.toggleFollowUp(id);
        AppState.workspace = await window.CeriumAPI.getWorkspace();
        renderAll();
        showToast(updated.done ? 'Follow-up marked done!' : 'Follow-up reopened', 'ok');
      } else if (action === 'confirm-bank-match') {
        const txId = actionEl.getAttribute('data-tx-id');
        const invId = actionEl.getAttribute('data-inv-id');
        await window.CeriumAPI.resolveBankMatch(txId, 'confirm', invId);
        AppState.workspace = await window.CeriumAPI.getWorkspace();
        renderAll();
        const hasInv = invId && invId !== 'null' && invId !== 'undefined';
        showToast(hasInv ? ('Confirmed match! Invoice #' + invId + ' marked Paid.') : 'Deposit marked as matched.', 'ok');
      } else if (action === 'dismiss-bank-match') {
        const txId = actionEl.getAttribute('data-tx-id');
        await window.CeriumAPI.resolveBankMatch(txId, 'dismiss');
        AppState.workspace = await window.CeriumAPI.getWorkspace();
        renderAll();
        showToast('Deposit match suggestion dismissed.', 'warn');
      } else if (action === 'sync-bank') {
        const sync = await window.CeriumAPI.syncBankFeed();
        AppState.workspace = await window.CeriumAPI.getWorkspace();
        renderAll();
        if (!sync.connected) {
          showToast('Connect your bank feed first, then sync.', 'warn');
        } else {
          showToast(sync.newCount > 0 ? (sync.newCount + ' new deposit(s) found.') : 'Bank feed synced. No new deposits found.', 'ok');
        }
      } else if (action === 'preview-invoice') {
        openInvoicePreviewModal(actionEl.getAttribute('data-id'));
      } else if (action === 'print-invoice-pdf') {
        window.print();
      } else if (action === 'download-invoice-file') {
        downloadCurrentInvoiceFile();
      } else if (action === 'mark-invoice-paid') {
        const invId = actionEl.getAttribute('data-id');
        await window.CeriumAPI.updateInvoiceStatus(invId, 'Paid');
        AppState.workspace = await window.CeriumAPI.getWorkspace();
        renderAll();
        showToast('Invoice #' + invId + ' marked as Paid!', 'ok');
      } else if (action === 'lead-to-invoice') {
        const leadId = actionEl.getAttribute('data-id');
        const lead = AppState.workspace.leads.find(function (l) { return l.id === leadId; });
        if (lead) {
          document.getElementById('new-invoice-form').reset();
          setFormMode('invoice', '');
          document.getElementById('inv-customer-name').value = lead.name;
          document.getElementById('inv-customer-email').value = lead.email || '';
          document.getElementById('inv-customer-address').value = lead.address || '';
          document.getElementById('inv-job-title').value = lead.notes || 'Service Job';
          document.getElementById('inv-amount').value = lead.value || '';
          openModal('new-invoice-modal');
        }
      } else if (action === 'send-review-request') {
        const revId = actionEl.getAttribute('data-id');
        const rev = await window.CeriumAPI.sendReviewRequest(revId);
        AppState.workspace = await window.CeriumAPI.getWorkspace();
        renderAll();
        showToast('Direct Google review link sent to ' + rev.customerName + '!', 'ok');
      } else if (action === 'mark-review-received') {
        const revId = actionEl.getAttribute('data-id');
        const rev = await window.CeriumAPI.markReviewReceived(revId);
        AppState.workspace = await window.CeriumAPI.getWorkspace();
        renderAll();
        showToast('Recorded 5★ review from ' + rev.customerName + '!', 'ok');
      } else if (action === 'copy-google-link') {
        const url = document.getElementById('google-review-link-input').value.trim();
        if (!url) {
          showToast('Paste your Google review link first, then copy it.', 'warn');
        } else {
          copyTextToClipboard(url, 'Direct Google review link copied!');
        }
      } else if (action === 'toggle-bank-connection') {
        const acc = await window.CeriumAPI.toggleBankConnection();
        AppState.workspace = await window.CeriumAPI.getWorkspace();
        renderAll();
        showToast(acc.bankConnected ? 'Read-only bank feed connected!' : 'Bank connection turned off.', 'ok');
      } else if (action === 'toggle-plan-status') {
        if (AppState.workspace.account.planStatus === 'active') {
          showToast('Your Pro plan ($20/month) is active. Cancel anytime from your account settings.', 'ok');
        } else if (window.CeriumBilling) {
          window.CeriumBilling.startSubscriptionCheckout({
            onComplete: async function (res) {
              AppState.workspace = await window.CeriumAPI.getWorkspace();
              renderAll();
              showToast('🎉 Cerium Pro ($20/month) is now active!', 'ok');
            },
            onError: function (err) {
              showToast(err && err.message ? err.message : 'Subscription checkout was canceled.', 'warn');
            }
          });
        }
      } else if (action === 'logout') {
        await window.CeriumAPI.logout();
      } else if (action === 'delete-account') {
        if (confirm('Are you sure you want to permanently delete your account and all data? This cannot be undone.')) {
          await window.CeriumAPI.deleteAccount();
          window.location.href = '/index.html';
        }
      } else if (action === 'export-my-data') {
        const data = await window.CeriumAPI.exportMyData();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'cerium-my-data.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('Exported cerium-my-data.json!', 'ok');
      } else if (action === 'toggle-menu') {
        showRecMenu(actionEl);
      } else if (action === 'edit-record') {
        hideRecMenu();
        openEditRecord(actionEl.getAttribute('data-type'), actionEl.getAttribute('data-id'));
      } else if (action === 'copy-record') {
        hideRecMenu();
        const rt = actionEl.getAttribute('data-type');
        const rec = findRecord(rt, actionEl.getAttribute('data-id'));
        if (rec) copyTextToClipboard(recordToText(rt, rec), 'Copied to clipboard!');
      } else if (action === 'delete-record') {
        hideRecMenu();
        askDeleteRecord(actionEl.getAttribute('data-type'), actionEl.getAttribute('data-id'));
      } else if (action === 'confirm-delete-record') {
        await confirmDeleteRecord();
      } else if (action === 'copy-my-data') {
        const all = await window.CeriumAPI.exportMyData();
        copyTextToClipboard(JSON.stringify(all, null, 2), 'All your data was copied as JSON!');
      } else if (action === 'copy-message-draft') {
        const m = readMessageForm();
        if (m) copyTextToClipboard('To: ' + FOUNDERS_EMAIL + '\nSubject: ' + m.mailSubject + '\n\n' + m.mailBody, 'Message copied. Paste it into any email.');
      } else if (action === 'open-gmail') {
        await sendMessageViaGmail();
      } else if (action === 'copy-founders-email') {
        copyTextToClipboard(FOUNDERS_EMAIL, 'Founders’ email address copied!');
      } else if (action === 'donate-now') {
        handleDonateNow();
      } else if (action === 'donate-feedback') {
        closeModal('donate-modal');
        enterWorkspace('messages');
      } else if (action === 'confirm-delete-data') {
        await window.CeriumAPI.deleteWorkspaceData();
        AppState.workspace = await window.CeriumAPI.getWorkspace();
        closeModal('delete-data-modal');
        renderAll();
        showToast('All leads, follow-ups, invoices, deposits and reviews were deleted.', 'warn');
      }
    }

    document.addEventListener('change', async function (e) {
      const stageSel = e.target.closest('[data-action="change-lead-stage"]');
      if (stageSel) {
        const id = stageSel.getAttribute('data-id');
        const newStage = stageSel.value;
        await window.CeriumAPI.updateLead(id, { stage: newStage });
        AppState.workspace = await window.CeriumAPI.getWorkspace();
        renderAll();
        showToast('Lead moved to ' + newStage + (newStage === 'Done' ? ' (Review request queued!)' : ''), 'ok');
        return;
      }

      if (e.target.id === 'lead-source-select') {
        AppState.leadSourceFilter = e.target.value;
        renderLeadsAndFollowUpsViews();
      }
    });

    const googleLinkInput = document.getElementById('google-review-link-input');
    if (googleLinkInput) {
      googleLinkInput.addEventListener('change', async function () {
        await window.CeriumAPI.updateAccount({ googlePlaceUrl: googleLinkInput.value.trim() });
        AppState.workspace = await window.CeriumAPI.getWorkspace();
        showToast('Google review link saved.', 'ok');
      });
    }

    const leadSearchInput = document.getElementById('lead-search-input');
    if (leadSearchInput) {
      leadSearchInput.addEventListener('input', function (e) {
        AppState.leadSearch = e.target.value;
        renderLeadsAndFollowUpsViews();
      });
    }

    const invSearchInput = document.getElementById('invoice-search-input');
    if (invSearchInput) {
      invSearchInput.addEventListener('input', function (e) {
        AppState.invoiceSearch = e.target.value;
        renderInvoicesAndBankViews();
      });
    }

    const newLeadForm = document.getElementById('new-lead-form');
    if (newLeadForm) {
      newLeadForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        const fd = new FormData(newLeadForm);
        const editId = fd.get('id');
        if (editId) {
          await window.CeriumAPI.updateLead(editId, {
            name: String(fd.get('name')).trim(), phone: String(fd.get('phone')).trim(), email: String(fd.get('email')).trim(),
            address: String(fd.get('address')).trim(), source: fd.get('source'), stage: fd.get('stage'),
            value: Number(fd.get('value')) || 0, nextFollowUp: fd.get('nextFollowUp'), notes: String(fd.get('notes')).trim()
          });
          newLeadForm.reset(); setFormMode('lead', '');
          closeModal('new-lead-modal');
          AppState.workspace = await window.CeriumAPI.getWorkspace();
          renderAll();
          showToast('Lead updated.', 'ok');
          return;
        }
        const lead = await window.CeriumAPI.createLead({
          name: fd.get('name'),
          phone: fd.get('phone'),
          email: fd.get('email'),
          address: fd.get('address'),
          source: fd.get('source'),
          stage: fd.get('stage'),
          value: fd.get('value'),
          nextFollowUp: fd.get('nextFollowUp'),
          notes: fd.get('notes'),
          createReminder: true
        });
        newLeadForm.reset();
        closeModal('new-lead-modal');
        AppState.workspace = await window.CeriumAPI.getWorkspace();
        renderAll();
        showToast('Saved lead for ' + lead.name + ' & scheduled follow-up!', 'ok');
      });
    }

    const newFuForm = document.getElementById('new-followup-form');
    if (newFuForm) {
      newFuForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        const fd = new FormData(newFuForm);
        const editId = fd.get('id');
        if (editId) {
          await window.CeriumAPI.updateFollowUp(editId, {
            contactName: fd.get('contactName'), phone: fd.get('phone'), channel: fd.get('channel'),
            dueDate: fd.get('dueDate'), task: fd.get('task')
          });
          newFuForm.reset(); setFormMode('followup', '');
          closeModal('new-followup-modal');
          AppState.workspace = await window.CeriumAPI.getWorkspace();
          renderAll();
          showToast('Follow-up updated.', 'ok');
          return;
        }
        const fu = await window.CeriumAPI.createFollowUp({
          contactName: fd.get('contactName'),
          phone: fd.get('phone'),
          channel: fd.get('channel'),
          dueDate: fd.get('dueDate'),
          task: fd.get('task')
        });
        newFuForm.reset();
        closeModal('new-followup-modal');
        AppState.workspace = await window.CeriumAPI.getWorkspace();
        renderAll();
        showToast('Added follow-up reminder for ' + fu.contactName + '!', 'ok');
      });
    }

    const newInvForm = document.getElementById('new-invoice-form');
    if (newInvForm) {
      newInvForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        const fd = new FormData(newInvForm);
        const terms = fd.get('terms') || 'Net 15';
        const editId = fd.get('id');
        if (editId) {
          await window.CeriumAPI.updateInvoice(editId, {
            customerName: fd.get('customerName'), customerEmail: fd.get('customerEmail'), customerAddress: fd.get('customerAddress'),
            jobTitle: fd.get('jobTitle'), terms: terms, status: fd.get('status'), amount: fd.get('amount'), notes: fd.get('notes')
          });
          newInvForm.reset(); setFormMode('invoice', '');
          closeModal('new-invoice-modal');
          AppState.workspace = await window.CeriumAPI.getWorkspace();
          renderAll();
          showToast('Invoice #' + editId + ' updated.', 'ok');
          return;
        }
        const inv = await window.CeriumAPI.createInvoice({
          customerName: fd.get('customerName'),
          customerEmail: fd.get('customerEmail'),
          customerAddress: fd.get('customerAddress'),
          jobTitle: fd.get('jobTitle'),
          terms: terms,
          status: fd.get('status') || 'Sent',
          amount: fd.get('amount'),
          notes: fd.get('notes')
        });
        newInvForm.reset();
        closeModal('new-invoice-modal');
        AppState.workspace = await window.CeriumAPI.getWorkspace();
        renderAll();
        showToast('Created Invoice #' + inv.id + ' (' + formatMoney(inv.total) + ')!', 'ok');
      });
    }

    const newRevForm = document.getElementById('new-review-form');
    if (newRevForm) {
      newRevForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        const fd = new FormData(newRevForm);
        const editId = fd.get('id');
        if (editId) {
          await window.CeriumAPI.updateReview(editId, {
            customerName: fd.get('customerName'), customerPhone: fd.get('customerPhone'),
            customerEmail: fd.get('customerEmail'), jobTitle: fd.get('jobTitle')
          });
          newRevForm.reset(); setFormMode('review', '');
          closeModal('new-review-modal');
          AppState.workspace = await window.CeriumAPI.getWorkspace();
          renderAll();
          showToast('Review record updated.', 'ok');
          return;
        }
        const rev = await window.CeriumAPI.createReviewRequest({
          customerName: fd.get('customerName'),
          customerPhone: fd.get('customerPhone'),
          customerEmail: fd.get('customerEmail'),
          jobTitle: fd.get('jobTitle')
        });
        newRevForm.reset();
        closeModal('new-review-modal');
        AppState.workspace = await window.CeriumAPI.getWorkspace();
        renderAll();
        showToast('Sent Google review link to ' + rev.customerName + '!', 'ok');
      });
    }

    const hints = {
      'Bug report': ['e.g. Invoice PDF cuts off the last line', 'What you did, what you expected, and what happened instead.'],
      'Suggestion': ['e.g. Add a dark mode', 'What problem would this solve for you?'],
      'Product question': ['e.g. How does bank matching work?', 'Which tab or feature is your question about?'],
      'Service / billing question': ['e.g. Question about my plan', 'Tell us what you need help with.'],
      'Other': ['What is this about?', 'Tell us more.']
    };
    const catSel = document.getElementById('msg-category');
    function applyHint() {
      const h = hints[catSel.value] || hints.Other;
      document.getElementById('msg-subject').placeholder = h[0];
      document.getElementById('msg-body').placeholder = h[1];
    }
    if (catSel) { catSel.addEventListener('change', applyHint); applyHint(); }

    const msgForm = document.getElementById('new-message-form');
    if (msgForm) {
      msgForm.addEventListener('submit', function (e) {
        e.preventDefault();
        sendMessageViaEmailApp().catch(function (err) { showToast('Could not send: ' + err.message, 'warn'); });
      });
    }

    const accForm = document.getElementById('account-profile-form');
    if (accForm) {
      accForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        await window.CeriumAPI.updateAccount({
          name: document.getElementById('acc-name-input').value.trim(),
          businessName: document.getElementById('acc-biz-input').value.trim(),
          trade: document.getElementById('acc-trade-input').value.trim(),
          email: document.getElementById('acc-email-input').value.trim(),
          phone: document.getElementById('acc-phone-input').value.trim(),
          location: document.getElementById('acc-loc-input').value.trim(),
          currency: document.getElementById('acc-currency-select').value
        });
        AppState.workspace = await window.CeriumAPI.getWorkspace();
        renderAll();
        showToast('Workspace profile & currency settings saved!', 'ok');
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})();
