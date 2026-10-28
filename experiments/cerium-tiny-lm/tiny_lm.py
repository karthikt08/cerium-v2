"""Cerium TinyLM: experimental byte-level causal Transformer. Never uses customer data."""
import argparse
import json
import math
from pathlib import Path
import random

import torch
from torch import nn
from torch.nn import functional as F

USER, ASSISTANT, END = 256, 257, 258
VOCAB = 259


def encode(text: str) -> list[int]:
    return list(text.encode("utf-8"))


def decode(tokens: list[int]) -> str:
    return bytes(t for t in tokens if 0 <= t < 256).decode("utf-8", errors="replace")


def encode_example(prompt: str, completion: str) -> list[int]:
    return [USER, *encode(prompt.strip()), ASSISTANT, *encode(completion.strip()), END]


class TinyTransformer(nn.Module):
    """Genuine learned decoder Transformer, not an LLM-scale general assistant."""

    def __init__(self, context=96, width=64, layers=2, heads=4):
        super().__init__()
        if not (16 <= context <= 256 and 32 <= width <= 256 and 1 <= layers <= 6
                and 1 <= heads <= 8 and width % heads == 0):
            raise ValueError("Unsafe TinyLM architecture configuration.")
        self.config = dict(context=context, width=width, layers=layers, heads=heads)
        self.token = nn.Embedding(VOCAB, width)
        self.position = nn.Embedding(context, width)
        block = nn.TransformerEncoderLayer(
            d_model=width, nhead=heads, dim_feedforward=4 * width,
            dropout=0.0, batch_first=True, activation="gelu", norm_first=True)
        self.blocks = nn.TransformerEncoder(
            block, num_layers=layers, enable_nested_tensor=False)
        self.norm = nn.LayerNorm(width)
        self.head = nn.Linear(width, VOCAB, bias=False)
        self.head.weight = self.token.weight

    def forward(self, tokens):
        if tokens.ndim != 2 or tokens.shape[1] > self.config["context"]:
            raise ValueError("Expected tokens of shape [batch, <= context].")
        length = tokens.shape[1]
        position = torch.arange(length, device=tokens.device)
        hidden = self.token(tokens) + self.position(position)
        future = torch.triu(torch.ones(
            length, length, dtype=torch.bool, device=tokens.device), diagonal=1)
        return self.head(self.norm(self.blocks(
            hidden, mask=future, is_causal=True)))


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


def train(data, output, steps=150, seed=17, context=96,
          width=64, layers=2, heads=4, batch_size=16, lr=0.001):
    if not (1 <= steps <= 100000 and 1 <= batch_size <= 64 and 0 < lr <= 0.01):
        raise ValueError("Unsafe training settings.")
    random.seed(seed)
    torch.manual_seed(seed)
    torch.set_num_threads(min(2, torch.get_num_threads()))
    model = TinyTransformer(context=context, width=width, layers=layers, heads=heads)
    corpus = read_corpus(Path(data))
    if len(corpus) <= context + 1:
        raise ValueError("Training data is smaller than the context.")
    opt = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=0.01)
    model.train()
    for step in range(1, steps + 1):
        starts = torch.randint(0, len(corpus) - context - 1, (batch_size,))
        x = torch.stack([corpus[i:i+context] for i in starts])
        y = torch.stack([corpus[i+1:i+context+1] for i in starts])
        logits = model(x)
        loss = F.cross_entropy(logits.reshape(-1, VOCAB), y.reshape(-1))
        opt.zero_grad(set_to_none=True)
        loss.backward()
        nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        opt.step()
        if step == 1 or step == steps or step % max(1, steps // 4) == 0:
            print(f"step {step}/{steps}: loss={loss.item():.3f} "
                  f"perplexity≈{math.exp(min(20, loss.item())):.2f}", flush=True)
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    torch.save({"config": model.config,
                "state_dict": model.state_dict(), "version": 1}, output)
    print(f"Checkpoint: {output} ({output.stat().st_size} bytes)")
    return model


def load_model(checkpoint: Path):
    saved = torch.load(Path(checkpoint), map_location="cpu", weights_only=True)
    if saved.get("version") != 1:
        raise ValueError("Unknown checkpoint version.")
    model = TinyTransformer(**saved["config"])
    model.load_state_dict(saved["state_dict"], strict=True)
    model.eval()
    return model


@torch.inference_mode()
def generate(model, prompt: str, max_tokens=140,
             temperature=0.75, top_k=24, seed=17):
    if (not 1 <= max_tokens <= 512 or not 0 < temperature <= 2
            or not 1 <= top_k <= VOCAB or len(prompt) > 420):
        raise ValueError("Unsafe generation settings.")
    torch.manual_seed(seed)
    torch.set_num_threads(min(2, torch.get_num_threads()))
    tokens = [USER, *encode(prompt.strip()), ASSISTANT]
    created = []
    for _ in range(max_tokens):
        x = torch.tensor([tokens[-model.config["context"] :]], dtype=torch.long)
        scores = model(x)[0, -1, :] / temperature
        values, ids = torch.topk(scores, top_k)
        next_id = int(ids[torch.multinomial(
            F.softmax(values, dim=-1), 1)].item())
        if next_id in (USER, ASSISTANT, END):
            break
        tokens.append(next_id)
        created.append(next_id)
    return decode(created)


def main():
    parser = argparse.ArgumentParser(description="Cerium TinyLM experiment")
    commands = parser.add_subparsers(dest="command", required=True)
    trainer = commands.add_parser("train")
    trainer.add_argument("--data", type=Path,
                         default=Path(__file__).with_name("corpus.jsonl"))
    trainer.add_argument("--out", type=Path, default=Path("output/cerium-tiny.pt"))
    trainer.add_argument("--steps", type=int, default=150)
    trainer.add_argument("--seed", type=int, default=17)
    trainer.add_argument("--width", type=int, default=64)
    trainer.add_argument("--layers", type=int, default=2)
    chat = commands.add_parser("chat")
    chat.add_argument("--checkpoint", type=Path,
                      default=Path("output/cerium-tiny.pt"))
    chat.add_argument("--prompt", type=str, required=True)
    chat.add_argument("--seed", type=int, default=17)
    chat.add_argument("--temperature", type=float, default=0.75)
    chat.add_argument("--max-tokens", type=int, default=140)
    args = parser.parse_args()
    if args.command == "train":
        train(args.data, args.out, args.steps, args.seed,
              width=args.width, layers=args.layers)
    else:
        print(generate(load_model(args.checkpoint), args.prompt,
                       max_tokens=args.max_tokens,
                       temperature=args.temperature, seed=args.seed))


if __name__ == "__main__":
    main()
