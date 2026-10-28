import json
from pathlib import Path
import tempfile
import unittest

import torch
from tiny_lm import (
    TinyTransformer, encode, decode, encode_example, train, load_model,
    generate, USER, ASSISTANT, END
)


class TinyLMTests(unittest.TestCase):
    def test_encoding(self):
        self.assertEqual(decode(encode("Cerium 🧪")), "Cerium 🧪")
        tokens = encode_example(" hello ", " okay ")
        self.assertEqual(tokens[0], USER)
        self.assertIn(ASSISTANT, tokens)
        self.assertEqual(tokens[-1], END)

    def test_transformer_backward(self):
        model = TinyTransformer(context=32, width=32, layers=1, heads=4)
        x = torch.randint(0, 259, (2, 16))
        logits = model(x)
        self.assertEqual(tuple(logits.shape), (2, 16, 259))
        logits.mean().backward()
        self.assertIsNotNone(model.token.weight.grad)

    def test_future_tokens_are_masked(self):
        torch.manual_seed(7)
        model = TinyTransformer(context=32, width=32, layers=1, heads=4).eval()
        a = torch.tensor([[1, 2, 3, 4]], dtype=torch.long)
        b = torch.tensor([[1, 2, 3, 200]], dtype=torch.long)
        with torch.no_grad():
            left, right = model(a)[:, :3], model(b)[:, :3]
        self.assertTrue(torch.allclose(left, right, atol=1e-5))

    def test_train_reload_and_generate(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder)
            data = path / "examples.jsonl"
            data.write_text("\n".join(json.dumps({
                "prompt": f"Question {i}", "completion": f"Response {i}."
            }) for i in range(20)), encoding="utf-8")
            checkpoint = path / "tiny.pt"
            train(data, checkpoint, steps=2, context=32, width=32,
                  layers=1, heads=4, batch_size=2)
            model = load_model(checkpoint)
            self.assertEqual(model.config["context"], 32)
            self.assertIsInstance(generate(model, "Question 1", max_tokens=8), str)


if __name__ == "__main__":
    unittest.main()
