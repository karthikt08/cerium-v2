# CERIUM HTML/CSS entrance

The sign-in success transition (`public/enter.html`) and protected workspace
(`public/app.html`) now use the same **HTML + CSS + inline SVG** entrance.

There is no MP4 file or image dependency. A metallic blue CERIUM C mark forms,
the ERIUM wordmark reveals letter by letter, and a blue square appears with a
soft shadow and subtle shine. The animation is CSS-only; JavaScript handles
workspace readiness, Skip intro, safe redirect destinations and a timeout
fallback.

## Behavior

- Email/password sign-in, account creation, and successful Google OAuth land on
  `/enter.html` before the protected workspace.
- Visiting `/app.html` directly shows the same animation while authentication,
  mandatory onboarding and workspace API state are checked.
- The `ceriumIntro=done` query marker is removed immediately to prevent a
  duplicate replay after the sign-in transition; no browser storage is used.
- If the user prefers reduced motion, the logo appears immediately, without
  animated transitions.
- The intro lasts up to roughly 2.9 seconds when startup succeeds quickly. The
  Skip control dismisses it when the workspace is ready, without bypassing
  account checks.
- Internal workspace navigation never replays the entrance.

## Development

No asset copying, video conversion, autoplay permission, or extra dependencies
are required. Pull the GitHub branch and run `npm run dev`.

The animation appearance lives in `public/css/entry-loader.css`. Both HTML
pages intentionally share the same markup, ensuring parity without any media
files. The setup and redirect lifecycle live in `public/js/entry-loader.js`.
