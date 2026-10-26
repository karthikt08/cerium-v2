# Cerium Guide — In-app navigation assistant

Cerium Guide adds an Ask Cerium button to the authenticated workspace. It answers questions about existing Cerium modules (including spreadsheet imports, invoices and PDFs), suggests steps and offers a button to navigate to a known section.

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
