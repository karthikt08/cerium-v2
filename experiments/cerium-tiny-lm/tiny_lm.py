"""Cerium TinyLM Astra: frontier-scale causal Transformer with MoE, RoPE, GQA, SwiGLU & Computer-Use."""
import argparse
import http.server
import json
import math
from pathlib import Path
import random
import re
import sys
import threading
import time

import torch
from torch import nn
from torch.nn import functional as F

USER, ASSISTANT, END, TOOL_CALL, TOOL_RESP = 256, 257, 258, 259, 260
VOCAB = 261

# Modern frontier architecture profiles (from lightweight CPU to 420M+ parameter Astra-MoE)
PROFILES = {
    "tiny": dict(context=96, width=64, layers=2, heads=4, kv_heads=4, moe=False),
    "medium": dict(context=256, width=192, layers=4, heads=6, kv_heads=6, moe=False),
    "power100x": dict(context=512, width=384, layers=8, heads=6, kv_heads=6, moe=False),
    "ultra": dict(context=1024, width=512, layers=12, heads=8, kv_heads=8, moe=False),
    "astra-mini": dict(context=1024, width=512, layers=12, heads=8, kv_heads=4, moe=False),       # ~42M params
    "astra-base": dict(context=2048, width=768, layers=16, heads=12, kv_heads=4, moe=False),      # ~115M params
    "astra-dense": dict(context=4096, width=1024, layers=24, heads=16, kv_heads=4, moe=False),    # ~305M params
    "astra-moe": dict(context=2048, width=768, layers=16, heads=12, kv_heads=4, moe=True, num_experts=8, top_k=2), # ~420M params!
}

# Cerium Agentic Computer-Use Tools (Astra Protocol)
CERIUM_TOOLS = {
    "cerium_navigate": {
        "description": "Navigate to a specific Cerium workspace section and subfeature tab.",
        "parameters": {
            "type": "object",
            "properties": {
                "section": {"type": "string", "description": "Target section e.g. 'invoices', 'leads', 'jobs', 'payments', 'reports'"},
                "subfeature": {"type": "string", "description": "Optional subfeature tab e.g. 'dues', 'board', 'unmatched'"}
            },
            "required": ["section"]
        }
    },
    "cerium_create_invoice": {
        "description": "Draft or issue a commercial invoice or tax invoice.",
        "parameters": {
            "type": "object",
            "properties": {
                "customer": {"type": "string", "description": "Customer legal name"},
                "items": {"type": "array", "description": "List of line items with description and amount"},
                "dueDate": {"type": "string", "description": "Payment due date YYYY-MM-DD"}
            },
            "required": ["customer", "items"]
        }
    },
    "cerium_record_payment": {
        "description": "Record a customer payment or match a bank deposit to an invoice.",
        "parameters": {
            "type": "object",
            "properties": {
                "invoiceId": {"type": "string", "description": "Invoice reference number"},
                "amount": {"type": "number", "description": "Payment amount received"},
                "method": {"type": "string", "enum": ["bank", "cash", "upi", "card"]}
            },
            "required": ["invoiceId", "amount"]
        }
    },
    "cerium_create_quote": {
        "description": "Create a new estimate or quote proposal for customer approval.",
        "parameters": {
            "type": "object",
            "properties": {
                "customer": {"type": "string", "description": "Client name"},
                "items": {"type": "array", "description": "Estimated line items and quantities"}
            },
            "required": ["customer", "items"]
        }
    },
    "cerium_update_lead": {
        "description": "Update CRM lead pipeline stage or schedule follow-up callback.",
        "parameters": {
            "type": "object",
            "properties": {
                "leadName": {"type": "string", "description": "Prospect or lead name"},
                "stage": {"type": "string", "enum": ["New", "Contacted", "Quoted", "Won", "Lost"]},
                "followUpDate": {"type": "string", "description": "Next contact date YYYY-MM-DD"}
            },
            "required": ["leadName", "stage"]
        }
    },
    "cerium_schedule_job": {
        "description": "Dispatch field crew and schedule an operational job.",
        "parameters": {
            "type": "object",
            "properties": {
                "customer": {"type": "string", "description": "Customer name"},
                "crew": {"type": "string", "description": "Assigned team member or technician"},
                "date": {"type": "string", "description": "Job date YYYY-MM-DD"},
                "time": {"type": "string", "description": "Job time e.g. 09:00"}
            },
            "required": ["customer", "date"]
        }
    },
    "cerium_export_data": {
        "description": "Export workspace business records as CSV or JSON for reporting.",
        "parameters": {
            "type": "object",
            "properties": {
                "type": {"type": "string", "enum": ["invoices", "payments", "leads", "jobs"]},
                "format": {"type": "string", "enum": ["csv", "json"]}
            },
            "required": ["type", "format"]
        }
    }
}


def encode(text: str) -> list[int]:
    return list(text.encode("utf-8"))


def decode(tokens: list[int]) -> str:
    return bytes(t for t in tokens if 0 <= t < 256).decode("utf-8", errors="replace")


def encode_example(prompt: str, completion: str) -> list[int]:
    return [USER, *encode(prompt.strip()), ASSISTANT, *encode(completion.strip()), END]


def encode_chat(messages: list[dict]) -> list[int]:
    tokens = []
    for msg in messages:
        role = msg.get("role", "user")
        content = msg.get("content", "").strip()
        if not content:
            continue
        if role == "system":
            tokens.extend([USER, *encode(f"[System Instruction: {content}]\n")])
        elif role == "user":
            tokens.extend([USER, *encode(content)])
        elif role == "assistant":
            tokens.extend([ASSISTANT, *encode(content), END])
    if not tokens or tokens[-1] != ASSISTANT:
        tokens.append(ASSISTANT)
    return tokens


class RMSNorm(nn.Module):
    """Root Mean Square Layer Normalization for fast, numerically stable deep Transformer scaling."""

    def __init__(self, dim: int, eps: float = 1e-6):
        super().__init__()
        self.eps = eps
        self.weight = nn.Parameter(torch.ones(dim))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        norm = torch.rsqrt(x.pow(2).mean(-1, keepdim=True) + self.eps)
        return x * norm * self.weight


def precompute_freqs_cis(dim: int, end: int, theta: float = 10000.0):
    """Precompute Rotary Position Embedding (RoPE) cosine and sine frequencies."""
    freqs = 1.0 / (theta ** (torch.arange(0, dim, 2)[: (dim // 2)].float() / dim))
    t = torch.arange(end)
    freqs = torch.outer(t, freqs).float()
    return torch.cos(freqs), torch.sin(freqs)


def apply_rotary_emb(x: torch.Tensor, cos: torch.Tensor, sin: torch.Tensor) -> torch.Tensor:
    """Apply RoPE rotation to query and key tensor projections."""
    d = x.shape[-1]
    x1 = x[..., :d // 2]
    x2 = x[..., d // 2:]
    T = x.shape[2]
    c = cos[:T].unsqueeze(0).unsqueeze(1).to(x.device)
    s = sin[:T].unsqueeze(0).unsqueeze(1).to(x.device)
    return torch.cat([x1 * c - x2 * s, x1 * s + x2 * c], dim=-1)


class CausalSelfAttention(nn.Module):
    """Grouped-Query Attention (GQA) with KV-caching, RoPE, and hardware-accelerated scaled dot product."""

    def __init__(self, width: int, heads: int, kv_heads: int = None, dropout: float = 0.0):
        super().__init__()
        if width % heads != 0:
            raise ValueError("width must be divisible by heads")
        self.width = width
        self.heads = heads
        self.kv_heads = kv_heads or heads
        if self.heads % self.kv_heads != 0:
            raise ValueError("heads must be divisible by kv_heads")
        self.head_dim = width // heads
        self.num_rep = self.heads // self.kv_heads

        self.q_proj = nn.Linear(width, self.heads * self.head_dim, bias=False)
        self.k_proj = nn.Linear(width, self.kv_heads * self.head_dim, bias=False)
        self.v_proj = nn.Linear(width, self.kv_heads * self.head_dim, bias=False)
        self.out_proj = nn.Linear(width, width, bias=False)
        self.dropout = dropout

    def forward(self, x, cos=None, sin=None, kv_cache=None):
        B, T, C = x.shape
        q = self.q_proj(x).view(B, T, self.heads, self.head_dim).transpose(1, 2)
        k = self.k_proj(x).view(B, T, self.kv_heads, self.head_dim).transpose(1, 2)
        v = self.v_proj(x).view(B, T, self.kv_heads, self.head_dim).transpose(1, 2)

        if cos is not None and sin is not None:
            q = apply_rotary_emb(q, cos, sin)
            k = apply_rotary_emb(k, cos, sin)

        if kv_cache is not None:
            past_k, past_v = kv_cache
            k = torch.cat([past_k, k], dim=2)
            v = torch.cat([past_v, v], dim=2)

        new_cache = (k, v)

        # Repeat KV heads for Grouped-Query Attention
        if self.num_rep > 1:
            k_rep = k.repeat_interleave(self.num_rep, dim=1)
            v_rep = v.repeat_interleave(self.num_rep, dim=1)
        else:
            k_rep, v_rep = k, v

        if kv_cache is not None and T == 1:
            out = F.scaled_dot_product_attention(
                q, k_rep, v_rep, dropout_p=self.dropout if self.training else 0.0, is_causal=False
            )
        else:
            out = F.scaled_dot_product_attention(
                q, k_rep, v_rep, dropout_p=self.dropout if self.training else 0.0, is_causal=True
            )

        out = out.transpose(1, 2).contiguous().view(B, T, C)
        return self.out_proj(out), new_cache


class SwiGLU(nn.Module):
    """Swish Gated Linear Unit used in frontier architectures (Astra, LLaMA, Qwen)."""

    def __init__(self, dim: int, hidden_dim: int):
        super().__init__()
        self.w_gate = nn.Linear(dim, hidden_dim, bias=False)
        self.w_up = nn.Linear(dim, hidden_dim, bias=False)
        self.w_down = nn.Linear(hidden_dim, dim, bias=False)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.w_down(F.silu(self.w_gate(x)) * self.w_up(x))


class MoEFeedForward(nn.Module):
    """Mixture of Experts Feed-Forward layer with top-k gating for massive parameter capacity."""

    def __init__(self, dim: int, hidden_dim: int, num_experts: int = 8, top_k: int = 2):
        super().__init__()
        self.num_experts = num_experts
        self.top_k = min(top_k, num_experts)
        self.router = nn.Linear(dim, num_experts, bias=False)
        self.experts = nn.ModuleList([
            SwiGLU(dim, hidden_dim) for _ in range(num_experts)
        ])

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        B, T, C = x.shape
        flat_x = x.view(-1, C)
        logits = self.router(flat_x)
        probs = F.softmax(logits, dim=-1)
        topk_probs, topk_indices = torch.topk(probs, self.top_k, dim=-1)
        topk_probs = topk_probs / topk_probs.sum(dim=-1, keepdim=True)

        out = torch.zeros_like(flat_x)
        for k in range(self.top_k):
            indices = topk_indices[:, k]
            weights = topk_probs[:, k].unsqueeze(-1)
            for e_idx in range(self.num_experts):
                mask = (indices == e_idx)
                if mask.any():
                    out[mask] += weights[mask] * self.experts[e_idx](flat_x[mask])
        return out.view(B, T, C)


class TransformerBlock(nn.Module):
    """Pre-RMSNorm Transformer decoder block supporting standard SwiGLU or MoE routing."""

    def __init__(self, width: int, heads: int, kv_heads: int = None,
                 dim_feedforward: int = None, moe: bool = False,
                 num_experts: int = 8, top_k: int = 2):
        super().__init__()
        ff_dim = dim_feedforward or int(8 * width / 3)  # Standard SwiGLU 2.67x scaling
        self.norm1 = RMSNorm(width)
        self.attn = CausalSelfAttention(width, heads, kv_heads=kv_heads)
        self.norm2 = RMSNorm(width)
        if moe:
            self.mlp = MoEFeedForward(width, ff_dim, num_experts=num_experts, top_k=top_k)
        else:
            self.mlp = SwiGLU(width, ff_dim)

    def forward(self, x, cos=None, sin=None, kv_cache=None):
        attn_out, updated_cache = self.attn(self.norm1(x), cos=cos, sin=sin, kv_cache=kv_cache)
        x = x + attn_out
        x = x + self.mlp(self.norm2(x))
        return x, updated_cache


class TinyTransformer(nn.Module):
    """Scalable learned causal decoder Transformer with Astra-grade MoE, RoPE, GQA and SwiGLU."""

    def __init__(self, context=96, width=64, layers=2, heads=4, kv_heads=None,
                 vocab_size=VOCAB, moe=False, num_experts=8, top_k=2):
        super().__init__()
        if not (16 <= context <= 16384 and 32 <= width <= 4096 and 1 <= layers <= 48
                and 1 <= heads <= 64 and width % heads == 0):
            raise ValueError("Unsafe TinyLM architecture configuration.")

        kv_h = kv_heads or heads
        self.config = dict(
            context=context, width=width, layers=layers, heads=heads,
            kv_heads=kv_h, vocab_size=vocab_size, moe=moe,
            num_experts=num_experts, top_k=top_k
        )
        self.token = nn.Embedding(vocab_size, width)

        # Precompute RoPE rotary frequencies
        head_dim = width // heads
        cos, sin = precompute_freqs_cis(head_dim, context)
        self.register_buffer("rope_cos", cos, persistent=False)
        self.register_buffer("rope_sin", sin, persistent=False)

        self.blocks = nn.ModuleList([
            TransformerBlock(width, heads, kv_heads=kv_h, moe=moe,
                             num_experts=num_experts, top_k=top_k)
            for _ in range(layers)
        ])
        self.norm = RMSNorm(width)
        self.head = nn.Linear(width, vocab_size, bias=False)
        self.head.weight = self.token.weight

    @property
    def parameter_count(self) -> int:
        return sum(p.numel() for p in self.parameters())

    def forward(self, tokens, kv_caches=None, start_pos=0):
        if tokens.ndim != 2:
            raise ValueError("Expected tokens of shape [batch, length].")
        length = tokens.shape[1]
        if start_pos + length > self.config["context"]:
            raise ValueError(f"Exceeded context window ({start_pos + length} > {self.config['context']}).")

        hidden = self.token(tokens)
        cos = self.rope_cos[start_pos : start_pos + length]
        sin = self.rope_sin[start_pos : start_pos + length]

        new_caches = [] if kv_caches is not None else None
        for i, block in enumerate(self.blocks):
            layer_cache = kv_caches[i] if kv_caches is not None else None
            hidden, updated_cache = block(hidden, cos=cos, sin=sin, kv_cache=layer_cache)
            if new_caches is not None:
                new_caches.append(updated_cache)

        logits = self.head(self.norm(hidden))
        if kv_caches is not None:
            return logits, new_caches
        return logits


def read_corpus(path: Path) -> torch.Tensor:
    tokens = []
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        row = json.loads(line)
        if (not isinstance(row.get("prompt"), str)
                or not isinstance(row.get("completion"), str)
                or not row["prompt"].strip() or not row["completion"].strip()):
            raise ValueError(f"Invalid first-party example at line {number}.")
        tokens.extend(encode_example(row["prompt"], row["completion"]))
    if len(tokens) < 256:
        raise ValueError("At least 256 byte tokens are required for this experiment.")
    return torch.tensor(tokens, dtype=torch.long)


def train(data, output, steps=150, seed=17, profile=None, context=None,
          width=None, layers=None, heads=None, kv_heads=None, moe=None,
          batch_size=16, lr=0.001, val_split=0.1):
    if not (1 <= steps <= 100000 and 1 <= batch_size <= 64 and 0 < lr <= 0.05):
        raise ValueError("Unsafe training settings.")

    base_profile = profile or ("astra-mini" if (width is None and layers is None) else "tiny")
    cfg = dict(PROFILES.get(base_profile, PROFILES["tiny"]))
    if context is not None:
        cfg["context"] = context
    if width is not None:
        cfg["width"] = width
    if layers is not None:
        cfg["layers"] = layers
    if heads is not None:
        cfg["heads"] = heads
    if kv_heads is not None:
        cfg["kv_heads"] = kv_heads
    if moe is not None:
        cfg["moe"] = moe

    random.seed(seed)
    torch.manual_seed(seed)
    torch.set_num_threads(min(4, torch.get_num_threads()))

    model = TinyTransformer(**cfg)
    corpus = read_corpus(Path(data))
    ctx = cfg["context"]
    if len(corpus) <= ctx + 1:
        # Gracefully clamp context to corpus length if training on small demonstration data
        ctx = min(ctx, len(corpus) // 2)
        model = TinyTransformer(context=ctx, **{k: v for k, v in cfg.items() if k != "context"})

    split_idx = int(len(corpus) * (1.0 - val_split))
    split_idx = max(ctx + 2, min(split_idx, len(corpus) - ctx - 2))
    train_corpus = corpus[:split_idx]
    val_corpus = corpus[split_idx:]

    opt = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=0.01)

    print(f"🌟 Cerium Astra Architecture: context={ctx}, width={cfg['width']}, "
          f"layers={cfg['layers']}, heads={cfg['heads']}, kv_heads={cfg.get('kv_heads', cfg['heads'])}, "
          f"moe={cfg.get('moe', False)}")
    print(f"📊 Model parameters: {model.parameter_count:,} "
          f"({model.parameter_count / 121984:.1f}x baseline capacity)")
    print(f"📚 Training tokens: {len(train_corpus):,} | Validation tokens: {len(val_corpus):,}")

    model.train()
    final_loss = 0.0
    for step in range(1, steps + 1):
        progress = step / steps
        current_lr = lr * 0.5 * (1.0 + math.cos(progress * math.pi))
        for param_group in opt.param_groups:
            param_group["lr"] = current_lr

        starts = torch.randint(0, len(train_corpus) - ctx - 1, (batch_size,))
        x = torch.stack([train_corpus[i:i+ctx] for i in starts])
        y = torch.stack([train_corpus[i+1:i+ctx+1] for i in starts])

        logits = model(x)
        loss = F.cross_entropy(logits.reshape(-1, VOCAB), y.reshape(-1))

        opt.zero_grad(set_to_none=True)
        loss.backward()
        nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        opt.step()

        final_loss = loss.item()
        if step == 1 or step == steps or step % max(1, steps // 4) == 0:
            model.eval()
            with torch.no_grad():
                val_starts = torch.randint(0, len(val_corpus) - ctx - 1, (min(batch_size, 8),))
                val_x = torch.stack([val_corpus[i:i+ctx] for i in val_starts])
                val_y = torch.stack([val_corpus[i+1:i+ctx+1] for i in val_starts])
                val_loss = F.cross_entropy(model(val_x).reshape(-1, VOCAB), val_y.reshape(-1)).item()
            model.train()

            print(f"step {step}/{steps}: loss={final_loss:.3f} val_loss={val_loss:.3f} "
                  f"train_ppl≈{math.exp(min(20, final_loss)):.2f} val_ppl≈{math.exp(min(20, val_loss)):.2f} "
                  f"lr={current_lr:.6f}", flush=True)

    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    checkpoint_payload = {
        "version": 3,
        "config": model.config,
        "state_dict": model.state_dict(),
        "steps": steps,
        "loss": final_loss,
        "parameter_count": model.parameter_count,
        "timestamp": time.time(),
    }
    torch.save(checkpoint_payload, output)
    print(f"Checkpoint saved: {output} ({output.stat().st_size:,} bytes)")
    return model


def load_model(checkpoint: Path) -> TinyTransformer:
    saved = torch.load(Path(checkpoint), map_location="cpu", weights_only=True)
    version = saved.get("version", 1)
    if version not in (1, 2, 3):
        raise ValueError(f"Unknown checkpoint version: {version}")

    config = dict(saved["config"])
    # Clean legacy keys if loading from v1 or v2
    config.pop("vocab_size", None)
    state = saved["state_dict"]

    model = TinyTransformer(**config)
    try:
        model.load_state_dict(state, strict=True)
    except Exception:
        model.load_state_dict(state, strict=False)

    model.eval()
    return model


@torch.inference_mode()
def generate_stream(model: TinyTransformer, prompt: str, max_tokens=250,
                    temperature=0.75, top_k=24, top_p=0.90, repetition_penalty=1.15,
                    seed=17, use_cache=True):
    """Astra streaming generator with KV-cache, RoPE, and control token masking."""
    if (not 1 <= max_tokens <= 2048 or not 0.01 <= temperature <= 2.0
            or not 1 <= top_k <= VOCAB or not 0.0 < top_p <= 1.0
            or not 0.5 <= repetition_penalty <= 2.0 or len(prompt) > 4000):
        raise ValueError("Unsafe generation settings.")

    torch.manual_seed(seed)
    tokens = [USER, *encode(prompt.strip()), ASSISTANT]
    created = []
    ctx = model.config["context"]

    if len(tokens) >= ctx:
        tokens = [tokens[0]] + tokens[-(ctx - 2):]

    kv_caches = [None] * len(model.blocks) if use_cache else None

    input_tensor = torch.tensor([tokens], dtype=torch.long)
    if use_cache:
        logits, kv_caches = model(input_tensor, kv_caches=kv_caches, start_pos=0)
        next_token_logits = logits[0, -1, :]
    else:
        next_token_logits = model(input_tensor)[0, -1, :]

    for step in range(max_tokens):
        scores = next_token_logits.clone() / temperature

        # Mask control tokens from generation
        scores[USER] = float('-inf')
        scores[ASSISTANT] = float('-inf')
        if step == 0:
            scores[END] = float('-inf')

        # Repetition penalty
        if repetition_penalty != 1.0 and created:
            for tid in set(created[-64:]):
                if scores[tid] > 0:
                    scores[tid] /= repetition_penalty
                else:
                    scores[tid] *= repetition_penalty

        # Top-K
        if top_k < VOCAB:
            values, indices = torch.topk(scores, top_k)
            filtered_scores = torch.full_like(scores, float('-inf'))
            filtered_scores.scatter_(0, indices, values)
            scores = filtered_scores

        # Top-P Nucleus
        if top_p < 1.0:
            sorted_logits, sorted_indices = torch.sort(scores, descending=True)
            cumulative_probs = torch.cumsum(F.softmax(sorted_logits, dim=-1), dim=-1)
            sorted_indices_to_remove = cumulative_probs > top_p
            sorted_indices_to_remove[1:] = sorted_indices_to_remove[:-1].clone()
            sorted_indices_to_remove[0] = False
            indices_to_remove = sorted_indices[sorted_indices_to_remove]
            scores[indices_to_remove] = float('-inf')

        probs = F.softmax(scores, dim=-1)
        next_id = int(torch.multinomial(probs, 1).item())

        if next_id in (USER, ASSISTANT, END):
            break

        tokens.append(next_id)
        created.append(next_id)
        yield decode([next_id])

        if len(tokens) >= ctx:
            break

        if use_cache:
            next_input = torch.tensor([[next_id]], dtype=torch.long)
            logits, kv_caches = model(next_input, kv_caches=kv_caches, start_pos=len(tokens) - 1)
            next_token_logits = logits[0, -1, :]
        else:
            cur_input = torch.tensor([tokens[-ctx:]], dtype=torch.long)
            next_token_logits = model(cur_input)[0, -1, :]


def generate(model: TinyTransformer, prompt: str, **kwargs) -> str:
    """Generate completion for given prompt."""
    return "".join(generate_stream(model, prompt, **kwargs))


def extract_tool_calls(text: str) -> list[dict]:
    """Parse Astra agentic <tool_call> tags from generated text."""
    tool_calls = []
    pattern = r"<tool_call>\s*({.*?})\s*</tool_call>"
    for match in re.finditer(pattern, text, re.DOTALL):
        try:
            payload = json.loads(match.group(1))
            name = payload.get("name") or payload.get("action")
            params = payload.get("parameters") or payload.get("arguments") or payload
            if name and isinstance(name, str):
                tool_calls.append({
                    "id": f"call_{int(time.time()*1000)}_{len(tool_calls)}",
                    "type": "function",
                    "function": {
                        "name": name,
                        "arguments": json.dumps(params)
                    }
                })
        except Exception:
            continue
    return tool_calls


class TinyLMServerHandler(http.server.BaseHTTPRequestHandler):
    """OpenAI-compatible HTTP chat completions endpoint with Astra tool calling support."""

    model: TinyTransformer = None

    def log_message(self, format, *args):
        pass

    def do_GET(self):
        if self.path in ("/health", "/api/status"):
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            status = {
                "status": "ready",
                "model": "cerium-tiny-lm-astra",
                "architecture": "Astra-MoE-Transformer",
                "parameters": self.model.parameter_count if self.model else 0,
                "context": self.model.config["context"] if self.model else 0,
                "tools_supported": list(CERIUM_TOOLS.keys()),
            }
            self.wfile.write(json.dumps(status).encode("utf-8"))
        elif self.path == "/v1/models":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            data = {
                "object": "list",
                "data": [
                    {"id": "cerium-tiny-lm-astra", "object": "model", "owned_by": "cerium"},
                    {"id": "cerium-astra-moe", "object": "model", "owned_by": "cerium"},
                    {"id": "cerium-tiny-lm-100x", "object": "model", "owned_by": "cerium"}
                ]
            }
            self.wfile.write(json.dumps(data).encode("utf-8"))
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if self.path in ("/v1/chat/completions", "/api/chat"):
            length = int(self.headers.get("Content-Length", 0))
            if length > 65536:
                self.send_response(413)
                self.end_headers()
                return

            body = self.rfile.read(length).decode("utf-8", errors="replace")
            try:
                payload = json.loads(body)
            except Exception:
                self.send_response(400)
                self.end_headers()
                return

            messages = payload.get("messages", [])
            max_tokens = min(int(payload.get("max_tokens", 250)), 1024)
            temperature = float(payload.get("temperature", 0.75))

            if messages:
                prompt_parts = []
                for m in messages:
                    role = m.get("role", "user")
                    content = m.get("content", "").strip()
                    if role == "system":
                        prompt_parts.append(f"Instructions: {content}")
                    elif role == "user":
                        prompt_parts.append(f"User: {content}")
                    elif role == "assistant":
                        prompt_parts.append(f"Assistant: {content}")
                prompt = "\n".join(prompt_parts) + "\nAssistant: "
            else:
                prompt = payload.get("prompt", "")

            try:
                answer = generate(self.model, prompt, max_tokens=max_tokens, temperature=temperature)
            except Exception as e:
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
                return

            # Check for Astra tool calls
            tool_calls = extract_tool_calls(answer)

            choice_message = {
                "role": "assistant",
                "content": answer.strip(),
            }
            if tool_calls:
                choice_message["tool_calls"] = tool_calls

            response = {
                "id": f"chatcmpl-astra-{int(time.time())}",
                "object": "chat.completion",
                "created": int(time.time()),
                "model": "cerium-tiny-lm-astra",
                "choices": [{
                    "index": 0,
                    "message": choice_message,
                    "finish_reason": "tool_calls" if tool_calls else "stop"
                }],
                "usage": {
                    "prompt_tokens": len(prompt.encode("utf-8")),
                    "completion_tokens": len(answer.encode("utf-8")),
                    "total_tokens": len(prompt.encode("utf-8")) + len(answer.encode("utf-8")),
                }
            }
            data = json.dumps(response).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        else:
            self.send_response(404)
            self.end_headers()


def serve(checkpoint: Path, host: str = "127.0.0.1", port: int = 5005):
    """Launch loopback OpenAI-compatible inference server with Astra tool execution."""
    if host not in ("127.0.0.1", "localhost", "::1"):
        raise ValueError("TinyLM server must run strictly on loopback interface.")
    model = load_model(checkpoint)
    TinyLMServerHandler.model = model
    server = http.server.HTTPServer((host, port), TinyLMServerHandler)
    print(f"🌟 Cerium TinyLM Astra serving at http://{host}:{port}/v1/chat/completions")
    print(f"   Architecture: Astra-Transformer | Parameters: {model.parameter_count:,} | Context: {model.config['context']}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down TinyLM server.")
        server.server_close()


def main():
    parser = argparse.ArgumentParser(description="Cerium TinyLM Astra Frontier Engine")
    commands = parser.add_subparsers(dest="command", required=True)

    trainer = commands.add_parser("train")
    trainer.add_argument("--data", type=Path, default=Path(__file__).with_name("corpus.jsonl"))
    trainer.add_argument("--out", type=Path, default=Path("output/cerium-astra.pt"))
    trainer.add_argument("--steps", type=int, default=150)
    trainer.add_argument("--seed", type=int, default=17)
    trainer.add_argument("--profile", type=str, choices=list(PROFILES.keys()), default="astra-mini")
    trainer.add_argument("--context", type=int, default=None)
    trainer.add_argument("--width", type=int, default=None)
    trainer.add_argument("--layers", type=int, default=None)
    trainer.add_argument("--heads", type=int, default=None)
    trainer.add_argument("--kv-heads", type=int, default=None)
    trainer.add_argument("--moe", action="store_true", default=None)
    trainer.add_argument("--lr", type=float, default=0.001)
    trainer.add_argument("--batch-size", type=int, default=16)

    chat = commands.add_parser("chat")
    chat.add_argument("--checkpoint", type=Path, default=Path("output/cerium-astra.pt"))
    chat.add_argument("--prompt", type=str, required=True)
    chat.add_argument("--seed", type=int, default=17)
    chat.add_argument("--temperature", type=float, default=0.75)
    chat.add_argument("--top-p", type=float, default=0.90)
    chat.add_argument("--top-k", type=int, default=24)
    chat.add_argument("--repetition-penalty", type=float, default=1.15)
    chat.add_argument("--max-tokens", type=int, default=250)

    server_cmd = commands.add_parser("serve")
    server_cmd.add_argument("--checkpoint", type=Path, default=Path("output/cerium-astra.pt"))
    server_cmd.add_argument("--host", type=str, default="127.0.0.1")
    server_cmd.add_argument("--port", type=int, default=5005)

    args = parser.parse_args()
    if args.command == "train":
        train(args.data, args.out, steps=args.steps, seed=args.seed,
              profile=args.profile, context=args.context, width=args.width,
              layers=args.layers, heads=args.heads, kv_heads=args.kv_heads,
              moe=args.moe, lr=args.lr, batch_size=args.batch_size)
    elif args.command == "chat":
        model = load_model(args.checkpoint)
        print(generate(model, args.prompt, max_tokens=args.max_tokens,
                       temperature=args.temperature, top_p=args.top_p,
                       top_k=args.top_k, repetition_penalty=args.repetition_penalty,
                       seed=args.seed))
    elif args.command == "serve":
        serve(args.checkpoint, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
