# Cerium Guide — In-app navigation assistant

Cerium Guide adds an Ask Cerium button to the authenticated workspace. It supports questions about existing modules (including spreadsheet imports, invoices and PDF printing), contextual quick prompts and one-click navigation to the recognized section.

## Setup

This feature works without a provider: the product-specific local guide responds and offers a safe route. To enable optional natural-language answers, set these server-side environment variables, then restart Cerium:

    CERIUM_AI_API_KEY=<your key stored in server .env>
    CERIUM_AI_MODEL=gpt-4.1-mini

The service calls OpenAI Responses API from Node 22. The key never goes to the browser. On provider failure the built-in guide still answers.

## Privacy and permissions

- Only the manually typed question, current workspace section and static Cerium guide content are supplied to the provider. User account, customer, invoice and bank records are not automatically included.
- Navigation targets are allowlisted existing sections. Assistant text uses textContent, not HTML or an AI-generated URL.
- The assistant cannot initiate payments, matches, invoices, record changes, deletions or email sends.
- The API requires login, workspace onboarding, same origin, CSRF, bounded input length and rate limits.
- The widget and Privacy Policy disclose optional external question processing. Do not enter customer personal details or payment credentials.
- Chat contents are not saved to the Cerium database. Messages disappear when the page reloads.

## Verification

Run npm test for guide and existing regression tests. Run npm run preview:export to preview the local-fallback widget offline. Verify desktop and mobile layouts before deploying.

This is navigation-only v1, not an autonomous operations agent.
