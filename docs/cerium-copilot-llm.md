# Cerium Copilot — basic LLM upgrade

Cerium Copilot supports **real multi-turn generative answers** when a model provider is configured. This does **not** train a new LLM: it runs an existing model via the Cerium Node.js backend. Without a configured/available model, the existing read-only navigation guide and deterministic business summaries still work.

## Enable a free local model (recommended for development)

1. Install [Ollama for Windows](https://ollama.com/download/windows) or the equivalent for the deployment host.
2. In a terminal run `ollama pull qwen3.5:4b`. The model is several GB; provision appropriate RAM/VRAM, storage and CPU/GPU. Ollama on Windows normally serves its API locally in the background.
3. In Cerium's untracked `.env` file, use:

```ini
CERIUM_AI_PROVIDER=ollama
CERIUM_AI_MODEL=qwen3.5:4b
CERIUM_OLLAMA_BASE_URL=http://127.0.0.1:11434
```

4. Restart the Cerium server (`npm run dev`) and open Cerium Copilot. The header displays **LLM configured** when these settings are valid. Ask a business question such as "Suggest a follow-up process for my service business" and then "Can you make that simpler?".
5. If the model service is down or too busy, Copilot falls back to the local guide; this is **not** an LLM answer. The header changes to **Local answer**. Check `ollama list`, the process and available machine resources.

The local Ollama endpoint is loopback-only by design. When deploying Cerium on a remote server, **the model must run on that server or inside the same secured localhost network namespace**; a model installed only on your laptop cannot serve a remote deployment. Do not expose the model's port publicly.

## Optional cloud model

```ini
CERIUM_AI_PROVIDER=openai
CERIUM_AI_MODEL=gpt-4.1-mini
CERIUM_AI_API_KEY=your_secret_key_in_untracked_env
CERIUM_COPILOT_SHARE_AGGREGATES=false
```

OpenAI receives the **question and bounded chat text** under these settings, **not raw business records**. Cerium keeps aggregate business totals local unless `CERIUM_COPILOT_SHARE_AGGREGATES=true` is explicitly set by the operator, after privacy review and user disclosure. Even with that opt-in, the model gets only deterministic aggregate totals/counts; no customer names, contact details, notes, or invoice rows. Billing for cloud models depends on provider usage.

## What the basic LLM can do

- Discuss strategies and workflows in natural language, draft ideas, and explain tradeoffs.
- Remember the most recent **four model-generated question/answer pairs** during the current browser conversation.
- Use a concise snapshot of priorities and monthly invoice activity (aggregate counts and face-value totals) in local Ollama mode. User questions matching the five concrete data requests still use the deterministic, trusted engine.
- Add verified Cerium deep links independently of model text.
- Keep operating safely if the model provider fails.

## Scope and boundaries

- The model is **not** trained or fine-tuned on customer records.
- The model does **not** issue SQL, call arbitrary application functions, create/send records, navigate to generated URLs, or change billing or contacts.
- Business-date calculations and money totals still run in JavaScript and never rely on the LLM.
- Model chat history is intentionally kept in browser memory only, discarded on reset/reload, and bounded server-side. Deterministic replies that may contain customer names are **not** recycled into model history.
- The interface reports **configured**, not verified online/available, until a model answer actually succeeds.
- An operator's model configuration does not imply the external provider is running or reachable. The fallback is normal and should not be marketed as generative AI when offline.

Run `npm test` and `node --check public/js/guide-assistant.js` before deploying. For multi-user hosting, review capacity, rate limits, data-processing terms and additional operational monitoring.

See [business awareness MVP](cerium-copilot-mvp.md) for the deterministic layer's definitions and limitations.
