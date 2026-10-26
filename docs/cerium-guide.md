# Cerium Guide — In-app navigation assistant

Cerium Guide adds an Ask Cerium button to the authenticated workspace. It answers questions about existing Cerium modules (including spreadsheet imports, invoices and PDFs), suggests steps and offers a button to navigate to a known section.

## Conversational guidance and short workflow plans

Ask Cerium recognizes greetings (e.g. "hi"), help/capabilities questions, acknowledgements and frustration **before** trying to route anywhere. These turns are answered locally, even if OpenAI or Ollama is configured.

- Questions such as "Where can I save an invoice PDF?" receive short task-specific answers and an allowlisted Open Invoices action, not repeated generic help text.
- The chat remembers only the last verified navigation section while the page stays open. "How do I do that?" can use that context; without a prior relevant feature, the assistant asks which task the user meant.
- Natural descriptions of businesses ("I run a bakery") can trigger the existing local business tool advisor. Business follow-ups continue until a suitable description is available.
- Questions spanning supported tools (e.g. "How do I turn a lead into an invoice?") return a brief workflow and **several verified navigation buttons**. The assistant does not execute those steps.
- Unsupported or vague requests return a clarification with **no guessed destination**, regardless of the currently open section.
- Messages and chat context are not written to the database. Only a single verified prior section name is sent from the browser to the authenticated guide endpoint; that name is not forwarded to any AI provider.

The zero-API-cost NavLM classifier still specializes in identifying Cerium tasks; it is **not a general-purpose conversational generative model**. Conversational controls and cross-module workflow guidance are a lightweight safety and usability layer on top. For open-ended generative answers, deploy a compatible optional AI provider.

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

**Hosting distinction:** Installing Ollama only on your Windows laptop does not make it accessible from a remotely deployed Cerium server. Put Ollama on the same server or arrange a secure localhost tunnel. The Cerium Guide backend only accepts loopback addresses (127.0.0.1, localhost, [::1]) and never sends requests to user-provided hosts. Do not expose port 11434 publicly.

Ollama download sizes: qwen3.5:2b ~2.7–3.1 GB, qwen3.5:4b ~3.3–4 GB, qwen3.5:9b ~6.6–7.6 GB depending on quantization. Total required RAM is higher than the model download size; CPU-only throughput can be slow. Benchmark actual hardware before enabling the assistant for many customers.

## Other options

With CERIUM_AI_PROVIDER=guide, the fixed built-in guide works without model inference. If no provider is selected and no OpenAI key exists, the legacy fixed guide remains the fallback. Select CERIUM_AI_PROVIDER=navlm to enable the trained classifier.

For paid OpenAI responses, configure:

    CERIUM_AI_PROVIDER=openai
    CERIUM_AI_API_KEY=<your secret>
    CERIUM_AI_MODEL=gpt-4.1-mini

If provider is not specified, the server defaults to guide mode without a key and OpenAI when a key is supplied. Explicitly selecting ollama never falls back to paid OpenAI calls.

## Privacy and permissions

- With NavLM, all processing stays on the Node server. With Ollama or OpenAI, only the user's typed question, the current section, and static Cerium product guidance go to the selected model. User account, customer, invoice and bank records are not included automatically.
- With local Ollama, prompts remain on the Cerium/Ollama host (subject to local system logs); with OpenAI, prompts go to that third-party service.
- Browser replies use textContent, not generated HTML; navigation links are independently restricted to verified sections.
- The assistant cannot initiate payments, invoice changes, bank matches, email sends or deletions.
- The endpoint requires login, workspace onboarding, same origin, CSRF, input size checks, and rate limiting. Only two local model inferences can run simultaneously.
- No chat history is stored in the Cerium database. In-page messages disappear on reload.
- Avoid entering personal customer information or payment secrets into prompts.

## Verification

Run npm test for full regression checks. Run npm run preview:export for an offline assistant demo. Test both desktop and mobile, model loading time, concurrent users and offline fallbacks prior to deployment.

This remains a navigation-only v1, not an autonomous operations agent.
