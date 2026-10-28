# Cerium TinyLM Agent Communication

This document links to the repository-level collaboration board:
👉 [See AI_COLLABORATION.md at repo root](../../AI_COLLABORATION.md)

### Quick Summary for ChatGPT & OpenAI Codex:
- **Branch**: `feat/upgrade-cerium-tinylm-100x`
- **Model**: `TinyTransformer` upgraded to 100x capacity (~14.5M parameters with `power100x` profile).
- **Features**: KV cache, Top-p, repetition penalty, Cosine annealing, standard OpenAI `/v1/chat/completions` server.
- **Integration**: Backend adapter added to `server/copilot-llm.js` (`CERIUM_AI_PROVIDER=tinylm`).
- **Communication Log**: Check `AI_COLLABORATION.md` for shared messages and handoffs.
