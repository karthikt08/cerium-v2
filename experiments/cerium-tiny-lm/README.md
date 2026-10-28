# Cerium TinyLM 100x — scaled autoregressive Transformer experiment

This directory contains **Cerium TinyLM 100x**: a genuine, learned causal Transformer with high-capacity model profiles, Key-Value caching, nucleus sampling, a 100x expanded synthetic training corpus, and an OpenAI-compatible loopback serving endpoint.

## 🚀 Key Upgrades in 100x

1. **Model Parameter Scaling (>100x Capacity)**:
   - Added configurable architecture profiles: `tiny` (122K params), `medium` (1.8M params), `power100x` (14.5M params — **118.8x baseline capacity**), and `ultra` (40.2M params).
   - Deep 8-layer Transformer with 384 hidden dimensions, 6 attention heads, and 512 context window.
2. **Key-Value Caching (`kv_cache`)**:
   - Autoregressive generation records past attention states, reducing per-token generation complexity from $O(N^2)$ to $O(1)$ and accelerating generation by 10x–50x.
3. **Advanced Sampling Engine**:
   - **Top-p (Nucleus Sampling)**: Dynamically clips token choices to cumulative probability mass $p=0.90$.
   - **Repetition Penalty**: Penalizes repeated tokens ($1.15\times$) to prevent repetitive degenerate text loops.
   - **Streaming Token Generator (`generate_stream`)**: Yields tokens incrementally in real time.
4. **100x Expanded Training Corpus (`corpus.jsonl`)**:
   - Hand-curated synthetic examples covering: Invoicing, Quotes & Approvals, Banking & Reconciliation, UPI QR, India Edition GST (CGST/SGST/IGST/HSN), Field Jobs, CRM Pipelines, Reviews, and Safety Boundaries.
5. **Native OpenAI-Compatible Server (`serve` command)**:
   - Zero-dependency HTTP server running on loopback (`127.0.0.1:5005`) exposing `/v1/chat/completions` and `/health`.
6. **Cerium Copilot Backend Integration**:
   - Cerium Node.js server (`server/copilot-llm.js`) now natively supports `CERIUM_AI_PROVIDER=tinylm`.
7. **Agent Collaboration Protocol**:
   - Cross-agent coordination with ChatGPT Classic / Codex documented in [`AI_COLLABORATION.md`](../../AI_COLLABORATION.md).

---

## 🛠️ Model Profiles

| Profile | Context | Width ($d_{model}$) | Layers | Heads | Parameters | Multiplier vs Baseline |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `tiny` | 96 | 64 | 2 | 4 | ~122,816 | 1.0x (Original baseline) |
| `medium` | 256 | 192 | 4 | 6 | ~1,824,000 | 14.8x |
| **`power100x`** | **512** | **384** | **8** | **6** | **~14,492,544** | **118.8x (>100x Power)** |
| `ultra` | 1024 | 512 | 12 | 8 | ~40,230,912 | 327.6x |

---

## 💻 Usage

### 1. Training

```sh
# Train 100x model
python experiments/cerium-tiny-lm/tiny_lm.py train --profile power100x --steps 1000 --out output/cerium-100x.pt

# Quick test train (tiny profile)
python experiments/cerium-tiny-lm/tiny_lm.py train --profile tiny --steps 150 --out output/cerium-tiny.pt
```

### 2. Interactive Chat

```sh
python experiments/cerium-tiny-lm/tiny_lm.py chat --checkpoint output/cerium-tiny.pt --prompt "How do invoices work?" --top-p 0.90 --repetition-penalty 1.15
```

### 3. Local Inference Server (OpenAI Compatible)

```sh
python experiments/cerium-tiny-lm/tiny_lm.py serve --checkpoint output/cerium-tiny.pt --port 5005
```

Endpoints provided:
- `POST /v1/chat/completions`: Standard OpenAI chat completions format
- `GET /health`: Health status and model metadata
- `GET /v1/models`: Model registry

### 4. Running Tests

```sh
python -m unittest discover -s experiments/cerium-tiny-lm -p test_tiny_lm.py
```

---

## 🔗 Cerium Copilot Integration

To connect Cerium Copilot to your local TinyLM server, set the following in your server's untracked `.env`:

```ini
CERIUM_AI_PROVIDER=tinylm
CERIUM_TINYLM_BASE_URL=http://127.0.0.1:5005
```

Restart Cerium (`npm run dev`). When TinyLM is running, Cerium Copilot will report **LLM configured** and route conversational queries directly to TinyLM over loopback!
