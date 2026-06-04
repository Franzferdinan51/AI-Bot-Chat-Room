#!/bin/bash
# Hermes-tuned AI Council start (2026-06-02, updated 2026-06-03)
# Provider order: MiniMax direct (if key) -> OpenRouter free tier -> LM Studio (local).
# Sources env from ~/AppData/Local/hermes/.env AND ~/.openclaw/.env so the
# real LM Studio token (LM_API_TOKEN) gets mapped into LMSTUDIO_KEY.
set -e
COUNCIL_DIR="$(cd "$(dirname "$0")" && pwd)"

# Inherit keys from Hermes env
if [ -f "$HOME/AppData/Local/hermes/.env" ]; then
  set -a
  . "$HOME/AppData/Local/hermes/.env"
  set +a
fi

# Inherit OpenClaw env (LM_API_TOKEN lives here on this host)
if [ -f "$HOME/.openclaw/.env" ]; then
  set -a
  . "$HOME/.openclaw/.env"
  set +a
fi

# Map the real LM Studio token to the council's expected env var.
if [ -n "$LM_API_TOKEN" ]; then
  export LMSTUDIO_KEY="$LM_API_TOKEN"
fi

# Choose provider. MiniMax direct key beats OpenRouter beats LM Studio.
if [ -n "$MINIMAX_API_KEY" ]; then
  export LLM_PROVIDER=minimax
elif [ -n "$OPENROUTER_API_KEY" ]; then
  export LLM_PROVIDER=openrouter
elif [ -n "$LMSTUDIO_KEY" ] || curl -s --max-time 2 http://127.0.0.1:1234/v1/models >/dev/null 2>&1; then
  export LLM_PROVIDER=lmstudio
fi

export PORT="${PORT:-3001}"

cd "$COUNCIL_DIR/agent-api-server"

if [ ! -d node_modules ]; then
  echo "[council] installing agent-api-server dependencies..."
  npm install --no-audit --no-fund --silent
fi

echo "[council] starting API server on :$PORT (provider=$LLM_PROVIDER)..."
nohup node "$COUNCIL_DIR/server.js" > "$COUNCIL_DIR/council-api.log" 2>&1 &
API_PID=$!
echo $API_PID > "$COUNCIL_DIR/council-api.pid"
sleep 3

if curl -s --max-time 3 "http://localhost:$PORT/api/health" >/dev/null; then
  echo "[council] OK API on http://localhost:$PORT (pid $API_PID)"
else
  echo "[council] FAILED; tail of log:"
  tail -20 "$COUNCIL_DIR/council-api.log"
  exit 1
fi

cd "$COUNCIL_DIR"
nohup node mcp-server.mjs > "$COUNCIL_DIR/council-mcp.log" 2>&1 &
MCP_PID=$!
echo $MCP_PID > "$COUNCIL_DIR/council-mcp.pid"
sleep 1
echo "[council] MCP server running (pid $MCP_PID), bridged to API on :$PORT"

echo ""
echo "AI Council ready:"
echo "  API:    http://localhost:$PORT/api/health"
echo "  Ask:    POST $PORT/api/ask { question, councilors? }"
echo "  Web UI: cd $COUNCIL_DIR && npm run dev (port 3003)"
echo "  MCP:    stdio bridge - register with hermes"
