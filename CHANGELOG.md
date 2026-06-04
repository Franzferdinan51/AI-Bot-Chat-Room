# AI Council Chamber Changelog

## 3.2.0 — 2026-06-03 (Hermes patch)

The "MCP tools half-work" problem. The MCP proxy (`mcp-server.mjs`) declared
70 tools, but ~15 of them routed to endpoints that didn't exist on the council
API. Calling them returned `Cannot POST /mcp` HTML. This release makes the
agent side actually useful.

### Fixed

- **Added `/mcp` JSON-RPC endpoint.** The MCP proxy's `callMCPTool()`
  helper POSTs to `/mcp` — that path returned 404. New endpoint dispatches
  `tools/list` and `tools/call` to local handlers.
- **`push_context` works.** Routes through `/mcp tools/call` to
  `liveSession.contextBlocks` with audit + SSE broadcast.
- **`vote`, `get_votes`, `get_consensus` work.** New `/api/session/vote`
  POST endpoint, with stats tracking and audit logging.
- **`get_audit_log`, `export_audit_log` work.** New `/api/session/audit`
  GET endpoint with capped 500-event ring buffer.
- **`/api/session/start` honors the `councilors` array.** Previously
  hardcoded to first 5 from `councilors.json` regardless of the request.
  Now resolves by id or name, deduplicates, falls back gracefully.
- **Real deliberation loop.** Replaced the hardcoded 5-step script with
  a 2-round loop: round 1 = each councilor opens; round 2 = each councilor
  responds to prior points by name. Configurable.
- **Provider model override is safe.** If active provider is `lmstudio`,
  councilor entries that say `MiniMax-M2.7` no longer force a model
  that doesn't exist. Local-model names pass through; remote ones get
  dropped to the provider default.
- **Default port is now 3001** (was 3006). Matches what `mcp-server.mjs`,
  `start.sh`, and the local MCP config all expect.
- **MiniMax API endpoint fixed.** `api.minimax.chat` (legacy/dead) →
  `api.minimax.io/v1/chat/completions` (OpenAI-compatible).
- **LM Studio auth is optional** (skips `Authorization: Bearer local-no-token-needed`
  which the server now rejects with 401).
- **`liveSession` initialized with `contextBlocks`, `votes`, `audit`**
  so the helpers don't NPE on a fresh start.

### Added

- `audit` ring buffer on every session (cap 500).
- `model` + `provider` fields on every message.
- `start-hermes.sh` improvements: sources `~/.openclaw/.env`, maps
  `LM_API_TOKEN → LMSTUDIO_KEY`, falls back through MiniMax →
  OpenRouter → LM Studio.
- `.gitignore`: `*.pid`, `council-*.log`.

### Verified

- End-to-end deliberation ran 4 messages with `gemma-4-12b-it` on
  LM Studio, ~30s/councilor. The Pragmatist + Technocrat debated
  "Pick one feature to ship for Hermes this week" with real
  back-and-forth (round 2 quotes round 1 by name).
- `push_context` → `vote` → `get_consensus` round-trip via
  `mcp_ai_council_*` MCP tools all return JSON-RPC success.
- Audit log captures: `session_start`, `context_push`, `message`,
  `message_error`, `vote`, `phase`. ~10 events/min during deliberation.
