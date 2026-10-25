# CERIUM HTML/CSS entrance

The sign-in success transition (`public/enter.html`) and protected workspace
(`public/app.html`) share the native HTML/CSS/inline-SVG entrance from PR #20.
A metallic blue C mark forms, the ERIUM wordmark reveals letter by letter,
and a blue square appears. There are no media files or image dependencies.

## Entry and readiness

Email/password sign-in, account creation and successful Google OAuth lead to
`/enter.html`, then to the protected workspace. Direct workspace visits run the
same intro. Internal workspace navigation does not replay it.

The CSS intro lasts about 2.9 seconds. Skip intro and reduced-motion mode settle
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
CSS/SVG, so its loader can finish when the required setup form is ready.
No media installation or additional dependency is required.

## Debug verification

- All 498 Node tests passed, including 12 lifecycle tests for early/late
  readiness, slow startup, Skip, CSS timing, reduced motion, safe destinations,
  session timeout, handoff and initialization errors.
- All 93 JavaScript files passed syntax checks. The secret scan and whitespace
  checks passed. Existing public-file and browser-storage checks retain their
  original restrictions.
- Eighteen Chromium workflows passed, including desktop/mobile native animation,
  reloads, handoff, actual email login/sign-up, onboarding enforcement, failed
  and slow initialization, delayed/missing loader script, reduced motion and
  the self-contained preview. Background controls stayed inert until readiness.
- Google, SMS and payment providers used fixtures. No live messages, accounts
  or payments were changed; other engines and real mobile devices were not tested.
- See the follow-up PR for clean-install Ubuntu and Windows CI results.
