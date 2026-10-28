# Cerium TinyLM v0.2 — supervised training and reproducible evaluation

**Status: Research experiment only. Not connected to the customer-facing Cerium Copilot.**

TinyLM is an original, tiny **byte-level causal Transformer**, using PyTorch. This update fixes several problems in v0.1 and adds a conservative curated-answer mode. Neither mode is a production-grade chatbot or an unlimited-free cloud inference service.

## What's actually improved

| Topic | v0.1 | v0.2 |
| --- | --- | --- |
| Training examples | Concatenated byte stream of all Q&A pairs | Independent question/answer examples |
| Context | 96 bytes, shorter than **all 36** full examples | 192 tokens, enough for this curated corpus |
| Training objective | Predicted prompt text as well as answers | Supervised completion-only targets and END marker |
| Output weights | Tied to input embeddings | Separate output projection for easier optimization |
| Evaluation | Training-window loss only | Deterministic 80/20 train/holdout split and separate evaluation data |
| Saved checkpoint | Last step | Lowest held-out loss; includes metadata and dataset hash |
| Reliable known questions | None | Optional **separate curated retrieval**, with abstention for weak matches |
| Production integration | None | Still none; customer records never enter training |

The byte-level vocabulary is still tiny. This does **not** mean it can generalize like Qwen or ChatGPT.

## Train, evaluate, test

From the Cerium repository root with Python 3.10+:

    python -m pip install -r experiments/cerium-tiny-lm/requirements.txt
    python experiments/cerium-tiny-lm/tiny_lm.py train --steps 240 --eval-every 40 --out output/cerium-tiny-v02.pt
    python experiments/cerium-tiny-lm/tiny_lm.py eval --checkpoint output/cerium-tiny-v02.pt
    python experiments/cerium-tiny-lm/tiny_lm.py eval --checkpoint output/cerium-tiny-v02.pt --data experiments/cerium-tiny-lm/evaluation.jsonl --subset all
    python -m unittest discover -s experiments/cerium-tiny-lm -p test_tiny_lm.py

Training checkpoints are stored in gitignored output/, **not committed to source control**. All examples are authored/curated for this experiment; none contain personal customer records.

Try raw neural generation (expected to be unreliable):

    python experiments/cerium-tiny-lm/tiny_lm.py chat --checkpoint output/cerium-tiny-v02.pt --prompt "How do invoices work?" --temperature 0

Try curated-answer lookup without a checkpoint:

    python experiments/cerium-tiny-lm/tiny_lm.py chat --mode verified --prompt "How do invoices work?"

The verified lookup reports source = "curated-retrieval" and only returns the corresponding curated text for a confident question match. **It is not an LLM response.** If it cannot match, the answer is null, rather than a made-up business fact.

## Reproduced local experimental measurements

Environment: CPU PyTorch 2.10, fixed seed 17, 36 training corpus examples, 192 context, width 64, two layers, four attention heads, eight examples per batch, 240 optimization steps, evaluated every 40. Best checkpoint was at **step 120**, not the last step.

| Evaluation | Completion-only loss | Perplexity |
| --- | ---: | ---: |
| Held-out split: 7 prompts / 646 evaluated bytes | **2.681** | **14.60** |
| Separate evaluation.jsonl: 12 new prompts / 846 evaluated bytes | **2.655** | **14.23** |

These figures are **next-byte teacher-forced metrics**, not natural-language answer correctness. The independently sampled generated sentences remain mostly incoherent. The model has not achieved useful chat quality, and the new losses are not directly comparable to v0.1's training-window loss.

**Limitations:** Tiny curated data, no large-scale pretraining, no benchmarks for fact accuracy, no browser search, no tenant-aware tools or permissions, and no production capacity testing. The trained weights are a research artifact. Production Copilot still uses the separately configured hosted LLM provider or its safe existing local fallback.

## Sensible next step

A practical Cerium-specific LLM should start with an appropriately licensed, open-weight **pretrained** model and undergo supervised tuning on a larger permissioned dataset, then evaluate real task accuracy, safety and cost on a private inference host. Training a competitive LLM from scratch for free on this corpus is not realistic.
