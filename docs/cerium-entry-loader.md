# CERIUM badge entrance

The sign-in transition (`public/enter.html`) and workspace (`public/app.html`)
share a compact badge modeled on the supplied reference: the original ribbon-style blue C artwork on a
navy rounded-square tile, the full dark CERIUM wordmark, a blue dot, and a thin
blue rounded frame. The background is soft lavender white.

The outline draws first, the icon settles into place, the letters reveal with
short staggered transitions, and the dot appears last. It is native HTML, CSS
and an SVG outline. The existing `cerium-logo-mark-blue.png` supplies the exact
brand artwork; no video is used. The badge stays 318 × 62px on desktop and
mobile, shrinking only when the viewport cannot fit it. The 48 × 49px icon,
14px gap, 32px lettering, square dot and sampled colors follow the supplied
336 × 100px reference.

A local six-letter font subset keeps the wordmark consistent across operating
systems. It is served from `public/fonts/cerium-entrance.woff` under the existing
content security policy. Its SIL OFL license is in
`docs/licenses/cerium-entrance-font.txt`. The subset is renamed Cerium Entrance.

## Entry and readiness

Email/password sign-in, account creation and successful Google OAuth lead to
`/enter.html`, then to the protected workspace. Direct workspace visits run the
same intro. Internal workspace navigation does not replay it.

The CSS intro lasts about 1.6 seconds. Skip intro and reduced-motion mode settle
the logo immediately, while account and initialization checks still finish.
A `ceriumIntro=done` query marker skips only the duplicate animation on the
immediate same-origin handoff. The app consumes it, checks the intro referrer
and fresh-navigation type, and retains safe query strings and fragments.
Reloads show the intro again. No browser storage or cookies track animation.

The loader requires explicit app readiness before uncovering workspace data,
mandatory business setup or a recovery screen. A retained readiness signal also
handles initialization finishing before the deferred loader runs. The animation
never grants authentication, changes onboarding completion or starts a trial.

## Recovery and accessibility

While the cover is active, workspace controls and the underlying skip link are
inert. Their original state and appropriate focus are restored on dismissal.
If initialization fails, the app recovery screen is shown immediately.

After twelve seconds without app readiness, the loader displays a connection
message and retry button, keeping unfinished content covered. A seven-second
abort bounds the interstitial's session request. If the loader script itself
fails, successful app initialization removes the static cover after document
loading completes. Server-side access checks continue to enforce all gates.

The standalone preview embeds the entry controller as well as the existing
CSS/SVG, and embeds the icon and font, so it works offline and its loader can
finish when the required setup form is ready. No installation is required.

## Verification for the reference correction

- All 498 Node tests passed, including entrance/authentication and readiness tests.
- Eight Chromium viewport checks cover 320, 390, 768 and 1440px with normal
  and reduced motion. They verify the reference font loads under the real CSP,
  the wordmark width, unclipped badge/caption bounds, and readiness after Skip.
- The standalone export embeds the original icon and font. The secret scan and
  whitespace checks pass. See the correction PR for clean-install CI results.
