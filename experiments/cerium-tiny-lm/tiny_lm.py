"""Cerium TinyLM v0.2: supervised, tiny byte-level causal Transformer experiment.

Not a general-purpose LLM; never handles tenant data or serves network requests.
"""
import argparse
import hashlib
import json
import math
import re
from collections import Counter
from pathlib import Path
import random

import torch
from torch import nn
from torch.nn import functional as F

USER, ASSISTANT, END = 256, 257, 258
VOCAB = 259
IGNORE = -100


def encode(text: str) -> list[int]:
    return list(text.encode('utf-8'))


def decode(tokens: list[int]) -> str:
    return bytes(t for t in tokens if 0 <= t < 256).decode('utf-8', errors='replace')


def encode_example(prompt: str, completion: str) -> list[int]:
    return [USER, *encode(prompt.strip()), ASSISTANT, *encode(completion.strip()), END]


class TinyTransformer(nn.Module):
    """Learned autoregressive decoder: causal attention + token prediction."""

    def __init__(self, context=192, width=64, layers=2, heads=4, tie_weights=False):
        super().__init__()
        if not (16 <= context <= 256 and 32 <= width <= 256 and
                1 <= layers <= 6 and 1 <= heads <= 8 and width % heads == 0):
            raise ValueError('Unsafe TinyLM architecture configuration.')
        self.config = dict(context=context, width=width, layers=layers, heads=heads,
                           tie_weights=tie_weights)
        self.token = nn.Embedding(VOCAB, width)
        self.position = nn.Embedding(context, width)
        block = nn.TransformerEncoderLayer(
            d_model=width, nhead=heads, dim_feedforward=4 * width,
            dropout=0.0, batch_first=True, activation='gelu', norm_first=True)
        self.blocks = nn.TransformerEncoder(
            block, num_layers=layers, enable_nested_tensor=False)
        self.norm = nn.LayerNorm(width)
        self.head = nn.Linear(width, VOCAB, bias=False)
        if tie_weights:
            self.head.weight = self.token.weight

    def forward(self, tokens):
        if (tokens.ndim != 2 or tokens.shape[1] < 1 or
                tokens.shape[1] > self.config['context']):
            raise ValueError('Expected tokens [batch, 1..context].')
        length = tokens.shape[1]
        position = torch.arange(length, device=tokens.device)
        hidden = self.token(tokens) + self.position(position)
        future = torch.triu(torch.ones(
            length, length, dtype=torch.bool, device=tokens.device), diagonal=1)
        return self.head(self.norm(self.blocks(hidden, mask=future, is_causal=True)))


def read_corpus(path: Path) -> list[dict]:
    """Read curated rows. Never concatenate unrelated examples into one dialogue."""
    rows = []
    for line_no, line in enumerate(Path(path).read_text(encoding='utf-8').splitlines(), 1):
        if not line.strip():
            continue
        row = json.loads(line)
        if (not isinstance(row, dict) or
                not isinstance(row.get('prompt'), str) or
                not isinstance(row.get('completion'), str) or
                not row['prompt'].strip() or not row['completion'].strip() or
                len(row['prompt']) > 420 or len(row['completion']) > 2000):
            raise ValueError(f'Invalid first-party example at line {line_no}.')
        rows.append(dict(prompt=row['prompt'].strip(), completion=row['completion'].strip()))
    if len(rows) < 8:
        raise ValueError('At least eight curated examples are needed for a holdout split.')
    if len({r['prompt'].casefold() for r in rows}) != len(rows):
        raise ValueError('Duplicate prompts could leak across train and validation.')
    return rows


def split_corpus(rows: list[dict], seed=17, validation_fraction=0.20):
    if not (0.05 <= validation_fraction <= 0.4 and len(rows) >= 8):
        raise ValueError('Invalid holdout settings.')
    order = list(range(len(rows)))
    random.Random(seed).shuffle(order)
    n_validation = max(2, round(len(rows) * validation_fraction))
    return ([rows[i] for i in order[n_validation:]],
            [rows[i] for i in order[:n_validation]])


def example_tensors(prompt: str, completion: str, context: int):
    tokens = encode_example(prompt, completion)
    if len(tokens) - 1 > context:
        raise ValueError('Example is too long for the context window; increase --context '
                         'or curate a shorter example. No silent truncation.')
    # Train the actual completion, not a random slice of the prompt or a
    # transition between unrelated records. Include end-of-answer supervision.
    inputs = torch.tensor(tokens[:-1], dtype=torch.long)
    targets = torch.tensor(tokens[1:], dtype=torch.long)
    targets[:1 + len(encode(prompt.strip()))] = IGNORE
    return inputs, targets


def prepare_rows(rows, context):
    return [example_tensors(row['prompt'], row['completion'], context) for row in rows]


def batch_tensors(examples):
    longest = max(len(x) for x, _ in examples)
    x = torch.zeros((len(examples), longest), dtype=torch.long)
    y = torch.full((len(examples), longest), IGNORE, dtype=torch.long)
    for i, (tokens, targets) in enumerate(examples):
        x[i, :len(tokens)] = tokens
        y[i, :len(targets)] = targets
    return x, y


@torch.inference_mode()
def evaluate(model, examples, batch_size=8):
    """Completion-only held-out NLL, weighted by evaluated target bytes."""
    if not examples:
        raise ValueError('Evaluation requires examples.')
    was_training = model.training
    model.eval()
    total_loss = 0.0
    targets = 0
    for offset in range(0, len(examples), batch_size):
        x, y = batch_tensors(examples[offset:offset + batch_size])
        logits = model(x)
        total_loss += F.cross_entropy(logits.reshape(-1, VOCAB),
                                      y.reshape(-1), ignore_index=IGNORE,
                                      reduction='sum').item()
        targets += int((y != IGNORE).sum().item())
    if was_training:
        model.train()
    loss = total_loss / targets
    return dict(loss=loss, perplexity=math.exp(min(20, loss)),
                target_bytes=targets, examples=len(examples))


def train(data, output, steps=400, seed=17, context=192,
          width=64, layers=2, heads=4, batch_size=8, lr=0.0008,
          eval_every=40, validation_fraction=0.20):
    if not (1 <= steps <= 100000 and 1 <= batch_size <= 64 and
            0 < lr <= 0.01 and 1 <= eval_every <= 100000):
        raise ValueError('Unsafe training settings.')
    torch.manual_seed(seed)
    torch.set_num_threads(min(2, torch.get_num_threads()))
    rows = read_corpus(Path(data))
    training, validation = split_corpus(rows, seed, validation_fraction)
    train_examples = prepare_rows(training, context)
    validation_examples = prepare_rows(validation, context)
    model = TinyTransformer(context=context, width=width, layers=layers, heads=heads)
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=0.01)
    best_validation = float('inf')
    best_step = 0
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    fingerprint = hashlib.sha256(Path(data).read_bytes()).hexdigest()
    sampler = random.Random(seed)
    for step in range(1, steps + 1):
        indices = [sampler.randrange(len(train_examples)) for _ in range(batch_size)]
        x, y = batch_tensors([train_examples[i] for i in indices])
        logits = model(x)
        loss = F.cross_entropy(logits.reshape(-1, VOCAB), y.reshape(-1),
                               ignore_index=IGNORE)
        optimizer.zero_grad(set_to_none=True)
        loss.backward()
        nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        if step % eval_every == 0 or step == steps:
            metrics = evaluate(model, validation_examples)
            print(f'step={step} train_loss={loss.item():.3f} '
                  f'holdout_loss={metrics["loss"]:.3f} '
                  f'holdout_ppl={metrics["perplexity"]:.2f}', flush=True)
            if metrics['loss'] < best_validation:
                best_validation = metrics['loss']
                best_step = step
                torch.save({
                    'version': 2, 'config': model.config,
                    'state_dict': model.state_dict(),
                    'training': {
                        'best_step': best_step, 'validation_loss': best_validation,
                        'validation_perplexity': metrics['perplexity'],
                        'train_examples': len(training), 'holdout_examples': len(validation),
                        'seed': seed, 'validation_fraction': validation_fraction,
                        'data_sha256': fingerprint,
                        'metric': 'completion-only next-byte heldout NLL'
                    }
                }, output)
    print(f'best_step={best_step} best_holdout_loss={best_validation:.3f} '
          f'checkpoint={output} ({output.stat().st_size} bytes)')
    return load_model(output)


def load_model(checkpoint: Path):
    # weights_only prevents unpickling arbitrary Python objects, but it does
    # not authenticate the file. Only use operator-owned checkpoints.
    saved = torch.load(Path(checkpoint), map_location='cpu', weights_only=True)
    if saved.get('version') not in (1, 2):
        raise ValueError('Unknown checkpoint version.')
    model = TinyTransformer(**saved['config'],
                            **({'tie_weights': True} if saved['version'] == 1 else {}))
    model.load_state_dict(saved['state_dict'], strict=True)
    model.eval()
    return model


@torch.inference_mode()
def generate(model, prompt: str, max_tokens=140,
             temperature=0.75, top_k=24, seed=17):
    if (not 1 <= max_tokens <= 512 or not 0 <= temperature <= 2 or
            not 1 <= top_k <= VOCAB or not isinstance(prompt, str) or
            not prompt.strip() or len(prompt) > 420):
        raise ValueError('Unsafe generation settings.')
    torch.manual_seed(seed)
    torch.set_num_threads(min(2, torch.get_num_threads()))
    max_prompt = model.config['context'] - 2
    token_ids = [USER, *encode(prompt.strip())[-max_prompt:], ASSISTANT]
    made = []
    model.eval()
    for _ in range(max_tokens):
        x = torch.tensor([token_ids[-model.config['context']:]], dtype=torch.long)
        scores = model(x)[0, -1, :]
        # Never generate new instruction roles inside the answer.
        scores[[USER, ASSISTANT]] = -float('inf')
        if temperature == 0:
            next_id = int(scores.argmax().item())
        else:
            values, ids = torch.topk(scores / temperature, top_k)
            next_id = int(ids[torch.multinomial(
                F.softmax(values, dim=-1), 1)].item())
        if next_id == END:
            break
        token_ids.append(next_id)
        made.append(next_id)
    return decode(made)


# Corpus retrieval is a separate deterministic fallback, NOT neural generation.
# It is useful for the tiny model's known FAQ prompts without pretending the
# neural model can reason correctly about unseen tasks.
_STOPWORDS = set('a an the i my our we you your what where how do does can should would could to of in on at from with for is are and me please'.split())


def _terms(text):
    words = re.findall(r'[a-z0-9]+', text.casefold())
    return Counter((w[:-1] if len(w) > 4 and w.endswith('s') else w)
                   for w in words if w not in _STOPWORDS)


def verified_reply(prompt: str, rows: list[dict], threshold=0.72):
    """Return curated answer only for confident text matches; otherwise abstain.

    This is NOT model inference and must not be presented as generated by TinyLM.
    """
    if not isinstance(prompt, str) or not prompt.strip() or len(prompt) > 420:
        raise ValueError('Invalid prompt.')
    if not rows:
        return {'source': 'curated-retrieval', 'matched': False, 'reply': None}
    question = prompt.strip().casefold()
    for row in rows:
        if row['prompt'].casefold() == question:
            return {'source': 'curated-retrieval', 'matched': True,
                    'reply': row['completion'], 'similarity': 1.0}
    query = _terms(prompt)
    vectors = [_terms(row['prompt']) for row in rows]
    document_frequencies = Counter()
    for vec in vectors:
        document_frequencies.update(vec.keys())
    idf = {term: math.log((len(rows) + 1) / (count + 1)) + 1
           for term, count in document_frequencies.items()}

    def magnitude(vec):
        return math.sqrt(sum((frequency * idf.get(term, 0)) ** 2
                             for term, frequency in vec.items()))

    qnorm = magnitude(query)
    if not qnorm:
        return {'source': 'curated-retrieval', 'matched': False, 'reply': None}
    ranking = []
    for i, vec in enumerate(vectors):
        denom = magnitude(vec) * qnorm
        overlap = sum(query[t] * f * idf[t] ** 2
                      for t, f in vec.items() if t in query and t in idf)
        ranking.append((overlap / denom if denom else 0.0, i))
    ranking.sort(reverse=True)
    score, index = ranking[0]
    margin = score - (ranking[1][0] if len(ranking) > 1 else 0)
    if score < threshold or margin < 0.12:
        return {'source': 'curated-retrieval', 'matched': False, 'reply': None}
    return {'source': 'curated-retrieval', 'matched': True,
            'reply': rows[index]['completion'], 'similarity': round(score, 3)}


def main():
    parser = argparse.ArgumentParser(description='Cerium TinyLM v0.2 (experimental)')
    commands = parser.add_subparsers(dest='command', required=True)
    trainer = commands.add_parser('train')
    trainer.add_argument('--data', type=Path,
                         default=Path(__file__).with_name('corpus.jsonl'))
    trainer.add_argument('--out', type=Path, default=Path('output/cerium-tiny-v02.pt'))
    trainer.add_argument('--steps', type=int, default=400)
    trainer.add_argument('--seed', type=int, default=17)
    trainer.add_argument('--context', type=int, default=192)
    trainer.add_argument('--width', type=int, default=64)
    trainer.add_argument('--layers', type=int, default=2)
    trainer.add_argument('--batch-size', type=int, default=8)
    trainer.add_argument('--eval-every', type=int, default=40)
    chat = commands.add_parser('chat')
    chat.add_argument('--checkpoint', type=Path,
                      default=Path('output/cerium-tiny-v02.pt'))
    chat.add_argument('--prompt', type=str, required=True)
    chat.add_argument('--seed', type=int, default=17)
    chat.add_argument('--temperature', type=float, default=0.75)
    chat.add_argument('--max-tokens', type=int, default=140)
    chat.add_argument('--mode', choices=['model', 'verified'], default='model')
    chat.add_argument('--data', type=Path, default=Path(__file__).with_name('corpus.jsonl'))
    validator = commands.add_parser('eval')
    validator.add_argument('--checkpoint', type=Path,
                           default=Path('output/cerium-tiny-v02.pt'))
    validator.add_argument('--data', type=Path,
                           default=Path(__file__).with_name('corpus.jsonl'))
    validator.add_argument('--subset', choices=['holdout', 'all'], default='holdout')
    validator.add_argument('--seed', type=int, default=17)
    args = parser.parse_args()
    if args.command == 'train':
        train(args.data, args.out, args.steps, args.seed,
              context=args.context, width=args.width, layers=args.layers,
              batch_size=args.batch_size, eval_every=args.eval_every)
    elif args.command == 'chat':
        if args.mode == 'verified':
            result = verified_reply(args.prompt, read_corpus(args.data))
            print(json.dumps(result, ensure_ascii=False))
        else:
            print(generate(load_model(args.checkpoint), args.prompt,
                           max_tokens=args.max_tokens,
                           temperature=args.temperature, seed=args.seed))
    else:
        saved = torch.load(args.checkpoint, map_location='cpu', weights_only=True)
        if args.subset == 'holdout' and saved.get('version') == 2:
            digest = hashlib.sha256(args.data.read_bytes()).hexdigest()
            if digest != saved.get('training', {}).get('data_sha256'):
                raise ValueError('This is not the original train/holdout corpus. '
                                 'For an independent dataset use --subset all.')
            fraction = saved['training']['validation_fraction']
            _, rows = split_corpus(read_corpus(args.data),
                                   saved['training']['seed'], fraction)
        else:
            rows = read_corpus(args.data)
            if args.subset == 'holdout':
                _, rows = split_corpus(rows, args.seed)
        model = load_model(args.checkpoint)
        print(json.dumps(evaluate(model, prepare_rows(rows, model.config['context'])),
                         indent=2))


if __name__ == '__main__':
    main()
