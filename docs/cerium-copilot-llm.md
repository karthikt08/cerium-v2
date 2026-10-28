# Cerium Copilot — basic LLM upgrade

Cerium Copilot supports **real multi-turn generative answers** when a model provider is configured. This does **not** train a new LLM: it runs an existing model via the Cerium Node.js backend. Without a configured/available model, the existing read-only navigation guide and deterministic business summaries still work.

## Recommended for Cerium SaaS: hosted Qwen (no installations for customers)

Customers only need a browser and an internet connection. Their requests go through the authenticated Cerium backend, which calls a cloud-hosted LLM over HTTPS. **Customers do not install Ollama or Qwen** and never receive Cerium's model API credentials. Cerium's operator controls the provider account, quota and billing.

1. Create an [OpenRouter](https://openrouter.ai/) account and generate an API key. The provider requires an account/API key; internet connectivity alone does not supply free AI compute.
2. Put these settings into the Cerium **server's** untracked `.env`:

```ini
CERIUM_AI_PROVIDER=openrouter
CERIUM_AI_MODEL=qwen/qwen3.5-9b
CERIUM_OPENROUTER_API_KEY=your_server_side_key
CERIUM_COPILOT_SHARE_AGGREGATES=false
```

3. Deploy/restart the Cerium backend. Customers use Cerium normally—no separate software, model download, or account with the model provider.
4. The Copilot header reports "LLM configured" after a valid provider selection, and "LLM answer" when a successful inference response arrives. A failed or rate-limited call falls back to the local Cerium guide.

For more capacity/quality, the host can configure another available OpenRouter model slug, such as `qwen/qwen3.5-35b-a3b`. Review [model prices and availability](https://openrouter.ai/qwen) before doing so; prices and free quotas can change. This integration does not automatically perform live web searches; adding real-time browsing requires a separate search tool and safety policy.

**Privacy:** The cloud provider receives the user's typed questions and recent bounded conversation, plus static product instructions. Cerium does not send raw customer records automatically. Aggregates are off by default; turning on `CERIUM_COPILOT_SHARE_AGGREGATES=true` requires user disclosure and appropriate data-processing review. Check the chosen host's retention and model-provider policies before production rollout.

## Optional: self-hosted Ollama


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


## Optional: zero-cost local Cerium TinyLM 100x

Cerium includes an original, purpose-built autoregressive Transformer experiment in `experiments/cerium-tiny-lm/` featuring a 100x scaled architecture (~14.5M parameters with `power100x` profile), KV-caching, nucleus sampling, and an OpenAI-compatible loopback serving endpoint:

```ini
CERIUM_AI_PROVIDER=tinylm
CERIUM_AI_MODEL=cerium-tiny-lm-100x
CERIUM_TINYLM_BASE_URL=http://127.0.0.1:5005
```

1. Launch the TinyLM server:
   ```sh
   python experiments/cerium-tiny-lm/tiny_lm.py serve --checkpoint output/cerium-tiny.pt --port 5005
   ```
2. Set the variables in `.env` and start Cerium (`npm run dev`).
3. Copilot connects over local loopback (`127.0.0.1:5005`), requiring no external subscriptions, API keys, or cloud egress.

## Alternative cloud model: OpenAI

```ini
CERIUM_AI_PROVIDER=openai
CERIUM_AI_MODEL=gpt-4.1-mini
CERIUM_AI_API_KEY=your_secret_key_in_untracked_env
CERIUM_COPILOT_SHARE_AGGREGATES=false
```

Hosted providers receive the **question and bounded chat text** under these settings, **not raw business records**. Cerium keeps aggregate business totals local unless `CERIUM_COPILOT_SHARE_AGGREGATES=true` is explicitly set by the operator, after privacy review and user disclosure. Even with that opt-in, the model gets only deterministic aggregate totals/counts; no customer names, contact details, notes, or invoice rows. Billing for cloud models depends on provider usage.

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
