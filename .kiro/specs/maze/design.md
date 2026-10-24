# Maze (Labyrinth) — Design

## Module layout (`gateway/src/maze/`)
- `index.ts` — `SirenMaze` class + default singleton. Owns the per-(session,
  path) cache and routes to mock or LLM generation. Default export is the
  `Maze` instance the gateway imports.
- `mock.ts` — deterministic generator. Seeded PRNG (FNV-1a hash -> mulberry32)
  keyed on `session_id|path`. Produces fake town-internal pages with 1-3 deeper
  links and at most one canary. Pure.
- `generateLlm.ts` — anthropic-mode generator. Prompts a cheap model for JSON
  `{status, content_type, body}`, validates status, sanitizes body, falls back
  to mock on any problem.
- `llm.ts` — `fetch`-based Anthropic wrapper with 8s AbortController timeout,
  `llmMode()` (mock default), JSON extraction helper. No SDK dependency.
- `sanitize.ts` — `REAL_SECRET_PATTERNS`, `sanitize(body, sessionId)`,
  `containsRealSecret(text)`. Pure.
- `burn.ts` — `estimateBurn`, `priceFor` (longest-key substring match). Pure.
  Reads `prices.json`.
- `predict.ts` — `predictMock` (deterministic heuristic) + `predict` (LLM with
  mock fallback).
- `prices.json` — per-token USD prices, dated, with a `default` row.

## Determinism strategy
Mock pages are a pure function of `(session_id, path)`. The `SirenMaze` cache
makes even LLM-mode pages byte-identical on revisit by freezing and storing the
first response per `(session_id, path)`. History and body never affect output.

## Safety strategy
- Mock is the default; no key means no network.
- Every body (mock and LLM) goes through `sanitize()` before return.
- The attacker and maze are the only LLM-calling code; the maze calls only the
  Anthropic endpoint and only in anthropic mode.
- No `exec`/`eval`/shell; no working exploit content.

## Attacker (`attacker/`)
- `client.ts` — single `http_request` tool; `resolveSameOrigin` host-locks to
  the gateway origin, rejects other hosts/schemes, redirects set to manual.
- `scripted.ts` — fixed repeatable sequence with seeded 300–3000ms pauses.
- `llm.ts` — vanilla-pentester agent loop (first 3 moves scripted, 40-step
  cap, 8s per call), falls back to scripted if no key.
- `ui.ts` — [THINK]/[REQ]/findings split-screen output.

## Testable properties (PBT, mock mode) — see maze.properties.test.ts
Maps to Requirements 2, 5, 6, 8, 9, 10, 11.
