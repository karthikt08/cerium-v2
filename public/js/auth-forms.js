/**
 * CERIUM — AUTHENTICATION FORMS CONTROLLER (js/auth-forms.js)
 * Manages user registration, email/password login, password recovery, and error feedback.
 */
(function () {
  const urlParams = new URLSearchParams(window.location.search);
  const returnTo = readWorkspaceReturnTo(urlParams.get('returnTo'));
  const errorCode = urlParams.get('error');

  function readWorkspaceReturnTo(value) {
    if (!value || !value.startsWith('/') || value.startsWith('//')) return '/app.html';

    try {
      const target = new URL(value, window.location.origin);
      if (target.origin !== window.location.origin) return '/app.html';
      if (!['/app', '/app.html'].includes(target.pathname)) return '/app.html';
      return target.pathname + target.search + target.hash;
    } catch {
      return '/app.html';
    }
  }

  const msgEl = document.getElementById('msg');
  function showMessage(text, kind = 'err') {
    if (!msgEl) return;
    msgEl.textContent = text || '';
    msgEl.className = 'msg' + (text ? ' ' + kind : '');
  }

  // Handle OAuth error messages
  const OAUTH_ERRORS = {
    denied: ['You closed Google sign-in. You can try again when you are ready.', 'info'],
    expired: ['Sign-in timed out. Please try again.', 'err'],
    invalid: ['Authentication could not be verified. Please try again.', 'err'],
    unverified: ['Google reported an unverified email address. Please use a verified account.', 'err'],
    failed: ['Authentication failed. Please try again in a moment.', 'err'],
    slow: ['Too many attempts. Please wait a few minutes.', 'err'],
    'not-configured': ['Google OAuth is not configured on this server yet.', 'info'],
  };
  if (errorCode && OAUTH_ERRORS[errorCode]) {
    showMessage(OAUTH_ERRORS[errorCode][0], OAUTH_ERRORS[errorCode][1]);
    history.replaceState(null, '', window.location.pathname);
  }

  if (urlParams.get('reset') === '1') {
    showMessage('Your password was updated successfully. Please log in.', 'ok');
  }

  // Preserve returnTo in Google OAuth form
  const googleForm = document.getElementById('google-auth-form') || document.getElementById('wl');
  if (googleForm) {
    let retInput = googleForm.querySelector('input[name="returnTo"]');
    if (!retInput) {
      retInput = document.createElement('input');
      retInput.type = 'hidden';
      retInput.name = 'returnTo';
      googleForm.appendChild(retInput);
    }
    retInput.value = returnTo;

    googleForm.addEventListener('submit', function () {
      const btn = googleForm.querySelector('button[type="submit"]');
      if (btn) btn.disabled = true;
      showMessage('Opening Google sign-in…', 'info');
    });
  }

  // Email / Password Registration Form
  const signupForm = document.getElementById('signup-form');
  if (signupForm) {
    signupForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      const btn = signupForm.querySelector('button[type="submit"]');
      const name = (document.getElementById('name') || {}).value || '';
      const email = (document.getElementById('email') || {}).value || '';
      const password = (document.getElementById('password') || {}).value || '';
      const businessName = (document.getElementById('business') || {}).value || '';

      if (!name.trim()) return showMessage('Please enter your name.', 'err');
      if (!email.trim() || !email.includes('@')) return showMessage('Please enter a valid email address.', 'err');
      if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
        return showMessage('Password must be at least 8 characters and include at least one letter and one number.', 'err');
      }

      try {
        if (btn) { btn.disabled = true; btn.textContent = 'Creating account…'; }
        showMessage('Setting up your workspace…', 'info');

        const res = await fetch('/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ name, email, password, businessName }),
        });
        const data = await res.json();
        if (!res.ok) {
          if (btn) { btn.disabled = false; btn.textContent = 'Create Free Account'; }
          return showMessage(data.message || 'Registration failed. Please try again.', 'err');
        }

        showMessage('Account created! Opening your Cerium Workspace…', 'ok');
        setTimeout(() => {
          window.location.href = returnTo;
        }, 350);
      } catch (err) {
        if (btn) { btn.disabled = false; btn.textContent = 'Create Free Account'; }
        showMessage('Network error during registration. Please check your connection.', 'err');
      }
    });
  }

  // Email / Password Login Form
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      const btn = loginForm.querySelector('button[type="submit"]');
      const email = (document.getElementById('email') || {}).value || '';
      const password = (document.getElementById('password') || {}).value || '';

      if (!email.trim() || !password) {
        return showMessage('Please enter your email and password.', 'err');
      }

      try {
        if (btn) { btn.disabled = true; btn.textContent = 'Signing in…'; }
        showMessage('Verifying credentials…', 'info');

        const res = await fetch('/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (!res.ok) {
          if (btn) { btn.disabled = false; btn.textContent = 'Sign In'; }
          return showMessage(data.message || 'Incorrect email or password.', 'err');
        }

        showMessage('Welcome back! Opening your workspace…', 'ok');
        setTimeout(() => {
          window.location.href = returnTo;
        }, 300);
      } catch (err) {
        if (btn) { btn.disabled = false; btn.textContent = 'Sign In'; }
        showMessage('Unable to reach server. Please try again.', 'err');
      }
    });
  }

  // Forgot Password Form
  const forgotForm = document.getElementById('forgot-form');
  if (forgotForm) {
    forgotForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      const btn = forgotForm.querySelector('button[type="submit"]');
      const email = (document.getElementById('email') || {}).value || '';

      if (!email.trim()) return showMessage('Please enter your email address.', 'err');

      try {
        if (btn) { btn.disabled = true; btn.textContent = 'Sending link…'; }
        const res = await fetch('/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ email }),
        });
        const data = await res.json();
        if (btn) { btn.disabled = false; btn.textContent = 'Send Reset Instructions'; }

        if (data.resetUrl) {
          showMessage('Development link generated: ' + data.resetUrl, 'ok');
          const devLink = document.getElementById('dev-reset-link');
          if (devLink) {
            devLink.innerHTML = `<a href="${data.resetUrl}" style="color:var(--ac);font-weight:600">Click here to test your password reset link</a>`;
            devLink.hidden = false;
          }
        } else {
          showMessage('If an account exists with this email, instructions have been sent.', 'ok');
        }
      } catch (err) {
        if (btn) { btn.disabled = false; btn.textContent = 'Send Reset Instructions'; }
        showMessage('Failed to send reset link. Please check your connection.', 'err');
      }
    });
  }

  // Reset Password Form
  const resetForm = document.getElementById('reset-form');
  if (resetForm) {
    const token = urlParams.get('token');
    if (!token) {
      showMessage('Password reset token is missing from the address bar.', 'err');
      const submitBtn = resetForm.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
    }

    resetForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      const btn = resetForm.querySelector('button[type="submit"]');
      const newPassword = (document.getElementById('password') || {}).value || '';
      const confirmPassword = (document.getElementById('confirm-password') || {}).value || '';

      if (newPassword !== confirmPassword) {
        return showMessage('Passwords do not match.', 'err');
      }
      if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
        return showMessage('Password must be at least 8 characters and include at least one letter and one number.', 'err');
      }

      try {
        if (btn) { btn.disabled = true; btn.textContent = 'Updating password…'; }
        const res = await fetch('/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ token, newPassword }),
        });
        const data = await res.json();
        if (!res.ok) {
          if (btn) { btn.disabled = false; btn.textContent = 'Reset Password'; }
          return showMessage(data.message || 'Reset failed or token expired.', 'err');
        }

        showMessage('Password reset successfully! Redirecting to login…', 'ok');
        setTimeout(() => {
          window.location.href = '/login.html?reset=1';
        }, 500);
      } catch (err) {
        if (btn) { btn.disabled = false; btn.textContent = 'Reset Password'; }
        showMessage('Unable to reach server. Please try again.', 'err');
      }
    });
  }

  // Check if user is already signed in on login/signup pages
  if (document.body.classList.contains('auth-page')) {
    fetch('/api/me')
      .then((r) => r.json())
      .then((data) => {
        if (data && data.signedIn) {
          window.location.replace(returnTo);
        }
      })
      .catch(() => {});
  }
})();
