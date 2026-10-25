# Cerium Guide — In-app navigation assistant

Cerium Guide adds an Ask Cerium button to the authenticated workspace. It answers questions about existing Cerium modules (including spreadsheet imports, invoices and PDFs), suggests steps and offers a button to navigate to a known section.

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

With CERIUM_AI_PROVIDER=guide (or no model configuration), the built-in guide works without any external AI calls.

For paid OpenAI responses, configure:

    CERIUM_AI_PROVIDER=openai
    CERIUM_AI_API_KEY=<your secret>
    CERIUM_AI_MODEL=gpt-4.1-mini

If provider is not specified, the server defaults to guide mode without a key and OpenAI when a key is supplied. Explicitly selecting ollama never falls back to paid OpenAI calls.

## Privacy and permissions

- Only the user's typed question, the current section, and static Cerium product guidance go to the selected model. User account, customer, invoice and bank records are not included automatically.
- With local Ollama, prompts remain on the Cerium/Ollama host (subject to local system logs); with OpenAI, prompts go to that third-party service.
- Browser replies use textContent, not generated HTML; navigation links are independently restricted to verified sections.
- The assistant cannot initiate payments, invoice changes, bank matches, email sends or deletions.
- The endpoint requires login, workspace onboarding, same origin, CSRF, input size checks, and rate limiting. Only two local model inferences can run simultaneously.
- No chat history is stored in the Cerium database. In-page messages disappear on reload.
- Avoid entering personal customer information or payment secrets into prompts.

## Verification

Run npm test for full regression checks. Run npm run preview:export for an offline assistant demo. Test both desktop and mobile, model loading time, concurrent users and offline fallbacks prior to deployment.

This remains a navigation-only v1, not an autonomous operations agent.
