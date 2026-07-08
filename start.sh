#!/bin/bash
# Start the Lotta backend and frontend together.
# Ctrl-C stops both (including the vLLM EngineCore child, which uvicorn
# does not always take down on its own).
cd "$(dirname "$0")"

./backend/restart.sh &
BACKEND_PID=$!

cleanup() {
    kill "$BACKEND_PID" 2>/dev/null
    sleep 3
    pkill -9 -f "VLLM::EngineCore" 2>/dev/null
}
trap cleanup EXIT

npm --prefix frontend run dev
