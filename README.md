# Lotta — German Tutor App

A local, single-user German conversation tutor. You speak German (push-to-talk);
Lotta replies in German, corrects severe errors vocally ("Oh, du meinst: …") and
minor errors as inline highlighted notes. See `SPEC.md` for the full specification.

## Requirements

- Linux with an NVIDIA GPU + driver ≥ 550 (`nvidia-smi` to verify)
- Node 18+
- Chrome/Chromium (Web Speech API STT) with an internet connection
  (Google servers do the speech recognition — accepted for v1)
- `uv` (used to provide Python 3.12 — vLLM does not support system Python 3.14)

## Deviation from SPEC.md (user-approved 2026-07-04)

The spec assumes an RTX 4080 with **16 GB** VRAM and Mistral-7B in plain
float16. This host has an RTX 4080 **Laptop** GPU with **12 GB**, where fp16
weights (~14.5 GB) cannot fit. The backend therefore runs the same model
**4-bit AWQ quantized**: `TheBloke/Mistral-7B-Instruct-v0.2-AWQ` (~4.2 GB,
not gated — no HuggingFace login needed). `max_model_len` is capped at 8192
so the KV cache fits.

## Swapping the model (e.g. after a GPU upgrade)

The model is pure configuration — prompts use the model's own chat template,
so any instruct model works. On a 32 GB card, for example:

```bash
LOTTA_MODEL="Qwen/Qwen3-32B-AWQ" LOTTA_MAX_LEN=16384 LOTTA_GPU_UTIL=0.9 ./backend/restart.sh
```

`LOTTA_MODEL` (HF repo id), `LOTTA_MAX_LEN` (context cap), `LOTTA_GPU_UTIL`
default to the 12 GB-laptop-safe values in `backend/llm.py`. First run of a
new model downloads its weights. If the backend runs on a different machine
than the browser, adjust `BASE` in `frontend/src/api.js` and the CORS
origins in `backend/main.py`.

## Setup

```bash
cd backend
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python -r requirements.txt
```

Frontend:

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
~4.2 GB of weights), then Lotta greets you and asks for a topic.

## Quick backend check

```bash
curl http://localhost:8000/health
curl -X POST http://localhost:8000/session/start
curl -X POST http://localhost:8000/session/respond \
  -H 'Content-Type: application/json' \
  -d '{"session_id":"<ID from start>","user_text":"Das smecker godt"}'
```
