// Used on the pages that are not sign-up, log-in or the waitlist page.
// If you are signed in and on the waitlist, the "Join the waitlist" buttons change to
// "You're on the waitlist". The server decides this. It is only a label. It gives nobody any access.
import { getMe } from './api.js';

// Older versions of this site saved your name and email inside this browser.
// We do not do that any more, so remove the old copy.
try {
  localStorage.removeItem('cerium_waitlist');
} catch (e) {
  /* storage is blocked, so there is nothing to remove */
}

getMe()
  .then((me) => {
    if (!me.signedIn || !me.member) return;
    for (const a of document.querySelectorAll('a[href="signup.html"]')) {
      a.setAttribute('href', 'waitlist.html');
      const l = a.querySelector('.l');
      const s = a.querySelector('.s');
      if (l || s) {
        if (l) l.textContent = '✓ You’re on the waitlist';
        if (s) s.textContent = '✓ On the list';
      } else {
        for (let n = a.firstChild; n; n = n.nextSibling) {
          if (n.nodeType === 3 && n.nodeValue.trim()) {
            n.nodeValue = '✓ You’re on the waitlist';
            break;
          }
        }
      }
    }
  })
  .catch(() => {
    /* if the server cannot be reached, leave the buttons as they are */
  });
