/* This distribution is a local demo, with no sign-in server. */
(() => {
  document.querySelectorAll('[data-auth="user"]').forEach(el => { el.hidden = true; });
  document.querySelectorAll('a[href="app.html"]').forEach(el => {
    if (/sign in|log in|free trial|waitlist/i.test(el.textContent)) {
      const label = el.querySelector('.l');
      if (label) { label.textContent = 'Open demo'; const short=el.querySelector('.s'); if(short) short.textContent='Demo'; }
      else el.textContent = 'Open demo →';
    }
  });
})();
