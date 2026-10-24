# Requirements Document

## Introduction

The Siren Gateway is a single Node 20 + TypeScript process that sits in front of a PHP decoy application. For every inbound HTTP request it derives a stable session identity, scores the session against a fixed set of behavioral signals, and decides whether to forward the request untouched to the decoy or to hand the request to an adversarial "maze" that wastes the attacker's time and tokens. The Gateway observes, scores, and routes; it never generates maze content itself. For every request the Gateway emits exactly one structured telemetry event, streams that event to a live dashboard over WebSocket, and persists it to a replay log.

The Gateway is implemented in `gateway/src` using only Node's built-in `http` module, the built-in `fetch`, and the `ws` library for WebSocket. The Gateway treats the maze implementation as an opaque dependency: it imports a `Maze` implementation from `./maze` (owned by the Labyrinth component) and consumes it only through the `Maze` interface defined in `shared/contracts.ts`. The Gateway MUST NOT create or modify anything under `gateway/src/maze`.

The build ordering intent is encoded in requirement priority: the transparent HTTP proxy (Requirement 2) and the WebSocket event stream (Requirement 9) are the highest-priority capabilities so that the dashboard can connect and observe traffic early; the detection signals (Requirements 4–5) and routing-to-maze behavior (Requirement 6) build on top of that foundation.

## Glossary

- **Gateway**: The Node 20 + TypeScript process defined by this spec. The single system under specification. Listens for HTTP on port 8080 and for WebSocket on port 8090.
- **Decoy**: The external PHP application the Gateway forwards benign traffic to, reachable at `Decoy_URL`.
- **Maze**: An external component, owned by the Labyrinth team, imported from `./maze` and consumed only through the `Maze` interface in `shared/contracts.ts`. Exposes `generate`, `estimateBurn`, and `predict`.
- **Dashboard**: A WebSocket client that connects to the Gateway to observe telemetry events in real time.
- **Session**: The set of all requests sharing one `session_id`. State accumulates across requests within a Session.
- **Session_Id**: The first 16 lowercase hexadecimal characters of `sha256(sourceIp + "|" + userAgent)`.
- **Source_Ip**: The remote IP address of the inbound HTTP connection.
- **User_Agent**: The value of the inbound `user-agent` HTTP header, or an empty string when absent.
- **Siren_Event**: One telemetry record conforming exactly to the `SirenEvent` type in `shared/events.ts`.
- **Ai_Score**: An integer from 0 through 100 inclusive representing the Session's accumulated suspicion, stored in the `ai_score` field of each Siren_Event.
- **Signal**: One named behavioral indicator from the set `bait_followed`, `canary_reused`, `think_pauses`, `enumeration`, `scripted_ua`. Each Signal has a fixed weight.
- **Flagged**: A latched boolean Session state that becomes true when Ai_Score reaches 50 and never returns to false.
- **Maze_Request**: A `MazeRequest` value as defined in `shared/contracts.ts` (`session_id`, `method`, `path`, `body`, `history`).
- **Maze_Response**: A `MazeResponse` value as defined in `shared/contracts.ts` (`status`, `headers`, `body`).
- **Prediction**: A `Prediction` value as defined in `shared/contracts.ts` (`likely_goal`, `current_step`, `predicted_next_path`).
- **Session_Header**: The HTTP header named by `SESSION_HEADER` in `shared/contracts.ts`, value `x-siren-session`.
- **Bait_Paths**: The array `BAIT_PATHS` from `shared/contracts.ts`: `["/verify", "/staff/auditor-register"]`.
- **Canary_Regex**: The regular expression `CANARY_REGEX` from `shared/contracts.ts`: `/SIREN_[A-Z]+_[0-9a-f]{10}/g`.
- **Canary_String**: Any string produced by `canaryFor(sessionId, kind)` from `shared/contracts.ts`.
- **Decoy_Url**: The forwarding target for benign traffic, taken from the `DECOY_URL` environment variable, defaulting to `http://localhost:8081` when the variable is unset.
- **Replay_Dir**: The directory holding replay logs, taken from the `REPLAY_DIR` environment variable, defaulting to `replays` when the variable is unset.
- **Replay_File**: The newline-delimited JSON file at `<Replay_Dir>/<Gateway start time>.jsonl` to which each Siren_Event is appended.
- **Detector**: The pure-function layer that computes Signals, Ai_Score, Flagged state, and Session_Id from inputs without performing input/output.
- **Scripted_Ua_Tokens**: The case-insensitive substrings `python-`, `httpx`, `requests`, `aiohttp`, `node`, `undici`, `axios`, `curl`, `wget`, `go-http`.

## Requirements

### Requirement 1: Session identity derivation

**User Story:** As a Siren operator, I want each request attributed to a deterministic session identity, so that behavior can be correlated across requests from the same actor.

#### Acceptance Criteria

1. WHEN an HTTP request is received, THE Gateway SHALL compute Session_Id as the first 16 lowercase hexadecimal characters of `sha256(Source_Ip + "|" + User_Agent)`.
2. WHEN an HTTP request is received, THE Gateway SHALL remove any inbound Session_Header from the request before any further processing.
3. WHEN two requests share the same Source_Ip and the same User_Agent, THE Gateway SHALL compute identical Session_Id values for both requests.

### Requirement 2: Transparent HTTP proxy (highest priority)

**User Story:** As a Siren operator, I want benign traffic forwarded transparently to the decoy, so that normal clients observe no difference while Siren observes them.

#### Acceptance Criteria

1. THE Gateway SHALL listen for HTTP requests on port 8080.
2. WHILE the Session's Flagged state was false at the start of handling the current request, before the current request is scored, WHEN an HTTP request is received, THE Gateway SHALL forward the request to Decoy_Url using the request method, path, and body.
3. WHEN the Gateway forwards a request to Decoy_Url, THE Gateway SHALL add the Session_Header with the request's Session_Id value.
4. WHEN the Decoy returns a response, THE Gateway SHALL return the Decoy response status, headers, and body to the client.
5. THE Gateway SHALL read Decoy_Url from the `DECOY_URL` environment variable.
6. IF the `DECOY_URL` environment variable is unset, THEN THE Gateway SHALL use `http://localhost:8081` as Decoy_Url.

### Requirement 3: Agent and goal capture on bait verification

**User Story:** As a Siren analyst, I want the claimed agent and task recorded when an actor hits the verification bait, so that I can label the actor's self-declared intent.

#### Acceptance Criteria

1. WHEN an HTTP request with a path of `/verify` is received, THE Gateway SHALL read the `agent` query parameter and store its value as the Session's `model_claim`.
2. WHEN an HTTP request with a path of `/verify` is received, THE Gateway SHALL read the `task` query parameter and store its value as the Session's `stated_goal`.

### Requirement 4: Behavioral signal detection

**User Story:** As a Siren analyst, I want each suspicious behavior detected as a named signal, so that scoring and dashboards can explain why a session is suspicious.

#### Acceptance Criteria

1. WHEN the request path, excluding any query string, is case-sensitively equal to or has as a case-sensitive prefix any entry in Bait_Paths, THE Gateway SHALL record the `bait_followed` Signal for the Session.
2. WHEN Canary_Regex produces at least one match in the request URL, in the request body, or in any single request header value, THE Gateway SHALL record the `canary_reused` Signal for the Session.
3. WHERE the inter-request gaps computed over the most recent up to 12 requests of the Session, ordered by `ts`, contain at least 2 gaps greater than 2000 milliseconds and at least 3 gaps less than 800 milliseconds, THE Gateway SHALL record the `think_pauses` Signal for the Session.
4. WHERE at least 8 distinct request paths occur within a 60000 millisecond window and at least 30 percent of the response statuses of the Session's previously completed requests within that window are 403 or 404, THE Gateway SHALL record the `enumeration` Signal for the Session, where the 403/404 ratio is computed over the Session's previously completed requests in the window and excludes the current request whose response status is not yet known at signal-computation time.
5. WHEN the User_Agent contains any entry in Scripted_Ua_Tokens as a substring, compared case-insensitively, THE Gateway SHALL record the `scripted_ua` Signal for the Session.
6. THE Gateway SHALL record each Signal at most once per Session.

### Requirement 5: Session scoring and flagging

**User Story:** As a Siren operator, I want a bounded suspicion score and a latched flag, so that routing decisions are stable and explainable.

#### Acceptance Criteria

1. THE Gateway SHALL assign the weights `bait_followed` = 60, `canary_reused` = 40, `think_pauses` = 15, `enumeration` = 10, `scripted_ua` = 10.
2. WHEN Signals change for a Session, THE Gateway SHALL set Ai_Score to the minimum of 100 and the sum of the weights of the Signals recorded for that Session.
3. WHEN a Session's Ai_Score reaches 50, THE Gateway SHALL set the Session's Flagged state to true.
4. WHILE a Session's Flagged state is true, THE Gateway SHALL keep the Flagged state true for the remainder of the Session.

### Requirement 6: Routing flagged traffic to the maze

**User Story:** As a Siren operator, I want flagged sessions diverted to the maze, so that adversarial actors waste effort against synthetic content instead of reaching the decoy.

#### Acceptance Criteria

1. WHILE the Session's Flagged state was true at the start of handling the current request, before the current request is scored, WHEN an HTTP request is received, THE Gateway SHALL build a Maze_Request containing the Session_Id, the request method, the request path, the request body, and the Session's Siren_Event history.
2. WHILE the Session's Flagged state was true at the start of handling the current request, before the current request is scored, WHEN an HTTP request is received, THE Gateway SHALL obtain a Maze_Response by calling `maze.generate` with the Maze_Request.
3. WHEN a Maze_Response is obtained, THE Gateway SHALL return the Maze_Response status, headers, and body to the client.
4. IF the current request transitions the Session's Flagged state from false to true while scoring the current request, THEN THE Gateway SHALL route the current request to the Decoy.
5. THE Gateway SHALL import the Maze implementation from `./maze` and consume it only through the `Maze` interface defined in `shared/contracts.ts`.
6. THE Gateway SHALL confine all source changes to locations outside `gateway/src/maze`.

### Requirement 7: Burn accounting

**User Story:** As a Siren analyst, I want a running estimate of tokens and dollars an actor has burned, so that I can quantify the cost imposed on attackers.

#### Acceptance Criteria

1. WHEN a response body is produced for a request, THE Gateway SHALL call `maze.estimateBurn` with the response body and the Session's `model_claim`.
2. WHEN `maze.estimateBurn` returns a token count and a dollar amount, THE Gateway SHALL add the returned token count to the Session's `est_tokens_burned` running total and the returned dollar amount to the Session's `est_usd_burned` running total.
3. IF `maze.estimateBurn` returns a token count that is negative, NaN, or Infinity, THEN THE Gateway SHALL add 0 to the Session's `est_tokens_burned` running total instead of the returned token count, so that `est_tokens_burned` is always non-decreasing regardless of the maze implementation.
4. IF `maze.estimateBurn` returns a dollar amount that is negative, NaN, or Infinity, THEN THE Gateway SHALL add 0 to the Session's `est_usd_burned` running total instead of the returned dollar amount, so that `est_usd_burned` is always non-decreasing regardless of the maze implementation.
5. IF adding a clamped burn value would make `est_tokens_burned` or `est_usd_burned` exceed `Number.MAX_VALUE`, THEN THE Gateway SHALL set that total to `Number.MAX_VALUE`, so that both running totals stay finite and non-decreasing.

### Requirement 8: Non-blocking prediction enrichment

**User Story:** As a Siren analyst, I want periodic predictions of an attacker's next move, so that the dashboard can anticipate intent without slowing responses.

#### Acceptance Criteria

1. WHILE a Session is Flagged, WHEN the Session's request count reaches a multiple of 5, THE Gateway SHALL call `maze.predict` with the Session's Siren_Event history.
2. WHEN the Gateway calls `maze.predict`, THE Gateway SHALL return the current request's response without waiting for `maze.predict` to resolve.
3. WHEN a `maze.predict` call resolves with a Prediction, THE Gateway SHALL store that Prediction as the Session's latest Prediction.
4. WHERE a Session has a stored latest Prediction, THE Gateway SHALL attach that Prediction to each subsequent Siren_Event for the Session.

### Requirement 9: Telemetry event emission and streaming (highest priority)

**User Story:** As a dashboard user, I want one structured event per request streamed live and persisted, so that I can observe and replay all gateway activity.

#### Acceptance Criteria

1. WHEN a request completes, THE Gateway SHALL emit exactly one Siren_Event conforming to the `SirenEvent` type in `shared/events.ts`.
2. WHEN the Gateway emits a Siren_Event, THE Gateway SHALL set `ts` to the emission time in milliseconds since the Unix epoch.
3. WHEN the Gateway emits a Siren_Event, THE Gateway SHALL set `body_snippet` to the first 500 characters of the request body.
4. WHEN the Gateway emits a Siren_Event, THE Gateway SHALL set `ai_score` to the Session's Ai_Score, `signals` to the Session's recorded Signals, `flagged` to the Session's Flagged state after scoring the current request, and `route` to `maze` when the current request was actually sent to the Maze and to `decoy` when the current request was actually sent to the Decoy.
5. THE Gateway SHALL listen for WebSocket connections on port 8090.
6. WHEN a Siren_Event is emitted, THE Gateway SHALL broadcast that Siren_Event to every connected WebSocket client.
7. WHEN a new WebSocket client connects, THE Gateway SHALL send the most recent 500 emitted Siren_Events to that client before broadcasting subsequent events.
8. WHEN a Siren_Event is emitted, THE Gateway SHALL append that Siren_Event to the Replay_File as a single JSON line.
9. WHEN the Gateway starts, THE Gateway SHALL read Replay_Dir from the `REPLAY_DIR` environment variable, defaulting to `replays` when the variable is unset, SHALL set the Replay_File path to `<Replay_Dir>/<Gateway start time>.jsonl`, and SHALL create Replay_Dir if it does not already exist.

### Requirement 10: Pure detector core

**User Story:** As a Siren developer, I want the detection logic expressed as pure functions, so that correctness properties can be tested in isolation.

#### Acceptance Criteria

1. THE Gateway SHALL compute Session_Id, Signals, Ai_Score, and Flagged state using functions that perform no input/output and depend only on their arguments.
2. WHEN a Detector function is called twice with equal arguments, THE Gateway SHALL produce equal results from both calls.

### Requirement 11: Error handling and resilience

**User Story:** As a Siren operator, I want the Gateway to degrade gracefully when the Decoy or Maze fails, so that observation and telemetry continue even under adverse conditions.

#### Acceptance Criteria

1. IF the request to the Decoy fails with a connection error OR does not complete within 10000 milliseconds, THEN THE Gateway SHALL return status 502 to the client AND SHALL emit exactly one Siren_Event with status 502.
2. IF `maze.generate` throws or returns a rejected promise, THEN THE Gateway SHALL return status 500 to the client with the `DECOY_HEADERS` headers AND SHALL emit exactly one Siren_Event.
3. IF `maze.predict` throws or returns a rejected promise, THEN THE Gateway SHALL log the error, keep the Session's previous latest Prediction unchanged, and continue processing.
4. IF `maze.estimateBurn` throws or returns a rejected promise, THEN THE Gateway SHALL log the error, keep the Session's `est_tokens_burned` and `est_usd_burned` running totals unchanged, and continue processing.
5. WHILE the Gateway process is running, THE Gateway SHALL continue running when an unhandled promise rejection occurs.

## Correctness Properties

The following properties are designated for property-based testing with fast-check. Each property is restated as an EARS acceptance criterion so that it maps directly onto a verifiable requirement. These properties target the pure Detector functions (Requirement 10) and the Siren_Event persistence format (Requirement 9), where input varies meaningfully and a large number of generated cases finds edge cases a few examples would miss.

### Property 1: Bounded score

1. FOR ALL sequences of requests within a Session, THE Gateway SHALL keep Ai_Score greater than or equal to 0 and less than or equal to 100.

### Property 2: Monotonic score

1. WHEN a request is added to a Session, THE Gateway SHALL set the resulting Ai_Score to a value greater than or equal to the Session's Ai_Score before that request.

### Property 3: Latched flag implies maze routing

1. WHEN a Session's Siren_Event is emitted for a request handled after the request that first set the Session's Flagged state to true, THE Gateway SHALL emit that Siren_Event with `flagged` equal to true and `route` equal to `maze`.
2. WHEN a Session's Siren_Event is emitted for the request that first set the Session's Flagged state to true, THE Gateway SHALL emit that Siren_Event with `flagged` equal to true and `route` equal to `decoy`.

### Property 4: Deterministic session id shape

1. WHEN Session_Id is computed, THE Gateway SHALL produce a value that is exactly 16 lowercase hexadecimal characters.
2. WHEN Session_Id is computed twice from equal Source_Ip and User_Agent inputs, THE Gateway SHALL produce identical values.

### Property 5: Canary presence sets the signal

1. WHEN a request contains any Canary_String in its URL, body, or any header value, THE Gateway SHALL record the `canary_reused` Signal for the Session.

### Property 6: Non-decreasing burn totals

1. WHEN a Siren_Event is emitted for a Session, THE Gateway SHALL keep `est_tokens_burned` and `est_usd_burned` greater than or equal to their values in the Session's previous Siren_Event.

### Property 7: Replay round-trip

1. WHEN a Siren_Event is appended to the Replay_File as a JSON line and that line is parsed back, THE Gateway SHALL produce a Siren_Event equal to the original Siren_Event.
