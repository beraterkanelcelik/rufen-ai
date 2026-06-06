# Local Qwen planner — MLX setup runbook (host Mac, Slice 6)

Stands up the **UI orchestration / Phase-1 planner** LLM as a local model on the 64 GB Mac,
exposing an **OpenAI-compatible `/v1` endpoint** that `backend/calls/planner.py` will call in Slice 6.

> This is the **planner** LLM only. The **in-call** voice LLM stays `claude-haiku-4-5` via ElevenLabs — untouched.

## Model choice

| Repo (Hugging Face) | Quant | ~Disk/RAM | Notes |
|---|---|---|---|
| `mlx-community/Qwen3.5-35B-A3B-6bit` | 6-bit | ~28 GB | **Default** — best headroom next to Docker/OS |
| `mlx-community/Qwen3.5-35B-A3B-8bit` | 8-bit | ~37 GB | Max quality; quit Docker while planning if RAM is tight |
| `mlx-community/Qwen3.6-35B-A3B-6bit` | 6-bit | ~28 GB | **Upgrade** — higher on agentic/MCPMark benchmarks |
| `mlx-community/Qwen3.6-35B-A3B-8bit` | 8-bit | ~37 GB | Upgrade + max quality |

MoE, ~3B active params → fast on Apple Silicon (~90–108 tok/s via MLX). 35B total / 256K ctx.
Pick **3.6 if available** when you download; otherwise **3.5**. Start with **6-bit**.

> Note: these are vision-language (VLM) checkpoints. For our **text + tool-calling** planner, use a
> server that loads them cleanly (LM Studio below) rather than fighting the text-only `mlx_lm.server`.

---

## Path A — LM Studio (recommended, least friction)

1. Install LM Studio (Apple Silicon build) and make sure its backend is **MLX**, not GGUF.
2. **Download:** search `Qwen3.5-35B-A3B` (or `Qwen3.6-35B-A3B`) → pick the **MLX 6-bit** (or 8-bit) build.
3. **Serve:** Developer tab → **Start Server** (default `http://localhost:1234/v1`). Enable
   "Apply Prompt Template" and tool/function-calling support.
4. Smoke-test (see below), pointing at port **1234**.

---

## Path B — mlx CLI (power user, scriptable)

Use a fresh venv with a recent Python (3.11/3.12 — NOT the system 3.9).

```bash
# from repo root, on the HOST (Apple Silicon)
python3.12 -m venv .venv-qwen
source .venv-qwen/bin/activate
pip install -U mlx-lm mlx-vlm huggingface_hub

# pre-download so the 28–37 GB pull isn't happening at 18:55 on demo day
hf download mlx-community/Qwen3.5-35B-A3B-6bit

# OpenAI-compatible server on :8080
#   text path:
mlx_lm.server --model mlx-community/Qwen3.5-35B-A3B-6bit --host 127.0.0.1 --port 8080
#   if the VLM weights don't load under mlx_lm, use the vlm server instead:
# mlx_vlm.server --model mlx-community/Qwen3.5-35B-A3B-6bit --host 127.0.0.1 --port 8080
```

`.venv-qwen/` is gitignored (covered by `.venv*`); the model cache lives in `~/.cache/huggingface`.

---

## Smoke test (both paths) — OpenAI chat + tool-calling

Set `PORT` to 1234 (LM Studio) or 8080 (mlx CLI), then:

```bash
PORT=1234
# 1) basic chat
curl -s http://localhost:$PORT/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"local","messages":[{"role":"user","content":"Reply with exactly: OK"}]}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["choices"][0]["message"]["content"])'

# 2) tool-calling (what the planner relies on) — expect a tool_calls entry back
curl -s http://localhost:$PORT/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{
    "model":"local",
    "messages":[{"role":"user","content":"Call 2 plumbers in Hamburg about a leak. Use the tool."}],
    "tools":[{"type":"function","function":{
      "name":"make_plan",
      "description":"Compile a call plan",
      "parameters":{"type":"object","properties":{
        "targets":{"type":"array","items":{"type":"object","properties":{
          "number":{"type":"string"},"business_name":{"type":"string"}}}}},
        "required":["targets"]}}}],
    "tool_choice":"auto"
  }' | python3 -m json.tool
```

If #1 prints `OK` and #2 returns a `tool_calls` array, the planner endpoint is ready.

---

## Slice 6 wiring (.env)

Add to `.env` (and `.env.example`) — `planner.py` will read these; Anthropic stays as fallback:

```
PLANNER_BASE_URL=http://localhost:1234/v1   # 8080 if using the mlx CLI
PLANNER_MODEL=Qwen3.5-35B-A3B               # whatever the server reports / the repo name
PLANNER_API_KEY=local                       # dummy; local servers ignore it
# fallback if the local server is down:
# ANTHROPIC_API_KEY=...  (claude-haiku-4-5-20251001)
```

Demo-day tip: start the model server **first thing in the morning** and leave it warm.
Pre-download the weights the night before — a 28–37 GB pull is not a demo-hour surprise.

Sources:
- https://huggingface.co/mlx-community/Qwen3.5-35B-A3B-6bit
- https://huggingface.co/mlx-community/Qwen3.5-35B-A3B-8bit
- https://huggingface.co/mlx-community/Qwen3.6-35B-A3B-8bit
- https://antekapetanovic.com/blog/qwen3.5-apple-silicon-benchmark/
