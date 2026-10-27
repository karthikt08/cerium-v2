/* Legacy /welcome.html bookmark compatibility.
   Do not display an extra greeting or collect/store account details.
   The workspace itself still enforces authentication and required business setup. */
(function () {
  'use strict';

  function safeWorkspaceDestination(value) {
    if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return '/app.html';
    try {
      const target = new URL(value, window.location.origin);
      if (target.origin !== window.location.origin) return '/app.html';
      if (!['/app', '/app.html'].includes(target.pathname)) return '/app.html';
      return target.pathname + target.search + target.hash;
    } catch {
      return '/app.html';
    }
  }

  const next = new URLSearchParams(window.location.search).get('next');
  window.location.replace(safeWorkspaceDestination(next));
})();
