"""Cerium TinyLM: experimental byte-level causal Transformer. Never uses customer data."""
import argparse
import http.server
import json
import math
from pathlib import Path
import random
import sys
import threading
import time

import torch
from torch import nn
from torch.nn import functional as F

USER, ASSISTANT, END = 256, 257, 258
VOCAB = 259

PROFILES = {
    "tiny": dict(context=96, width=64, layers=2, heads=4),
    "medium": dict(context=256, width=192, layers=4, heads=6),
    "power100x": dict(context=512, width=384, layers=8, heads=6),
    "ultra": dict(context=1024, width=512, layers=12, heads=8),
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


class CausalSelfAttention(nn.Module):
    """Multi-head self-attention with KV-caching and hardware-accelerated scaled dot product."""

    def __init__(self, width: int, heads: int, dropout: float = 0.0):
        super().__init__()
        if width % heads != 0:
            raise ValueError("width must be divisible by heads")
        self.width = width
        self.heads = heads
        self.head_dim = width // heads
        self.qkv_proj = nn.Linear(width, 3 * width, bias=True)
        self.out_proj = nn.Linear(width, width, bias=True)
        self.dropout = dropout

    def forward(self, x, kv_cache=None):
        B, T, C = x.shape
        qkv = self.qkv_proj(x)
        q, k, v = qkv.chunk(3, dim=-1)
        q = q.view(B, T, self.heads, self.head_dim).transpose(1, 2)
        k = k.view(B, T, self.heads, self.head_dim).transpose(1, 2)
        v = v.view(B, T, self.heads, self.head_dim).transpose(1, 2)

        if kv_cache is not None:
            past_k, past_v = kv_cache
            k = torch.cat([past_k, k], dim=2)
            v = torch.cat([past_v, v], dim=2)

        new_cache = (k, v)

        if kv_cache is not None and T == 1:
            out = F.scaled_dot_product_attention(
                q, k, v, dropout_p=self.dropout if self.training else 0.0, is_causal=False
            )
        else:
            out = F.scaled_dot_product_attention(
                q, k, v, dropout_p=self.dropout if self.training else 0.0, is_causal=True
            )

        out = out.transpose(1, 2).contiguous().view(B, T, C)
        return self.out_proj(out), new_cache


class TransformerBlock(nn.Module):
    """Pre-LayerNorm Transformer decoder block for stable deep optimization."""

    def __init__(self, width: int, heads: int, dim_feedforward: int = None):
        super().__init__()
        ff_dim = dim_feedforward or (4 * width)
        self.norm1 = nn.LayerNorm(width)
        self.attn = CausalSelfAttention(width, heads)
        self.norm2 = nn.LayerNorm(width)
        self.mlp = nn.Sequential(
            nn.Linear(width, ff_dim),
            nn.GELU(),
            nn.Linear(ff_dim, width),
        )

    def forward(self, x, kv_cache=None):
        attn_out, updated_cache = self.attn(self.norm1(x), kv_cache=kv_cache)
        x = x + attn_out
        x = x + self.mlp(self.norm2(x))
        return x, updated_cache


class TinyTransformer(nn.Module):
    """Scalable learned causal decoder Transformer with KV-cache and high-capacity profiles."""

    def __init__(self, context=96, width=64, layers=2, heads=4, vocab_size=VOCAB):
        super().__init__()
        if not (16 <= context <= 2048 and 32 <= width <= 1024 and 1 <= layers <= 24
                and 1 <= heads <= 32 and width % heads == 0):
            raise ValueError("Unsafe TinyLM architecture configuration.")
        self.config = dict(context=context, width=width, layers=layers, heads=heads, vocab_size=vocab_size)
        self.token = nn.Embedding(vocab_size, width)
        self.position = nn.Embedding(context, width)
        self.blocks = nn.ModuleList([
            TransformerBlock(width, heads, 4 * width) for _ in range(layers)
        ])
        self.norm = nn.LayerNorm(width)
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
        device = tokens.device
        position = torch.arange(start_pos, start_pos + length, device=device)
        hidden = self.token(tokens) + self.position(position)

        new_caches = [] if kv_caches is not None else None
        for i, block in enumerate(self.blocks):
            layer_cache = kv_caches[i] if kv_caches is not None else None
            hidden, updated_cache = block(hidden, kv_cache=layer_cache)
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
          width=None, layers=None, heads=None, batch_size=16, lr=0.001,
          val_split=0.1):
    if not (1 <= steps <= 100000 and 1 <= batch_size <= 64 and 0 < lr <= 0.05):
        raise ValueError("Unsafe training settings.")

    # Select configuration from profile or explicit flags
    base_profile = profile or ("power100x" if (width is None and layers is None) else "tiny")
    cfg = dict(PROFILES.get(base_profile, PROFILES["tiny"]))
    if context is not None:
        cfg["context"] = context
    if width is not None:
        cfg["width"] = width
    if layers is not None:
        cfg["layers"] = layers
    if heads is not None:
        cfg["heads"] = heads

    random.seed(seed)
    torch.manual_seed(seed)
    torch.set_num_threads(min(4, torch.get_num_threads()))

    model = TinyTransformer(**cfg)
    corpus = read_corpus(Path(data))
    ctx = cfg["context"]
    if len(corpus) <= ctx + 1:
        raise ValueError(f"Training data length ({len(corpus)}) is smaller than context ({ctx}).")

    # Split into train and held-out validation portions
    split_idx = int(len(corpus) * (1.0 - val_split))
    split_idx = max(ctx + 2, min(split_idx, len(corpus) - ctx - 2))
    train_corpus = corpus[:split_idx]
    val_corpus = corpus[split_idx:]

    opt = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=0.01)

    print(f"TinyLM Architecture: context={ctx}, width={cfg['width']}, "
          f"layers={cfg['layers']}, heads={cfg['heads']}")
    print(f"Model parameters: {model.parameter_count:,} "
          f"({model.parameter_count / 121984:.1f}x baseline capacity)")
    print(f"Corpus: {len(corpus):,} byte tokens (train={len(train_corpus):,}, val={len(val_corpus):,})")

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
        "version": 2,
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
    if version not in (1, 2):
        raise ValueError(f"Unknown checkpoint version: {version}")

    config = dict(saved["config"])
    state = saved["state_dict"]

    model = TinyTransformer(**config)
    try:
        model.load_state_dict(state, strict=True)
    except Exception:
        model.load_state_dict(state, strict=False)

    model.eval()
    return model


@torch.inference_mode()
def generate_stream(model: TinyTransformer, prompt: str, max_tokens=200,
                    temperature=0.75, top_k=24, top_p=0.90, repetition_penalty=1.15,
                    seed=17, use_cache=True):
    """Streaming autoregressive generator with KV-cache and nucleus sampling."""
    if (not 1 <= max_tokens <= 1024 or not 0.01 <= temperature <= 2.0
            or not 1 <= top_k <= VOCAB or not 0.0 < top_p <= 1.0
            or not 0.5 <= repetition_penalty <= 2.0 or len(prompt) > 2000):
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
        scores[USER] = float('-inf')
        scores[ASSISTANT] = float('-inf')
        if step == 0:
            scores[END] = float('-inf')

        if repetition_penalty != 1.0 and created:
            for tid in set(created[-64:]):
                if scores[tid] > 0:
                    scores[tid] /= repetition_penalty
                else:
                    scores[tid] *= repetition_penalty

        if top_k < VOCAB:
            values, indices = torch.topk(scores, top_k)
            filtered_scores = torch.full_like(scores, float('-inf'))
            filtered_scores.scatter_(0, indices, values)
            scores = filtered_scores

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


class TinyLMServerHandler(http.server.BaseHTTPRequestHandler):
    """OpenAI-compatible HTTP chat completions endpoint."""

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
                "model": "cerium-tiny-lm-100x",
                "parameters": self.model.parameter_count if self.model else 0,
                "context": self.model.config["context"] if self.model else 0,
            }
            self.wfile.write(json.dumps(status).encode("utf-8"))
        elif self.path == "/v1/models":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            data = {
                "object": "list",
                "data": [{
                    "id": "cerium-tiny-lm-100x",
                    "object": "model",
                    "created": int(time.time()),
                    "owned_by": "cerium"
                }]
            }
            self.wfile.write(json.dumps(data).encode("utf-8"))
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if self.path in ("/v1/chat/completions", "/api/chat"):
            length = int(self.headers.get("Content-Length", 0))
            if length > 32768:
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
            max_tokens = min(int(payload.get("max_tokens", 200)), 512)
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

            response = {
                "id": f"chatcmpl-tinylm-{int(time.time())}",
                "object": "chat.completion",
                "created": int(time.time()),
                "model": "cerium-tiny-lm-100x",
                "choices": [{
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": answer.strip(),
                    },
                    "finish_reason": "stop"
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
    """Launch loopback OpenAI-compatible inference server."""
    if host not in ("127.0.0.1", "localhost", "::1"):
        raise ValueError("TinyLM server must run strictly on loopback interface.")
    model = load_model(checkpoint)
    TinyLMServerHandler.model = model
    server = http.server.HTTPServer((host, port), TinyLMServerHandler)
    print(f"🚀 Cerium TinyLM serving at http://{host}:{port}/v1/chat/completions")
    print(f"   Model parameters: {model.parameter_count:,} | Context: {model.config['context']}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down TinyLM server.")
        server.server_close()


def main():
    parser = argparse.ArgumentParser(description="Cerium TinyLM 100x experimental engine")
    commands = parser.add_subparsers(dest="command", required=True)

    trainer = commands.add_parser("train")
    trainer.add_argument("--data", type=Path, default=Path(__file__).with_name("corpus.jsonl"))
    trainer.add_argument("--out", type=Path, default=Path("output/cerium-tiny.pt"))
    trainer.add_argument("--steps", type=int, default=150)
    trainer.add_argument("--seed", type=int, default=17)
    trainer.add_argument("--profile", type=str, choices=list(PROFILES.keys()), default="power100x")
    trainer.add_argument("--context", type=int, default=None)
    trainer.add_argument("--width", type=int, default=None)
    trainer.add_argument("--layers", type=int, default=None)
    trainer.add_argument("--heads", type=int, default=None)
    trainer.add_argument("--lr", type=float, default=0.001)
    trainer.add_argument("--batch-size", type=int, default=16)

    chat = commands.add_parser("chat")
    chat.add_argument("--checkpoint", type=Path, default=Path("output/cerium-tiny.pt"))
    chat.add_argument("--prompt", type=str, required=True)
    chat.add_argument("--seed", type=int, default=17)
    chat.add_argument("--temperature", type=float, default=0.75)
    chat.add_argument("--top-p", type=float, default=0.90)
    chat.add_argument("--top-k", type=int, default=24)
    chat.add_argument("--repetition-penalty", type=float, default=1.15)
    chat.add_argument("--max-tokens", type=int, default=200)

    server_cmd = commands.add_parser("serve")
    server_cmd.add_argument("--checkpoint", type=Path, default=Path("output/cerium-tiny.pt"))
    server_cmd.add_argument("--host", type=str, default="127.0.0.1")
    server_cmd.add_argument("--port", type=int, default=5005)

    args = parser.parse_args()
    if args.command == "train":
        train(args.data, args.out, steps=args.steps, seed=args.seed,
              profile=args.profile, context=args.context, width=args.width,
              layers=args.layers, heads=args.heads, lr=args.lr,
              batch_size=args.batch_size)
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
