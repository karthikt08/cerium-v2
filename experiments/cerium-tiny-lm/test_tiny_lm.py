import json
from pathlib import Path
import tempfile
import unittest

import torch
from tiny_lm import (
    TinyTransformer, encode, decode, encode_example, train, load_model,
    generate, USER, ASSISTANT, END, IGNORE,
    read_corpus, split_corpus, example_tensors, batch_tensors, prepare_rows,
    evaluate, verified_reply
)


class TinyLMTests(unittest.TestCase):
    def test_encoding(self):
        self.assertEqual(decode(encode('Cerium 🧪')), 'Cerium 🧪')
        self.assertEqual(encode_example(' hello ', ' okay ')[0], USER)
        self.assertIn(ASSISTANT, encode_example('x', 'y'))
        self.assertEqual(encode_example('x', 'y')[-1], END)

    def test_causal_mask_and_gradient(self):
        model = TinyTransformer(context=32, width=32, layers=1, heads=4).eval()
        a = torch.tensor([[1, 2, 3, 4]], dtype=torch.long)
        b = torch.tensor([[1, 2, 3, 200]], dtype=torch.long)
        with torch.no_grad():
            self.assertTrue(torch.allclose(model(a)[:, :3], model(b)[:, :3], atol=1e-5))
        loss = model(a).sum()
        loss.backward()
        self.assertIsNotNone(model.token.weight.grad)

    def test_loss_masks_prompts_and_keeps_end_marker(self):
        x, y = example_tensors('abc', 'yes', context=32)
        self.assertEqual(x.tolist(), [USER, 97, 98, 99, ASSISTANT, 121, 101, 115])
        self.assertEqual(y[:4].tolist(), [IGNORE] * 4)
        self.assertEqual(y[4:].tolist(), [121, 101, 115, END])
        self.assertEqual(int((y != IGNORE).sum()), 4)
        a, b = batch_tensors([(x, y), example_tensors('a', 'n', 32)])
        self.assertEqual(a.shape, b.shape)
        self.assertEqual(b[1, -1].item(), IGNORE)

    def test_oversize_examples_fail_not_truncate(self):
        with self.assertRaisesRegex(ValueError, 'too long'):
            example_tensors('question', 'x' * 200, 32)

    def test_duplicate_prompt_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'bad.jsonl'
            rows = [dict(prompt=f'Q{i}', completion='answer') for i in range(8)]
            rows[-1]['prompt'] = 'q0'
            path.write_text('\n'.join(json.dumps(r) for r in rows), encoding='utf-8')
            with self.assertRaisesRegex(ValueError, 'Duplicate prompts'):
                read_corpus(path)

    def test_holdout_split_deterministic_no_leakage(self):
        rows = [dict(prompt=f'q{i}', completion=f'a{i}') for i in range(30)]
        a, b = split_corpus(rows, seed=17)
        c, d = split_corpus(rows, seed=17)
        self.assertEqual((a, b), (c, d))
        self.assertTrue({r['prompt'] for r in a}.isdisjoint(r['prompt'] for r in b))
        self.assertEqual(len(a) + len(b), len(rows))

    def test_holdout_metric_ignores_padded_and_prompt_tokens(self):
        torch.manual_seed(8)
        model = TinyTransformer(context=64, width=32, layers=1, heads=4)
        rows = [dict(prompt='sample prompt', completion='hello'),
                dict(prompt='a', completion='world')]
        report = evaluate(model, prepare_rows(rows, context=64))
        self.assertEqual(report['target_bytes'], 12)
        self.assertEqual(report['examples'], 2)
        self.assertGreater(report['loss'], 0)

    def test_verified_retrieval_is_separate_and_abstains(self):
        rows = read_corpus(Path(__file__).with_name('corpus.jsonl'))
        exact = verified_reply('How do invoices work?', rows)
        self.assertEqual(exact['source'], 'curated-retrieval')
        self.assertTrue(exact['matched'])
        self.assertIn('not proof', exact['reply'])
        unrelated = verified_reply('How do I transfer cryptocurrency from a wallet?', rows)
        self.assertFalse(unrelated['matched'])
        self.assertIsNone(unrelated['reply'])

    def test_train_best_checkpoint_reloads(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder)
            dataset = path / 'examples.jsonl'
            dataset.write_text('\n'.join(json.dumps({
                'prompt': f'Question {i}', 'completion': f'Response {i}.'
            }) for i in range(20)), encoding='utf-8')
            checkpoint = path / 'tiny.pt'
            train(dataset, checkpoint, steps=3, context=64, width=32,
                  layers=1, heads=4, batch_size=2, eval_every=1)
            saved = torch.load(checkpoint, map_location='cpu', weights_only=True)
            self.assertEqual(saved['version'], 2)
            self.assertEqual(saved['training']['holdout_examples'], 4)
            self.assertEqual(saved['training']['train_examples'], 16)
            self.assertIn('validation_loss', saved['training'])
            model = load_model(checkpoint)
            self.assertEqual(model.config['context'], 64)
            self.assertIsInstance(generate(model, 'Question 1', max_tokens=8), str)
            self.assertIsInstance(generate(model, 'Question 1', max_tokens=8,
                                           temperature=0), str)


if __name__ == '__main__':
    unittest.main()
