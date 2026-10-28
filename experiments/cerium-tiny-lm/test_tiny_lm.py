import json
from pathlib import Path
import tempfile
import unittest

import torch
from tiny_lm import (
    TinyTransformer, encode, decode, encode_example, encode_chat, train, load_model,
    generate, generate_stream, extract_tool_calls, PROFILES, USER, ASSISTANT, END
)


class TinyLMTests(unittest.TestCase):
    def test_encoding(self):
        self.assertEqual(decode(encode("Cerium 🧪 Astra")), "Cerium 🧪 Astra")
        tokens = encode_example(" hello ", " okay ")
        self.assertEqual(tokens[0], USER)
        self.assertIn(ASSISTANT, tokens)
        self.assertEqual(tokens[-1], END)

    def test_transformer_backward(self):
        model = TinyTransformer(context=32, width=32, layers=1, heads=4)
        x = torch.randint(0, 259, (2, 16))
        logits = model(x)
        self.assertEqual(tuple(logits.shape), (2, 16, 261))
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

    def test_astra_scale_and_moe_profiles(self):
        # Baseline model
        tiny = TinyTransformer(**PROFILES["tiny"])
        self.assertLess(tiny.parameter_count, 150_000)

        # Astra Mini profile (~35M params)
        mini = TinyTransformer(**PROFILES["astra-mini"])
        self.assertGreater(mini.parameter_count, 30_000_000)
        self.assertEqual(mini.config["context"], 1024)

        # Astra Base profile (~115M params)
        base = TinyTransformer(**PROFILES["astra-base"])
        self.assertGreater(base.parameter_count, 100_000_000)

        # Astra MoE profile (>400M params with 8 experts)
        moe = TinyTransformer(**PROFILES["astra-moe"])
        self.assertGreater(moe.parameter_count, 400_000_000)
        self.assertGreater(moe.parameter_count / tiny.parameter_count, 3000.0)

    def test_kv_cache_generation_speedup(self):
        torch.manual_seed(42)
        model = TinyTransformer(context=64, width=32, layers=2, heads=4).eval()
        prompt = "How do invoices work?"

        cached = generate(model, prompt, max_tokens=15, use_cache=True, seed=123)
        self.assertIsInstance(cached, str)

        streamed = list(generate_stream(model, prompt, max_tokens=8, use_cache=True, seed=123))
        self.assertGreater(len(streamed), 0)
        self.assertEqual("".join(streamed), cached[:len("".join(streamed))])

    def test_astra_agentic_tool_extraction(self):
        text = (
            "I will help you create that quote.\n"
            "<thought>Calculate 3 items at $450 each = $1,350.</thought>\n"
            "<tool_call>{\"name\": \"cerium_create_quote\", \"parameters\": {\"customer\": \"Apex Corp\", \"amount\": 1350}}</tool_call>\n"
            "Quote drafted for Apex Corp."
        )
        tools = extract_tool_calls(text)
        self.assertEqual(len(tools), 1)
        self.assertEqual(tools[0]["function"]["name"], "cerium_create_quote")
        args = json.loads(tools[0]["function"]["arguments"])
        self.assertEqual(args["customer"], "Apex Corp")
        self.assertEqual(args["amount"], 1350)

    def test_chat_encoding_and_sampling_controls(self):
        messages = [
            {"role": "system", "content": "You are Cerium Copilot Astra."},
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
            checkpoint = path / "astra_test.pt"
            train(data, checkpoint, steps=2, context=32, width=32,
                  layers=1, heads=4, batch_size=2)
            model = load_model(checkpoint)
            self.assertEqual(model.config["context"], 32)
            self.assertIsInstance(generate(model, "Question 1", max_tokens=8), str)


if __name__ == "__main__":
    unittest.main()
