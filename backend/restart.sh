#!/bin/bash
# Cleanly (re)start the Lotta backend.
#
# Two pitfalls this script exists to avoid:
# - killing uvicorn does not always take down its vLLM EngineCore child,
#   which then sits holding ~10 GB of VRAM and blocks the next start
# - inline `pkill -f "uvicorn main:app" ... && uvicorn main:app` kills its
#   own shell (the pattern matches the shell's argv); from a script file
#   the patterns are not in argv, so this is safe
cd "$(dirname "$0")"

pkill -f "uvicorn main:app" 2>/dev/null
sleep 3
pkill -9 -f "VLLM::EngineCore" 2>/dev/null
sleep 2

exec .venv/bin/uvicorn main:app --host 192.168.3.225 --port 8000
