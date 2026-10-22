/**
 * CERIUM — DYNAMIC NAVIGATION AUTH CONTROLLER (js/nav-auth.js)
 * Synchronizes public landing pages with authenticated user state.
 */
(function () {
  fetch('/api/me')
    .then((res) => (res.ok ? res.json() : { signedIn: false }))
    .then((data) => {
      if (!data || !data.signedIn) return;

      const userName = (data.user && data.user.name) || 'My Account';
      const userFirstName = userName.split(' ')[0];

      // Update Header Navigation buttons
      document.querySelectorAll('[data-auth="guest"]').forEach((el) => {
        el.style.display = 'none';
      });
      document.querySelectorAll('[data-auth="user"]').forEach((el) => {
        el.style.display = 'inline-flex';
      });

      // Update primary CTAs to point to Workspace
      document.querySelectorAll('.btn-auth-action').forEach((btn) => {
        btn.setAttribute('href', '/app.html');
        btn.innerHTML = `Go to Workspace →`;
      });

      // Update greeting if present
      const navUser = document.getElementById('nav-user-greeting');
      if (navUser) {
        navUser.textContent = `Hi, ${userFirstName}`;
        navUser.style.display = 'inline-block';
      }
    })
    .catch(() => {});
})();
