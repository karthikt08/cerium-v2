import http.client
import json
from pathlib import Path
import tempfile
import threading
import time
import unittest

import torch
from tiny_lm import (
    TinyTransformer, encode, decode, encode_example, encode_chat, train, load_model,
    generate, generate_stream, TinyLMServerHandler, PROFILES, USER, ASSISTANT, END
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

    def test_power100x_scale_and_profiles(self):
        # Baseline model
        tiny = TinyTransformer(**PROFILES["tiny"])
        self.assertLess(tiny.parameter_count, 150_000)

        # 100x upgraded model
        power100x = TinyTransformer(**PROFILES["power100x"])
        self.assertGreater(power100x.parameter_count, 14_000_000)
        self.assertGreater(power100x.parameter_count / tiny.parameter_count, 100.0)
        self.assertEqual(power100x.config["context"], 512)
        self.assertEqual(power100x.config["width"], 384)
        self.assertEqual(power100x.config["layers"], 8)

    def test_kv_cache_generation_speedup(self):
        torch.manual_seed(42)
        model = TinyTransformer(context=64, width=32, layers=2, heads=4).eval()
        prompt = "How do invoices work?"
        
        # Generation with KV cache enabled
        cached = generate(model, prompt, max_tokens=15, use_cache=True, seed=123)
        self.assertIsInstance(cached, str)

        # Streaming generation yields chunked strings
        streamed = list(generate_stream(model, prompt, max_tokens=8, use_cache=True, seed=123))
        self.assertGreater(len(streamed), 0)
        self.assertEqual("".join(streamed), cached[:len("".join(streamed))])

    def test_chat_encoding_and_sampling_controls(self):
        messages = [
            {"role": "system", "content": "You are Cerium Copilot."},
            {"role": "user", "content": "How do I create a quote?"}
        ]
        tokens = encode_chat(messages)
        self.assertEqual(tokens[0], USER)
        self.assertEqual(tokens[-1], ASSISTANT)

        model = TinyTransformer(context=64, width=32, layers=1, heads=4).eval()
        out = generate(model, "Create quote", max_tokens=10, top_p=0.85, repetition_penalty=1.2)
        self.assertIsInstance(out, str)

    def test_train_reload_and_generate(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder)
            data = path / "examples.jsonl"
            data.write_text("\n".join(json.dumps({
                "prompt": f"Question {i}", "completion": f"Response {i}."
            }) for i in range(25)), encoding="utf-8")
            checkpoint = path / "tiny.pt"
            train(data, checkpoint, steps=2, context=32, width=32,
                  layers=1, heads=4, batch_size=2)
            model = load_model(checkpoint)
            self.assertEqual(model.config["context"], 32)
            self.assertIsInstance(generate(model, "Question 1", max_tokens=8), str)


if __name__ == "__main__":
    unittest.main()
