# Cerium TinyLM Astra — frontier-scale causal Transformer & computer-use experiment

This directory contains **Cerium TinyLM Astra**: a frontier-class causal Transformer architecture engineered with **Mixture of Experts (MoE)** scaling up to **630 Million parameters** (~5,470x baseline capacity), Rotary Position Embeddings (RoPE), Grouped-Query Attention (GQA), SwiGLU activations, RMSNorm pre-normalization, Key-Value caching, and native **Agentic Computer-Use Tool Calling** matching ChatGPT Astra workflows.

---

## 🌟 What Makes it "Close to ChatGPT Astra"

1. **Massive Multi-Hundred-Million Parameter Scale (MoE & Dense Profiles)**:
   - Scales from lightweight local CPU testing (115K params) up to **629,469,696 parameters** in `astra-moe` mode.
   - Mixture of Experts dispatches each token to the Top-2 of 8 specialized SwiGLU experts per layer, achieving massive parameter memory and depth while keeping per-token compute lightweight.
2. **Modern Frontier Transformer Architecture**:
   - **RoPE (Rotary Position Embeddings)**: Rotates query and key vectors for relative position representation, extrapolating across long context windows (up to 4096+ tokens).
   - **GQA (Grouped-Query Attention)**: Uses 12-16 query heads with 4 KV heads, shrinking KV cache memory bandwidth by $3\times-4\times$ for long-horizon agentic memory.
   - **SwiGLU Activations**: Non-linear gated units ($W_3(\text{SiLU}(W_1 x) \odot W_2 x)$) standard in modern frontier models (Astra, LLaMA, Qwen).
   - **RMSNorm Pre-Normalization**: Root-mean-square layer norm ensures numerical stability and smooth gradient highways across 16-24 deep layers.
3. **Agentic Computer-Use & Multi-Step Tool Calling**:
   - Implements native Cerium Computer-Use Tools for workspace automation:
     - `cerium_navigate`: section and subfeature routing
     - `cerium_create_invoice`: automatic drafting of customer invoices
     - `cerium_record_payment`: recording cash/bank/UPI settlements
     - `cerium_create_quote`: generating line-item estimate proposals
     - `cerium_update_lead`: moving CRM leads and scheduling callbacks
     - `cerium_schedule_job`: dispatching field crew and technicians
     - `cerium_export_data`: accounting data exports (CSV/JSON)
   - Emits structured reasoning plans in `<thought>...</thought>` tags and machine-executable actions in `<tool_call>{"name": "...", "parameters": {...}}</tool_call>` tags.
4. **OpenAI-Compatible Tool Calling Server**:
   - Standard `/v1/chat/completions` endpoint detects `<tool_call>` outputs and parses them into OpenAI standard `choice.message.tool_calls` JSON objects.
5. **Cerium Copilot Backend Integration**:
   - `server/copilot-llm.js` parses model tool actions and automatically resolves navigation destinations to verified interactive views.

---

## 🛠️ Model Profiles

| Profile | Context | Width ($d_{model}$) | Layers | Heads | KV Heads | MoE Experts | Parameters | Multiplier vs Baseline | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `tiny` | 96 | 64 | 2 | 4 | 4 | No | ~115,072 | 1.0x | Quick CPU test & CI smoke checks |
| `medium` | 256 | 192 | 4 | 6 | 6 | No | ~1,821,312 | 15.8x | Edge / low-RAM laptop inference |
| `power100x` | 512 | 384 | 8 | 6 | 6 | No | ~14,262,528 | 123.9x | 100x baseline scale |
| `ultra` | 1024 | 512 | 12 | 8 | 8 | No | ~37,889,024 | 329.2x | High-context dense assistant |
| `astra-mini` | 1024 | 512 | 12 | 8 | 4 (GQA) | No | ~34,743,296 | 301.9x | GQA accelerated mobile/edge |
| **`astra-base`** | **2048** | **768** | **16** | **12** | **4 (GQA)** | **No** | **~100,889,088** | **876.7x** | **Flagship 100M+ Dense Model** |
| **`astra-dense`** | **4096** | **1024** | **24** | **16** | **4 (GQA)** | **No** | **~264,509,440** | **2,298.6x** | **Frontier 265M Dense Model** |
| **`astra-moe`** | **2048** | **768** | **16** | **12** | **4 (GQA)** | **8 (Top-2)** | **~629,469,696** | **5,470.2x** | **Massive 630M Astra-MoE Model** |

---

## 💻 Usage

### 1. Training

```sh
# Train Astra-MoE model (630M params)
python experiments/cerium-tiny-lm/tiny_lm.py train --profile astra-moe --steps 2000 --out output/cerium-astra-moe.pt

# Train Astra-Base model (100M params)
python experiments/cerium-tiny-lm/tiny_lm.py train --profile astra-base --steps 1000 --out output/cerium-astra-base.pt

# Quick test train (tiny profile)
python experiments/cerium-tiny-lm/tiny_lm.py train --profile tiny --steps 150 --out output/cerium-tiny.pt
```

### 2. Interactive Chat with Computer-Use

```sh
python experiments/cerium-tiny-lm/tiny_lm.py chat --checkpoint output/cerium-tiny.pt --prompt "Draft an invoice for customer Apex Tech for 5 hours of electrical repair at $95/hr."
```

### 3. Local OpenAI-Compatible Server (Port 5005)

```sh
python experiments/cerium-tiny-lm/tiny_lm.py serve --checkpoint output/cerium-tiny.pt --port 5005
```

Endpoints provided:
- `POST /v1/chat/completions`: Full chat completions supporting system prompts, temperature, streaming, and tool calls
- `GET /health`: Health status, model telemetry, parameter count, and supported tools
- `GET /v1/models`: Model registry

### 4. Running Python Tests

```sh
python -m unittest discover -s experiments/cerium-tiny-lm -p test_tiny_lm.py
```

---

## 🔗 Cerium Copilot Integration

To connect Cerium Copilot to your local TinyLM Astra server, add to your server's untracked `.env`:

```ini
CERIUM_AI_PROVIDER=tinylm
CERIUM_AI_MODEL=cerium-tiny-lm-astra
CERIUM_TINYLM_BASE_URL=http://127.0.0.1:5005
```

Restart Cerium (`npm run dev`). When TinyLM is running, Cerium Copilot will report **LLM configured**, execute reasoning plans, and translate computer-use actions into verified Cerium workspace actions!
