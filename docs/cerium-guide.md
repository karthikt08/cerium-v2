# Cerium Guide — In-app navigation assistant

Cerium Guide adds an Ask Cerium button to the authenticated workspace. It answers questions about existing Cerium modules (including spreadsheet imports, invoices and PDFs), suggests steps and offers a button to navigate to a known section.

## Expandable feature-tab workspace

Cerium Marketing uses a horizontal, angled tab row **above one large, shared content screen**, based on the product sketch. The original three features remain real, working sections: Get found and chosen (human-reviewed drafts and reviews), Re-book and re-engage (opt-in follow-up tasks), and Track performance (recorded activity only).

The tab rail scrolls horizontally on narrow screens and when future features are added. Switching tabs preserves an edited draft. Keyboard arrow keys, Home and End work, and each registered tab can be linked directly from Ask Cerium.

To add a new Marketing feature:

1. Register its key and label in `public/js/marketing-features.js`. This approved registry also controls the workspace router and safe deep links.
2. Implement a matching `data-marketing-panel` section with the same key inside `renderMarketingPage()` in `public/js/marketing-page.js`. Add actual behavior, not placeholder tabs.
3. Test rendering, keyboard/deep-link navigation, permissions and data safety. Run `npm test` and the offline preview exporter.

Styles in `public/css/marketing.css` are horizontal and overflow-safe; no redesign is required when adding another tab. Unregistered feature links are rejected.

### Design direction

The previous large hero and side rail were replaced with a shorter Marketing heading, slanted browser-like top tabs and one full-width, tall work surface. Cerium retains its violet palette. Existing draft editing, manual check-ins, analytics and AI links are preserved.

## Clickable verified page links and Marketing deep links

Ask Cerium now returns real, clickable same-app page links (`#leads`, `#invoices`, `#reviews`, and so on) along with concise guidance. Cross-tool workflows expose links for each step, while business tool advice offers direct links to relevant installed modules and a Settings review link. The links are generated from a shared internal allowlist, never assembled from generated model text. Unknown questions and greetings do not get misleading navigation links.

The new Marketing workspace has addressable sections:
- `#marketing/visibility` — Get found and chosen (review requests and editable social/profile drafts).
- `#marketing/reengage` — Re-book and re-engage (candidate check-ins using existing paid invoice records, with an explicitly approved task-save).
- `#marketing/performance` — Track performance (lead sources, review activity, follow-ups and returning customers from recorded data).

Marketing is a cross-cutting workspace entry alongside Overview and Settings. It does not auto-publish, auto-message, track campaign ROI or generate unverified Google ratings. Drafts stay editable and do not require a paid AI provider. A user's explicit click is required before saving a check-in follow-up, and any actual outreach is separately handled by the user.

## Conversational guidance and advanced workflow plans

Ask Cerium recognizes greetings (e.g. "hi"), help/capabilities questions, acknowledgements and frustration **before** trying to route anywhere. These turns are answered locally, even if OpenAI or Ollama is configured.

- Questions such as "Where can I save an invoice PDF?" receive short task-specific answers and an allowlisted Open Invoices action, not repeated generic help text.
- The chat remembers only the last verified navigation section while the page stays open. "How do I do that?" can use that context; without a prior relevant feature, the assistant asks which task the user meant.
- Natural descriptions of businesses ("I run a bakery") can trigger the existing local business tool advisor. Business follow-ups continue until a suitable description is available.
- **Advanced multi-step operations:** The assistant guides users through complex contractor workflows with step-by-step numbered plans and verified direct-action buttons:
  - **Accepted quote conversion:** Confirm approval in Estimates & quotes, book appointments in Jobs & dispatch, then bill completed work in Invoices (`quotes` → `jobs` → `invoices`).
  - **Partial payments & bank reconciliation:** Inspect remaining invoice balance, match incoming deposits in Payments, and verify automatic balance updates (`invoices` → `payments`).
  - **GST & tax invoice preparation:** Review business tax declarations in Settings, apply line-item tax rates, and inspect the preview breakdown before saving PDFs (`settings` → `invoices`).
  - **Bulk contact import & scheduling:** Upload spreadsheets in Leads, inspect duplicate flags, and book work in Jobs & dispatch (`leads` → `jobs`).
  - **Crew dispatch & conflict resolution:** Identify overlapping technician slots in Jobs & dispatch and record briefing notes in Follow-ups (`jobs` → `followups`).
  - **Customer review requests:** Mark completed jobs as Done and send feedback requests in Reviews (`jobs` → `reviews`).
  - **Month-end financial closeout & tax export:** Verify balances in Invoices and Payments, then export complete accounting records from Settings (`invoices` → `payments` → `settings`).
- **Domain intelligence & contractor operational expertise:**
  - **Contractor best practices & policies:** Guides users on payment terms (Due on receipt vs Net 15/30), upfront customer deposits (20–50% retainers before dispatch), change orders (revised estimates for out-of-scope work), delinquent client escalation protocols, job costing and markup formulas (overhead allocation + 30–50% markup), and intrastate vs. interstate GST tax rules.
  - **Estimate vs. invoice comparative clarification:** Distinguishes pre-work proposals from post-work payment requests and surfaces dual direct-action buttons (`quotes` and `invoices`).
  - **Intelligent multi-turn follow-ups:** Subsequent questions leverage the verified prior section context (e.g. handling amount mismatches or undoing bank matches in Payments; setting terms and previewing tax subtotals in Invoices).
  - **Context-adaptive suggestion chips:** Suggestion chips dynamically update to match the active workspace module on navigation (`overview`, `invoices`, `quotes`, `jobs`, `leads`, `payments`, `reminders`, `followups`, `reviews`, `settings`).
  - **Smart intent disambiguation:** Broad queries (`pricing`, `billing`, `scheduling`, `taxes`) offer structured disambiguation with dual destination buttons rather than generic fallbacks.
- Unsupported or vague requests return a clarification with **no guessed destination**, regardless of the currently open section.
- Messages and chat context are not written to the database. Only a single verified prior section name is sent from the browser to the authenticated guide endpoint; that name is not forwarded to any AI provider.

The zero-API-cost NavLM classifier still specializes in identifying Cerium tasks; it is **not a general-purpose conversational generative model**. Conversational controls and cross-module workflow guidance are a lightweight safety and usability layer on top. For open-ended generative answers, deploy a compatible optional AI provider.

## Refined assistant UI & visual architecture

The Ask Cerium interface is designed to blend seamlessly with Cerium's software design language:
- **Elevated floating trigger:** Obsidian-violet gradient button with an ambient glow halo, high-contrast border, and purple sparkle badge.
- **Floating glassmorphic modal:** Subtle translucent border, elevated dual-drop shadow, and brand header with dynamic animated accent underline.
- **Structured step breakdown:** Complex workflows render a clear `Step-by-step workflow` card and sequentially numbered action pills (`Step 1`, `Step 2`, `Step 3`) that link directly to each module.
- **Quick-action suggestion chips:** One-click shortcuts for both common tasks and advanced operations (Quote to invoice, Reconcile deposits, GST tax invoice, Crew dispatch).
- **Responsive & accessible:** Full keyboard navigation (`Esc` to dismiss, tab-accessible buttons), dark mode contrast compliance, and strict `prefers-reduced-motion` suppression.

## Personalized tool advice for custom businesses

Ask Cerium can recommend the **existing Cerium tools** a business needs, even when the business does not fit one of the original contractor presets.

Try: "I run a mobile dog grooming business with appointments and invoices. Which Cerium tools should I use?" or "Which features fit my small clothing boutique?" The advisor proposes up to six existing modules with short explanations. For businesses needing inventory, POS, clinical records, payroll or route optimization, it notes that Cerium does not provide those products rather than pretending it does.

**Where the information comes from:**
- On authenticated API requests, Cerium reads only the signed-in user's saved trade, workspace category and currently visible module IDs. It does not read a different tenant's data.
- The user can type a different business or workflow in their question. If the context is too vague, the advisor asks for a description instead of recommending every feature.
- The recommendation engine is a local, interpretable scoring layer (public/js/business-tool-advisor.js) built on top of the existing business settings. It is **not a newly trained generative LLM**. It runs before the selected NavLM/Qwen/OpenAI provider, so a tool-advice request never sends saved business context to an external provider.
- If the API is temporarily unavailable, the browser uses the same local advisor and signed-in workspace settings for recommendations.
- Ask Cerium displays reasons and a **Review suggested tools in Settings** action. Clicking that action opens the normal customize-tools dialog with suggested modules preselected; **no settings are saved until the user clicks Save my workspace**. Hiding a module never deletes its data.
- The existing Settings > Customize tools > Suggest my tools action also uses this advisor, keeping its recommendations consistent with Ask Cerium.

This is a first version of workflow recommendations; manually check suitability for unusual businesses before saving. Recommendations do not provide compliance, licensing, payment, tax or regulatory advice.

### Detailed recommendations for all official Cerium industries

The same local advisor now has a **dedicated, actionable playbook for every industry in Cerium's Your business type menu**. It recommends essential modules, optional modules, a typical workflow, three optional business-specific refinement choices and clear limitations. The industry list and tool IDs are checked against the registered categories.

| Business type | What the advisor prioritizes | Typical workflow |
| --- | --- | --- |
| Construction & renovation | Quotes, jobs, invoices, payments; optional leads and follow-ups | Enquiry → estimate → schedule site work → invoice → review payment |
| Plumbing | Jobs, quotes, invoices, payments; optional callbacks and reviews | Customer call → estimate or job → visit → invoice → payment |
| Electrical services | Jobs, quotes, invoices, payments; optional leads and reviews | Enquiry → estimate → electrician visit → invoice → payment |
| HVAC & refrigeration | Jobs, quotes, invoices, payments; optional follow-ups and payment reminders | Service enquiry → appointment or estimate → visit → invoice |
| Cleaning & maintenance | Jobs, invoices, payments, reviews; optional repeat-customer follow-ups and leads | Enquiry → visit → invoice → feedback |
| Landscaping & gardening | Jobs, quotes, invoices, payments; optional leads and reviews | Garden enquiry → quote → scheduled work → invoice |
| Roofing | Leads, quotes, jobs, invoices; optional payments and customer follow-ups | Roof enquiry → inspection → quote → booked work → invoice |
| Painting & finishing | Quotes, jobs, invoices, payments; optional leads and reviews | Enquiry → site estimate → paint job → invoice → feedback |
| Handyman & home repair | Jobs, invoices, quotes, payments; optional reviews and leads | Request → quote if needed → repair visit → invoice |
| Consulting & freelance | Leads, quotes, follow-ups, invoices; optional payments and reminders | Prospect → proposal → follow-up → engagement → invoice |

When users describe work not covered by the default business category, the advisor can identify a different explicit trade instead of anchoring on stale profile settings. If a user mentions a specific need (for example unpaid invoices or customer reviews), the appropriate existing module is promoted into the core recommendation. All suggestions remain editable, and clicking **Review these tools in Settings** does not save a selection until the user confirms it.

Implementation: public/js/industry-advisor-playbooks.js. Comprehensive tests: test/business-advisor-industries.test.js. These playbooks are workflow guidance, not guarantees of industry compliance or substitutes for professional trade software such as construction permitting, safety inspection, inventory, accounting or payroll.

### Textile, fabric and other shops

For a message such as "I run a typical textile shop. Recommend what's useful", the advisor recognizes the business immediately and recommends **Invoices** and **Payments** first; it marks **Leads** and **Quotes** optional where repeat buyers or bulk/custom orders matter. It never assumes shop owners need contractor dispatch tools.

The same language model-free advisor distinguishes wholesale textile distribution (quotes and account billing), tailoring (scheduling, quotes and invoices), and textile manufacturing (customer quotes and invoicing). It explicitly calls out missing retail inventory/POS and SKU tracking rather than inventing non-existent modules.

If a business is clearly described but not in a predefined trade taxonomy, the assistant gives cautious cross-industry starting suggestions **before** asking a targeted, optional question. It asks for more details only when the user has not provided enough business information.

Users can select optional "Walk-in retail", "Wholesale / bulk" or "Tailoring / custom orders" clarification chips. The browser retains only the business description from this assistant session, capped at 600 characters, to refine a later suggestion. This text is never stored in business records and **tool-recommendation requests are not sent to OpenAI/Ollama**. Explicitly selecting *Review these tools in Settings* only prepares the choices; the user still controls saving.

## Cerium NavLM v0.1 — purpose-built zero-cost navigation model

NavLM is a trained, non-generative intent classifier for Cerium's actual workspace. It uses a versioned dataset of roughly 300 manually authored navigation examples, a dependency-free TF-IDF nearest-prototype model, and a small, independent validation set. It learns weighted text features; it is not a newly pretrained transformer or general-purpose LLM.

For the recommended no-provider mode, configure:

    CERIUM_AI_PROVIDER=navlm

No provider key, Ollama installation or GPU is required. The Node server trains the tiny index from the checked-in examples at startup and performs inference locally. This creates no per-request third-party AI fees; regular server hosting still costs resources.

Predictions must map to verified Cerium screens; unknown, low-similarity and ambiguous questions deliberately return an uncertainty message without a navigation button. Responses use verified guide text only. The model cannot retrieve customer data, create invoices, send messages or modify any business record.

Training data: server/navlm-data.js
Model implementation: server/navlm-core.js
Server adapter: server/navlm.js
Evaluation: npm run navlm:evaluate
Tests: npm test

To add a new feature, first update the verified workspace guide, then create varied labeled intent examples (including ambiguous and unsupported cases), and retest navigation accuracy. The current evaluation set is small and used during development; do not equate a passing score with production-grade accuracy. Expand it with consented, anonymized real-world queries before rolling out broadly.

## Self-host Qwen 3.5 using Ollama

Qwen 3.5 open-weight models are licensed under Apache 2.0; check the selected model's specific license before distribution. Ollama hosts the model locally, so Cerium does not incur per-message provider fees. Running the model still uses RAM, CPU/GPU resources, electricity, and potentially paid hosting.

Install Ollama on the machine hosting the Cerium Node server, then download and test:

    ollama pull qwen3.5:4b
    ollama run qwen3.5:4b

Set the following in the Cerium server's private .env file:

    CERIUM_AI_PROVIDER=ollama
    CERIUM_AI_MODEL=qwen3.5:4b
    CERIUM_OLLAMA_BASE_URL=http://127.0.0.1:11434

Restart Cerium (npm run dev locally). On lower-memory hardware, try qwen3.5:2b; the 9b model may perform better on adequately powered hardware.
