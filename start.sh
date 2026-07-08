#!/bin/bash
# Start the Lotta backend and frontend together.
# Ctrl-C stops both (including the vLLM EngineCore child, which uvicorn
# does not always take down on its own).
cd "$(dirname "$0")"

# Vite needs Node 20.19+/22.12+; this host's system Node is 18. Load nvm
# (default alias -> Node 22) so `npm run dev` below uses it. Executed scripts
# don't source ~/.bashrc, so nvm must be loaded explicitly here.
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

./backend/restart.sh &
BACKEND_PID=$!

cleanup() {
    kill "$BACKEND_PID" 2>/dev/null
    sleep 3
    pkill -9 -f "VLLM::EngineCore" 2>/dev/null
}
trap cleanup EXIT

npm --prefix frontend run dev
