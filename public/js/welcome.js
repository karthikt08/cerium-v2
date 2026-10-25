/**
 * CERIUM — WISHING & DAILY GREETING CONTROLLER (js/welcome.js)
 * Greets users upon sign-in with uplifting words and opens their workspace on demand.
 * Adheres strictly to zero browser storage and server-enforced authentication.
 */
(function () {
  'use strict';

  const MOTIVATIONAL_THOUGHTS = [
    {
      quote: 'Every job completed with care and excellence is a milestone in building a business that lasts. Focus on your clients, follow through on your commitments, and create momentum today.',
      author: '— The Cerium Playbook'
    },
    {
      quote: 'Success in business isn\'t luck—it\'s showing up on time, following through on your word, and taking pride in what you build with your own hands.',
      author: '— Craft & Commitment'
    },
    {
      quote: 'Small daily wins compound into extraordinary results. Your pipeline is ready, your crew is lined up, and great clients are waiting for your expertise.',
      author: '— Daily Momentum'
    },
    {
      quote: 'The best businesses are built one satisfied customer at a time. Deliver real value today, and positive word of mouth will take care of tomorrow.',
      author: '— Customer First'
    },
    {
      quote: 'Opportunity dances with those who are already on the dance floor. Stay proactive, quote with confidence, and lead your business with purpose.',
      author: '— Proactive Growth'
    },
    {
      quote: 'Focus on clear communication, over-deliver on service, and turn every estimate into a trusted client relationship that lasts for years.',
      author: '— Building Trust'
    },
    {
      quote: 'Great work speaks for itself, but consistent follow-through seals the deal. Let\'s make today productive, smooth, and successful.',
      author: '— Excellence in Execution'
    }
  ];

  function safeDestination(val) {
    if (!val || typeof val !== 'string' || !val.startsWith('/') || val.startsWith('//')) {
      return '/app.html';
    }
    try {
      const u = new URL(val, window.location.origin);
      if (u.origin !== window.location.origin) return '/app.html';
      if (!['/app', '/app.html'].includes(u.pathname)) return '/app.html';
      return u.pathname + u.search + u.hash;
    } catch {
      return '/app.html';
    }
  }

  const urlParams = new URLSearchParams(window.location.search);
  const nextTarget = safeDestination(urlParams.get('next'));

  const enterBtn = document.getElementById('welcome-enter-btn');
  const titleEl = document.getElementById('welcome-title');
  const subtitleEl = document.getElementById('welcome-subtitle');
  const quoteEl = document.getElementById('welcome-quote');
  const authorEl = document.getElementById('welcome-quote-author');
  const dateEl = document.getElementById('welcome-date');
  const bizEl = document.getElementById('welcome-biz');
  const bizNameEl = document.getElementById('welcome-biz-name');
  const badgeTextEl = document.getElementById('welcome-badge-text');

  if (enterBtn) {
    enterBtn.setAttribute('href', nextTarget);
  }

  // Format today's date
  if (dateEl) {
    const now = new Date();
    const options = { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' };
    dateEl.textContent = now.toLocaleDateString(undefined, options);
  }

  // Select motivational quote (seeded by day of the year)
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((now - startOfYear) / (24 * 60 * 60 * 1000));
  const thought = MOTIVATIONAL_THOUGHTS[dayOfYear % MOTIVATIONAL_THOUGHTS.length];

  if (quoteEl && authorEl) {
    quoteEl.textContent = '“' + thought.quote + '”';
    authorEl.textContent = thought.author;
  }

  // Time of day greeting
  const hour = now.getHours();
  let timeOfDay = 'Good morning';
  let badgeGreeting = 'Morning Greeting';
  if (hour >= 12 && hour < 17) {
    timeOfDay = 'Good afternoon';
    badgeGreeting = 'Afternoon Greeting';
  } else if (hour >= 17 && hour < 21) {
    timeOfDay = 'Good evening';
    badgeGreeting = 'Evening Greeting';
  } else if (hour >= 21 || hour < 5) {
    timeOfDay = 'Good evening';
    badgeGreeting = 'Night Greeting';
  }

  if (badgeTextEl) {
    badgeTextEl.textContent = badgeGreeting;
  }

  // Check authentication session
  fetch('/api/me', { credentials: 'same-origin', cache: 'no-store' })
    .then(function (res) {
      if (!res.ok) throw new Error('Not authenticated');
      return res.json();
    })
    .then(function (me) {
      if (!me.signedIn) {
        window.location.replace('/login.html?returnTo=' + encodeURIComponent(nextTarget));
        return;
      }

      const rawName = (me.user && me.user.name) || '';
      const firstName = rawName.trim().split(/\s+/)[0] || 'there';

      if (titleEl) {
        titleEl.textContent = timeOfDay + ', ' + firstName + '.';
      }

      const businessName = (me.user && me.user.businessName) || '';
      if (businessName && bizEl && bizNameEl) {
        bizNameEl.textContent = businessName;
        bizEl.hidden = false;
      }
    })
    .catch(function () {
      // If network fails or session check is delayed, preserve polite default greeting
      if (titleEl) {
        titleEl.textContent = timeOfDay + '.';
      }
    });

  // Enable Enter key navigation directly into workspace
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (document.activeElement?.tagName !== 'A' && enterBtn) {
        e.preventDefault();
        enterBtn.click();
      }
    }
  });
})();
