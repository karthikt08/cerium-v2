/* CERIUM workspace entry. Public loading UI never substitutes for server auth. */
(function () {
  'use strict';
  const scene = document.querySelector('[data-cerium-entry]');
  if (!scene) return;
  const video = scene.querySelector('video');
  const skip = scene.querySelector('[data-entry-skip]');
  const mode = scene.dataset.ceriumEntry;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const storageKey = 'cerium-entry-watched';
  const getFlag = () => {
    try { const seen = sessionStorage.getItem(storageKey); sessionStorage.removeItem(storageKey); return seen === '1'; }
    catch { return false; }
  };
  const setFlag = () => { try { sessionStorage.setItem(storageKey, '1'); } catch {} };
  const validNext = value => {
    if (!value || !value.startsWith('/') || value.startsWith('//')) return '/app.html';
    try {
      const u = new URL(value, location.origin);
      return u.origin === location.origin && ['/app', '/app.html'].includes(u.pathname)
        ? u.pathname + u.search + u.hash : '/app.html';
    } catch { return '/app.html'; }
  };
  const next = validNext(new URLSearchParams(location.search).get('next'));
  if (mode === 'workspace' && getFlag()) {
    scene.hidden = true;
    window.CeriumEntryLoader = { complete() {}, fail() {} };
    return;
  }
  if (reduced) {
    scene.classList.add('no-video');
    video?.pause();
  } else if (video) {
    video.src = video.dataset.asset;
    video.playbackRate = 2;
    video.addEventListener('error', () => scene.classList.add('no-video'), {once:true});
    video.play().catch(() => scene.classList.add('no-video'));
  } else {
    scene.classList.add('no-video');
  }

  const begun = performance.now();
  const minimumMs = reduced ? 0 : 2900;
  let ready = false;
  let skipRequested = false;
  let finished = false;
  let pendingTimer;
  function exit() {
    if (finished || !ready) return;
    finished = true;
    clearTimeout(pendingTimer);
    if (mode === 'redirect') {
      setFlag(); // app.html will not play a duplicate entrance after this one.
      location.replace(next);
    } else {
      scene.classList.add('is-leaving');
      setTimeout(() => { scene.hidden = true; video?.pause(); }, reduced ? 0 : 260);
    }
  }
  function schedule(force = false) {
    if (!ready || finished) return;
    const delay = force || skipRequested ? 0 : Math.max(0, minimumMs - (performance.now() - begun));
    clearTimeout(pendingTimer);
    if (delay) pendingTimer = setTimeout(exit, delay);
    else exit();
  }
  skip?.addEventListener('click', () => {
    skipRequested = true;
    schedule(true);
    if (!ready && mode === 'workspace') {
      // Do not display an uninitialized workspace before its API calls finish.
      scene.querySelector('.entry-caption').textContent = 'Finishing workspace setup…';
    }
  });
  if (mode === 'workspace') {
    window.CeriumEntryLoader = {
      complete() { ready = true; schedule(); },
      fail() { ready = true; schedule(true); },
    };
    // Let the application's error panel appear even when initialization fails
    // before it can call fail(). This is a UI fallback, not an auth bypass.
    setTimeout(() => { if (!ready) { ready = true; schedule(true); } }, 9000);
  } else {
    fetch('/api/me', { credentials:'same-origin', cache:'no-store',
      signal:AbortSignal.timeout(7000) })
      .then(res => { if (!res.ok) throw new Error('Session unavailable'); return res.json(); })
      .then(me => {
        if (!me.signedIn) {
          finished = true;
          location.replace('/login.html?returnTo=' + encodeURIComponent(next));
          return;
        }
        ready = true; schedule();
      })
      .catch(() => {
        // The protected workspace checks auth again and redirects to login if
        // required; don't trap the user behind a broken loading screen.
        ready = true; schedule(true);
      });
  }
})();
