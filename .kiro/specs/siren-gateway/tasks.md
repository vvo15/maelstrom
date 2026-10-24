# Implementation Plan: Siren Gateway

## Overview

This plan builds the Siren Gateway as a single Node 20 + TypeScript process under `gateway/src`, using only the built-in `http` module, global `fetch`, and the `ws` library at runtime. The build order follows requirement priority: the transparent HTTP proxy, telemetry emission, replay writer, and WebSocket stream come first (with the detector stubbed to "no signals") so the Dashboard can connect early; then the pure Detector and routing-to-maze land on top of that foundation; then error handling and resilience harden every terminal path.

The system is split into a pure Detector layer (`detector/*`, deterministic, I/O-free, property-tested) and an impure I/O layer (`io/*`, sockets/timers/filesystem/Maze). The Maze is consumed only through the `Maze` interface from `shared/contracts.ts` via a single adapter importing `../maze`; nothing under `gateway/src/maze` is created or modified.

## Tasks

- [x] 1. Project and build scaffolding
  - [x] 1.1 Create `gateway/tsconfig.json`, internal types, and config reader
    - Create `gateway/tsconfig.json` targeting Node 20 (strict mode, ESM/`node` resolution) and extend `include` to cover both `src/**/*` and the sibling `../shared/**/*` so imports of `../../../shared/contracts` and `shared/events` type-check and compile within the project root
    - Create `gateway/src/types.ts` with `Signal` (the five names), `SessionState` (sessionId, signals `Set<Signal>`, aiScore, flagged, modelClaim?, statedGoal?, history `SirenEvent[]`, estTokensBurned, estUsdBurned, latestPrediction?, requestCount), and any shared `RequestMeta`/internal request types referenced by the design
    - Create `gateway/src/config.ts` resolving `DECOY_URL` (default `http://localhost:8081`) and `REPLAY_DIR` (default `replays`) as a pure read of `process.env`
    - Update `gateway/package.json` `test` script to `vitest --run`
    - Verify with `tsc --noEmit`
    - _Requirements: 2.5, 2.6, 9.9, 10.1_

- [x] 2. Transparent HTTP proxy, emission, replay, and WebSocket stream (detector stubbed to "no signals")
  - [x] 2.1 Implement the decoy forwarder `io/decoy.ts`
    - Implement `forwardToDecoy(decoyUrl, method, path, body, sessionId)` using global `fetch` with an `AbortController` 10000 ms timeout
    - Add the `SESSION_HEADER` (`x-siren-session`) with the request's Session_Id when forwarding
    - Read the response body as bytes (`Buffer.from(await res.arrayBuffer())` -> `bodyBytes`) for byte-accurate forwarding, and derive a UTF-8 `body` string copy only for `body_snippet`/`estimateBurn`
    - Drop the `content-encoding`, `content-length`, `transfer-encoding`, and `connection` response headers before returning `headers`
    - Throw on connection error or abort so the caller can map to 502
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x]* 2.2 Write unit tests for `io/decoy.ts` header handling
    - Assert `x-siren-session` is added and the four hop-by-hop/body-transforming headers are dropped from the returned headers
    - _Requirements: 2.3, 2.4_

  - [x] 2.3 Implement the JSONL replay writer `io/replay.ts`
    - Implement pure `serializeEvent(ev)` (`JSON.stringify`, no embedded newline) and `parseEvent(line)` (`JSON.parse`)
    - Implement `ReplayWriter(replayDir, startTimeMs)` that creates `Replay_Dir` if absent and `append(ev)` that writes `serializeEvent(ev) + "\n"`, one line per event, to `<Replay_Dir>/<start>.jsonl`
    - Verify with `tsc --noEmit`
    - _Requirements: 9.8, 9.9_

  - [x] 2.4 Implement the WebSocket server `io/wsServer.ts`
    - Implement `startWsServer(port)` listening on 8090 using `ws`, exposing `broadcast(ev)` (send to every connected client) and `recordForReplay(ev)` (push into a last-500 ring buffer)
    - On a new `connection`, send the ring buffer (<=500 most recent events) before any live broadcast
    - _Requirements: 9.5, 9.6, 9.7_

  - [x] 2.5 Implement the emitter `io/emitter.ts`
    - Implement pure `buildSirenEvent({session, current, status, route, flaggedAfterScoring, tsEmit})` conforming exactly to `SirenEvent`, setting `ts` to emission time, `body_snippet` to the first 500 chars of the request body, and `ai_score`/`signals`/`flagged`/`route` from the passed-in state
    - Implement impure `emit(ev)` that broadcasts over WS, records for replay, and appends to the Replay_File — called exactly once per request
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [x] 2.6 Implement the request handler `io/server.ts` with a stubbed detector
    - Implement the `http.createServer` handler listening on 8080: strip any inbound `x-siren-session`, read the full request body, derive a session id (temporary inline or placeholder), and get/create session state
    - In this phase route every request to the Decoy via `forwardToDecoy`, build the single `SirenEvent` with `ai_score` 0, `signals` `[]`, `flagged` false, `route` `decoy`, and emit it exactly once
    - Return the Decoy status, de-headered headers, and raw `bodyBytes` to the client
    - _Requirements: 1.2, 2.1, 2.2, 2.3, 2.4, 9.1, 9.2, 9.3, 9.4_

  - [x] 2.7 Create `session/sessionStore.ts`
    - Implement `getOrCreateSession(sessionId)` and `getSession(sessionId)` over an in-memory `Map<string, SessionState>`, initializing all accumulation fields
    - Verify with `tsc --noEmit`
    - _Requirements: 10.1_

  - [x] 2.8 Create a minimal `gateway/src/index.ts` entry point and `start` script
    - Create `gateway/src/index.ts` that wires config, the session store, the replay writer (`ReplayWriter`), the WebSocket server on 8090, and the HTTP server on 8080 so the transparent proxy and the event stream run end to end before the detector exists
    - Add a `start` script to `gateway/package.json` that runs `tsx src/index.ts`
    - Note: task 9.1 later EXTENDS this same `index.ts` with the process-level `unhandledRejection`/`uncaughtException` handlers rather than creating it anew
    - Verify the server boots, serves a proxied request end to end, and that `tsc --noEmit` passes
    - _Requirements: 2.1, 9.5, 9.8, 9.9_

- [x] 3. Checkpoint - proxy + stream run green
  - Ensure `tsc` build passes and all tests pass with `vitest --run`, ask the user if questions arise.

- [ ] 4. Pure Detector core
  - [~] 4.1 Implement `detector/sessionId.ts`
    - Implement `deriveSessionId(sourceIp, userAgent)` returning the first 16 lowercase hex chars of `sha256(sourceIp + "|" + userAgent)` using `node:crypto` as a pure transform
    - Wire `io/server.ts` to use `deriveSessionId` for the session id
    - _Requirements: 1.1, 1.3, 10.1, 10.2_

  - [~] 4.2 Write property test for session id shape
    - **Feature: siren-gateway, Property 4: Deterministic session id shape** — exercises `deriveSessionId`
    - Arbitrary: `fc.tuple(fc.string(), fc.string())` including unicode and empty strings; assert output matches `/^[0-9a-f]{16}$/` and equal inputs produce identical values; minimum 100 iterations
    - **Validates: Requirements 1.1, 1.3, 10.2 (Property 4)**

  - [~] 4.3 Implement `detector/signals.ts`
    - Define `SIGNALS`, `SIGNAL_WEIGHTS` (bait_followed 60, canary_reused 40, think_pauses 15, enumeration 10, scripted_ua 10), `SCRIPTED_UA_TOKENS`, and the `RequestMeta` type
    - Implement `detectSignals(history, current)`: `bait_followed` (query-stripped path case-sensitively equal to or prefixed by a `BAIT_PATHS` entry), `canary_reused`, `think_pauses` (most recent up to 12 events ordered by `ts` plus current: >=2 gaps >2000 ms and >=3 gaps <800 ms), `enumeration` (>=8 distinct paths in a 60000 ms window AND >=30% of previously-completed requests' statuses in the window are 403/404, excluding the current request), and `scripted_ua` (case-insensitive substring of any token)
    - For `canary_reused`, build a fresh `RegExp` from `CANARY_REGEX.source` per check (never call `.test()`/`.exec()` on the shared global instance), matching against the URL, body, and each single header value
    - Verify with `tsc --noEmit`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 10.1, 10.2_

  - [~] 4.4 Write property test for canary presence
    - **Feature: siren-gateway, Property 5: Canary presence sets the signal** — exercises `detectSignals`
    - Arbitraries: a session id string, a `CanaryKind` from `fc.constantFrom("DBPASS","APIKEY","ADMINTOKEN")`, and a placement selector (URL / body / one header value); embed `canaryFor(sessionId, kind)` into random surrounding text and assert the output includes `canary_reused`; minimum 100 iterations
    - Stateful-global-regex guard: because 100+ iterations run in one process, an advancing `lastIndex` on the shared `CANARY_REGEX` would make the signal appear only on alternating iterations and fail the property — this test explicitly guards that
    - **Validates: Requirements 4.2 (Property 5)**

  - [~] 4.5 Write example test for repeated canary string (non-property guard)
    - Feed the **same** canary string to `detectSignals` on two consecutive calls and assert `canary_reused` is present **both** times, so a stateful shared global regex fails loudly
    - _Requirements: 4.2_

  - [ ]* 4.6 Write unit/edge-case tests for the remaining signals
    - `bait_followed` prefix vs exact match, case sensitivity, query-string stripping (Req 4.1); `think_pauses` exactly-12 boundary and gap thresholds (Req 4.3); `enumeration` 8-distinct-paths/30%-403-404/60s-boundary/current-request-exclusion (Req 4.4); `scripted_ua` per-token case-insensitive matching (Req 4.5); signal recorded at most once per session (Req 4.6)
    - _Requirements: 4.1, 4.3, 4.4, 4.5, 4.6_

  - [~] 4.7 Implement `detector/score.ts`
    - Implement `scoreSignals(signals)` = `min(100, sum of weights)`, `hasFlagged(aiScore)` = `aiScore >= 50`, and `latchFlag(previouslyFlagged, aiScore)` that stays true once set
    - Verify with `tsc --noEmit`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 10.1, 10.2_

  - [~] 4.8 Write property test for bounded score
    - **Feature: siren-gateway, Property 1: Bounded score** — exercises `scoreSignals`
    - Arbitrary: `fc.subarray(SIGNALS)` to pick any subset; assert the result is an integer in `[0, 100]`; minimum 100 iterations
    - **Validates: Requirements 5.2 (Property 1)**

  - [~] 4.9 Implement `detector/route.ts`
    - Implement `decideRoute(flaggedBeforeScoring)` returning `"decoy"` when false (benign or first-flagging request) and `"maze"` when true
    - Verify with `tsc --noEmit`
    - _Requirements: 2.2, 6.1, 6.2, 6.3, 6.4, 10.1_

  - [~] 4.10 Write property test for monotonic score
    - **Feature: siren-gateway, Property 2: Monotonic score** — exercises the pure session-update fold over `detectSignals` + `scoreSignals`
    - Arbitrary: a sequence of `RequestMeta` values (arbitrary method/path/body/userAgent/headerValues/ts); collect successive `ai_score` values and assert each is `>=` the previous; minimum 100 iterations
    - **Validates: Requirements 5.2, 4.6 (Property 2)**

  - [~] 4.11 Write property test for latched flag implies maze routing
    - **Feature: siren-gateway, Property 3: Latched flag implies maze routing** — exercises `decideRoute` + `latchFlag` over generated flag-transition sequences
    - Arbitrary: a sequence engineered to cross the threshold (e.g. a `bait_followed`-triggering request); assert the first-flagging request yields `route = "decoy", flagged = true` and every later request yields `route = "maze", flagged = true`; minimum 100 iterations
    - **Validates: Requirements 5.3, 5.4, 6.1, 6.2, 6.3, 6.4, 9.4 (Property 3)**

- [~] 5. Checkpoint - detector unit + property tests pass
  - Ensure all tests pass with `vitest --run`, ask the user if questions arise.

- [ ] 6. Wire the detector, routing, verify capture, burn, and prediction into the request lifecycle
  - [~] 6.1 Implement the maze adapter `io/mazeAdapter.ts`
    - Import the Maze implementation from `../maze` and export it typed as the `Maze` interface from `shared/contracts.ts`; this is the single import site and nothing under `gateway/src/maze` is created or modified
    - Verify with `tsc --noEmit`
    - _Requirements: 6.5, 6.6_

  - [~] 6.2 Implement `detector/burn.ts`
    - Implement `clampBurnValue(raw)` mapping negative/NaN/Infinity to 0 and otherwise the value, and pure `applyBurn(total, raw)` = `total + clampBurnValue(raw)`
    - Verify with `tsc --noEmit`
    - _Requirements: 7.2, 7.3, 7.4_

  - [~] 6.3 Write property test for non-decreasing burn totals
    - **Feature: siren-gateway, Property 6: Non-decreasing burn totals** — exercises `applyBurn` / `clampBurnValue`
    - Arbitrary: arrays of raw values from `fc.oneof` over normal doubles, negatives, and pathological `NaN`/`Infinity`/`-Infinity`; fold through `applyBurn` and assert each running total is `>=` the previous and stays finite; minimum 100 iterations
    - **Validates: Requirements 7.2, 7.3, 7.4 (Property 6)**

  - [~] 6.4 Wire detection, scoring, flag latching, and routing into `io/server.ts`
    - Capture `flaggedBeforeScoring` from session state before scoring; run `detectSignals`, union new signals into `session.signals`, set `ai_score = scoreSignals(...)`, latch `flagged`, and compute `route = decideRoute(flaggedBeforeScoring)`
    - When route is `maze`, build a `MazeRequest` (session_id, method, path, body, history) and call `maze.generate`; return its status/headers/body. When route is `decoy`, forward as before. The first-flagging request still goes to the Decoy while its emitted `flagged` is the post-scoring `true`
    - _Requirements: 2.2, 5.2, 5.3, 5.4, 6.1, 6.2, 6.3, 6.4, 9.4_

  - [~] 6.5 Implement `/verify` agent/task capture in `io/server.ts`
    - When the path is `/verify`, read the `agent` query parameter into `session.model_claim` and the `task` query parameter into `session.stated_goal`
    - _Requirements: 3.1, 3.2_

  - [ ]* 6.6 Write unit tests for `/verify` query parsing
    - Assert `model_claim` comes from `agent` and `stated_goal` from `task`
    - _Requirements: 3.1, 3.2_

  - [~] 6.7 Wire burn accounting into `io/server.ts`
    - After producing the response body, call `maze.estimateBurn(responseBody, model_claim)` and fold the returned tokens/usd into the running totals via `applyBurn` (clamping neg/NaN/Infinity to 0)
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [~] 6.8 Wire non-blocking prediction enrichment into `io/server.ts`
    - While flagged and the session request count reaches a multiple of 5, call `maze.predict(history)` fire-and-forget (return the response without awaiting); on resolve store the latest prediction, and attach the stored prediction to each subsequent `SirenEvent`
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [~] 7. Checkpoint - routing and enrichment wired
  - Ensure `tsc` build passes and all tests pass with `vitest --run`, ask the user if questions arise.

- [ ] 8. Error handling and resilience
  - [~] 8.1 Handle decoy failure and timeout in `io/server.ts`
    - Catch connection errors and 10s aborts from `forwardToDecoy`; return status 502 to the client and emit exactly one `SirenEvent` with `status = 502` and `route = "decoy"`
    - _Requirements: 11.1_

  - [~] 8.2 Handle `maze.generate` failure in `io/server.ts`
    - Wrap `maze.generate` in try/catch; on throw/reject return status 500 with `DECOY_HEADERS` and emit exactly one `SirenEvent` (`route = "maze"`, `status = 500`)
    - _Requirements: 11.2_

  - [~] 8.3 Handle `predict` and `estimateBurn` failures in `io/server.ts`
    - Attach a `.catch` to the fire-and-forget `predict` that logs and leaves `latestPrediction` unchanged; wrap `estimateBurn` in try/catch that logs and leaves both running totals unchanged
    - _Requirements: 11.3, 11.4_

- [ ] 9. Final wiring and verification
  - [~] 9.1 Extend `gateway/src/index.ts` (created in 2.8) with process-level handlers
    - Register `process.on("unhandledRejection", ...)` and `process.on("uncaughtException", ...)` handlers that log and keep the process running
    - Run the full `tsc` build and `vitest --run` and confirm green
    - _Requirements: 2.1, 9.5, 11.5_

  - [~] 9.2 Write required integration test: transparent proxy forwarding
    - With a stub Decoy `http` server, assert the proxy forwards method/path/body, adds `x-siren-session`, and returns the Decoy's status/headers/body
    - _Requirements: 2.2, 2.3, 2.4_

  - [~] 9.3 Write required integration test: routing decoy then maze (Property 3 end to end)
    - With a stub Decoy and a stub `Maze`, assert benign and the first-flagging request go to the Decoy and subsequent flagged requests go to the Maze and return its `MazeResponse`
    - **Feature: siren-gateway, Property 3: Latched flag implies maze routing** (end-to-end emission of `flagged`/`route`)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 9.4 (Property 3)_

  - [~] 9.4 Write required integration test: decoy failure returns 502 with exactly one event
    - With a stub Decoy that errors or never responds (vitest fake timers for the 10s `AbortController`), assert a 502 response and exactly one emitted event with status 502
    - _Requirements: 11.1_

  - [~] 9.5 Write required integration test: WebSocket last-500 backlog
    - Connect a `ws` client and assert it receives the last-500 backlog on connection before live events, then assert a subsequent request's event is broadcast
    - _Requirements: 9.5, 9.6, 9.7_

  - [ ]* 9.6 Write optional integration tests
    - Non-blocking predict timing (Req 8); replay file creation/naming `<start>.jsonl` with one parseable JSON line per event (Req 9.8, 9.9); `maze.generate` rejection -> 500 + `DECOY_HEADERS` + exactly one event (Req 11.2); predict/estimateBurn rejection leaves prediction/burn totals unchanged (Req 11.3, 11.4); unhandled-rejection resilience (Req 11.5); `DECOY_URL` default resolution (Req 2.5, 2.6)
    - _Requirements: 2.5, 2.6, 8.1, 8.2, 8.3, 8.4, 9.8, 9.9, 11.2, 11.3, 11.4, 11.5_

  - [~] 9.7 Write required property test: replay round-trip
    - **Feature: siren-gateway, Property 7: Replay round-trip** — exercises `serializeEvent` / `parseEvent`
    - Arbitrary: a `SirenEvent` builder covering all required fields plus optional `model_claim`/`stated_goal`/`prediction` present-or-absent, unicode in `body_snippet`, and numeric edge values; assert `parseEvent(serializeEvent(ev))` deep-equals `ev` and each serialized line has no embedded newline; minimum 100 iterations
    - **Validates: Requirements 9.1, 9.8 (Property 7)**

- [~] 10. Final checkpoint - full build and tests green
  - Ensure the full `tsc` build passes and all tests pass with `vitest --run`, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional (tests) and can be skipped for a faster MVP; the only optional tests are 2.2, 4.6, 6.6, and 9.6, and core implementation tasks are never optional.
- Runtime dependencies are limited to built-in `http`, global `fetch`, and `ws`; `vitest`, `fast-check`, `tsx`, and `typescript` are dev dependencies already in `gateway/package.json`.
- All source lives under `gateway/src`; nothing under `gateway/src/maze` is created or modified — the Maze is consumed only through the `Maze` interface via `io/mazeAdapter.ts`.
- The pure Detector layer (`detector/*`) is property-tested with fast-check (100+ iterations each); the I/O layer is covered by integration tests with stub Decoy and stub Maze.
- Property tags follow the design format: **Feature: siren-gateway, Property N: <text>**.
- Each task references specific requirement clauses for traceability, and checkpoints ensure incremental validation.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "2.3", "2.4", "2.7"] },
    { "id": 2, "tasks": ["2.2", "2.5"] },
    { "id": 3, "tasks": ["2.6"] },
    { "id": 4, "tasks": ["2.8"] },
    { "id": 5, "tasks": ["4.1", "4.3", "4.7", "4.9", "6.1", "6.2"] },
    { "id": 6, "tasks": ["4.2", "4.4", "4.5", "4.6", "4.8", "4.10", "4.11", "6.3"] },
    { "id": 7, "tasks": ["6.4"] },
    { "id": 8, "tasks": ["6.5", "6.7", "6.8"] },
    { "id": 9, "tasks": ["6.6", "8.1", "8.2", "8.3"] },
    { "id": 10, "tasks": ["9.1"] },
    { "id": 11, "tasks": ["9.2", "9.3", "9.4", "9.5", "9.6", "9.7"] }
  ]
}
```
