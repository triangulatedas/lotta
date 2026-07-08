# Lotta — German Tutor App

A local, single-user German conversation tutor. You speak German (push-to-talk);
Lotta replies in German, corrects severe errors vocally ("Oh, du meinst: …") and
minor errors as inline highlighted notes. See `SPEC.md` for the full specification.

## Requirements

- Linux with an NVIDIA GPU + driver ≥ 550 (`nvidia-smi` to verify)
- Node **20.19+ / 22.12+** (Vite requirement). The system Node may be older;
  use [`nvm`](https://github.com/nvm-sh/nvm) (`nvm install 22`) — `start.sh`
  loads it automatically, and `frontend/.nvmrc` pins the version.
- Chrome/Chromium (Web Speech API STT) with an internet connection
  (Google servers do the speech recognition — accepted for v1)
- `uv` (used to provide Python 3.12 — vLLM does not support system Python 3.14)

## Current host (2026-07): Threadripper + RTX 3090 (24 GB)

The project began on a 12 GB RTX 4080 Laptop GPU (Mistral-7B AWQ was all that
fit). It now runs on an RTX 3090 with **24 GB**, so the default model is
**Gemma-3-27B**, 4-bit AWQ quantized — Google's Gemma is exceptionally strong
at German. The checkpoint is `gaunernst/gemma-3-27b-it-int4-awq` (~15 GB, not
gated — no HuggingFace login needed).

Gemma 3 is a *multimodal* checkpoint (vLLM also loads its vision tower) with a
256k-token vocab, so its fixed VRAM overhead is large. Defaults in
`backend/llm.py` therefore use `GPU_UTIL=0.94` and cap `max_model_len` at
**4096** — ample for a spoken back-and-forth. If engine init fails with an
"available KV cache memory" error, lower `LOTTA_MAX_LEN`.

## Swapping the model

The model is pure configuration — prompts use the model's own chat template,
so any instruct model works:

```bash
LOTTA_MODEL="Qwen/Qwen2.5-32B-Instruct-AWQ" LOTTA_MAX_LEN=8192 LOTTA_GPU_UTIL=0.92 ./backend/restart.sh
```

`LOTTA_MODEL` (HF repo id), `LOTTA_MAX_LEN` (context cap), `LOTTA_GPU_UTIL`
default to the 24 GB values in `backend/llm.py`. First run of a new model
downloads its weights. If the backend runs on a different machine than the
browser, adjust `BASE` in `frontend/src/api.js` and the CORS origins in
`backend/main.py`.

## Setup

```bash
cd backend
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python -r requirements.txt
```

Frontend (with Node 20.19+/22.12+ active — e.g. `nvm use`):

```bash
cd frontend
npm install
```

## Run (two terminals)

```bash
# Terminal 1 — backend (single worker, NO --reload: reload would double-load the model)
./backend/restart.sh   # also cleans up any lingering vLLM process holding VRAM

# Terminal 2 — frontend
cd frontend && npm run dev
```

Open http://localhost:5173 in Chrome. The UI shows "Modell lädt …" and polls
`/health` until vLLM finishes loading (~30–60 s; first ever run also downloads
~15 GB of weights), then Lotta greets you and asks for a topic.

## Quick backend check

```bash
curl http://localhost:8000/health
curl -X POST http://localhost:8000/session/start
curl -X POST http://localhost:8000/session/respond \
  -H 'Content-Type: application/json' \
  -d '{"session_id":"<ID from start>","user_text":"Das smecker godt"}'
```
