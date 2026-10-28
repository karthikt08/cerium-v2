# Cerium TinyLM v0.1 — original model experiment

This is a genuine **trainable, autoregressive byte-level Transformer**, written for Cerium. It learns token embeddings and position embeddings, causal self-attention and feed-forward weights, and samples tokens to generate text.

**This is not a production-ready LLM.** The checkpoint trained on this small first-party corpus produces poor, often incoherent responses. Its purpose is to establish an owned model architecture and a reproducible training/test loop, not to market it as a ChatGPT- or Qwen-level model.

The experiment does not connect to Cerium's production assistant, API, database or customer conversations. It exposes **no network listener**, invokes **no third-party inference API**, and is not sent to browsers. It consumes only curated first-party examples in `corpus.jsonl`.

## Train on a development or hosting machine

Python 3.10+ and PyTorch 2.3+ are required; **customers do not need to install these**. From the repository root:

```sh
python -m pip install -r experiments/cerium-tiny-lm/requirements.txt
python experiments/cerium-tiny-lm/tiny_lm.py train --steps 700 --out output/cerium-tiny.pt
python experiments/cerium-tiny-lm/tiny_lm.py chat --checkpoint output/cerium-tiny.pt --prompt "How do invoices work?"
python -m unittest discover -s experiments/cerium-tiny-lm -p test_tiny_lm.py
```

The generated PyTorch checkpoint is written to `output/` (gitignored). Loading uses `weights_only=True` and validates small architecture dimensions; do not load checkpoints from untrusted people.

## What is included

- `tiny_lm.py`: model, UTF-8 byte tokenizer, training loop, checkpoint loading, generation
- `corpus.jsonl`: 36 hand-written, generic first-party prompts and completions
- `test_tiny_lm.py`: training, gradients, causal attention, tokenizer, checkpoint and generation tests
- `requirements.txt`: isolated experimental training dependency

A demonstration was trained for 700 steps on the 36-example dataset. It produced a roughly 491 KB checkpoint and a training loss of around 2.08 on sampled training windows. **Training loss is not held-out performance, and generated answers are still unreliable.** This experiment does not make Cerium a capable general-purpose LLM or offer free inference at SaaS scale.

## What would make it useful?

For a credible Cerium product, the next steps would be a much larger **legally sourced** dataset, independent held-out evaluations, hallucination/safety and tenant-isolation tests, infrastructure capacity planning, and an authenticated, rate-limited server endpoint. Merely running on customers' internet connections does not provide model compute.

**More realistic alternative:** Take an open-weight pretrained language model, fine-tune it for Cerium's workflows with permissioned data, and host inference centrally. That produces better quality than training a tiny new model on a few examples but still requires hosting compute and maintenance.

The current Cerium Copilot remains unchanged and can use hosted OpenRouter/Qwen/OpenAI providers or its deterministic local fallback.
