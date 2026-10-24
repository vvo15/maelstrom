# Implementation Plan

All `_Requirements` annotations below refer to clauses in this bugfix's `bugfix.md`. The finalized design's Requirements Traceability table provides the corresponding upstream `siren-gateway` clauses.

- [x] 1. Write the Decoy request-header bug condition exploration test
  - **Property 1: Bug Condition** - Allowed Headers and Authoritative Session Reach the Decoy
  - **CRITICAL**: Write and run this test against the unfixed code before changing `gateway/src/io/decoy.ts` or `gateway/src/io/server.ts`; the test MUST FAIL because that failure confirms the bug exists. Do not weaken the assertions or fix production code as part of this task.
  - Extend the existing transparent-proxy case in `gateway/src/io/server.proxy.test.ts` rather than creating a parallel lifecycle test. Send one real POST through `rawRequest` with a unique `user-agent`, `content-type: application/json; charset=utf-8`, `authorization: Bearer regression-token`, `cookie: mode=demo; theme=dark`, and forged `x-siren-session: deadbeefdeadbeef`.
  - Implement this as a scoped property-based test for the deterministic counterexample: `isBugCondition(input)` holds when `route = "decoy"`, the de-forged Node inbound-header projection contains at least one defined header outside the exact excluded set, and the original Decoy request does not contain that Node-observed value. Constants may be used to scope generation to the concrete failing POST while retaining the property structure.
  - Assert the design's `expectedBehavior(input, result)`: the stub Decoy receives the exact Node-observed `user-agent`, `content-type`, `authorization`, and `cookie` values; receives `deriveSessionId(LOOPBACK, ua)` as its sole `x-siren-session` value; and never receives the forged session value.
  - Preserve the existing assertions in the same flow for method, path plus query, request body bytes, Decoy response status/headers/raw bytes, route, session ID, flagged state, and exactly one emitted event.
  - Run this test file on unfixed code with `npx vitest --run src/io/server.proxy.test.ts` from `gateway/`.
  - **EXPECTED OUTCOME**: The allowed-header assertions fail while the existing computed-session and non-header assertions continue to pass. Record the concrete missing-header counterexample in the test/task notes, then mark this task complete; this same test becomes the fix check after implementation.
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 3.1_

- [x] 2. Write non-header proxy preservation property tests before implementing the fix
  - **Property 2: Preservation** - Non-Header Proxy and Response Behavior
  - **IMPORTANT**: Follow observation-first methodology on unfixed code. First run the existing `gateway/src/io/decoy.test.ts`, `gateway/src/io/server.proxy.test.ts`, `gateway/src/io/server.decoyFailure.test.ts`, and `gateway/src/io/server.routing.test.ts` tests and record the observed baseline for Fetch target/method/body rules, computed session header, response filtering/bytes, 502 mapping, routing, and event count.
  - In `gateway/src/io/decoy.test.ts`, add a property-based baseline test over safe generated paths, bodies, session IDs, and methods. For the non-bug condition (no defined forwardable inbound headers), assert that `forwardToDecoy` preserves the target and method, omits the body for GET/HEAD, sends the body for other covered methods, and sets the computed Session_Header. Before the signature change, call the existing interface; task 3.1 must mechanically add an empty inbound-header map without changing these baseline assertions.
  - Add or retain property coverage for non-header response behavior: generated Decoy status/body fixtures return the same status and raw bytes, benign response headers survive, and `content-encoding`, `content-length`, `transfer-encoding`, and `connection` remain filtered case-insensitively. Do not change the existing response-filtering assertions.
  - Verify the preservation properties pass on unfixed code with `npx vitest --run src/io/decoy.test.ts`, and verify the listed integration baseline remains green except for the intentionally failing Property 1 assertions when that test is included.
  - **EXPECTED OUTCOME**: These preservation tests PASS before implementation and remain the regression oracle after the fix.
  - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [x] 3. Fix Decoy-bound request-header forwarding

  - [x] 3.1 Extend `forwardToDecoy` and cover request-header projection edge cases
    - In `gateway/src/io/decoy.ts`, import or reference Node's `http.IncomingHttpHeaders` type and change `forwardToDecoy` to accept `inboundHeaders` immediately before `sessionId`, matching the target interface in the bugfix design.
    - Define one case-insensitive request exclusion set containing exactly `connection`, `keep-alive`, `transfer-encoding`, `upgrade`, `proxy-authorization`, `te`, `trailer`, `host`, `content-length`, and `x-siren-session` (use `SESSION_HEADER.toLowerCase()` for the last member). Keep this request filter separate from the existing response-header filter.
    - Construct Fetch `Headers` from `Object.entries(inboundHeaders)`: compare each name with `name.toLowerCase()`, skip excluded entries and `undefined`, pass scalar strings through the Fetch Headers API without application-level trimming/parsing/redaction, and append each `string[]` member in order without `.toString()` or a custom join.
    - After projecting all allowed values, call `headers.set(SESSION_HEADER, sessionId)` so the computed ID is authoritative and exactly one Session_Header value is supplied by the Gateway.
    - Leave target construction, method handling, GET/HEAD body omission, the ten-second `AbortController`, timer cleanup, response byte collection, response-header filtering, and `DecoyResult` unchanged.
    - Update every existing call in `gateway/src/io/decoy.test.ts` for the new parameter. Add focused tests proving allowed scalar values (`user-agent`, `content-type`, `authorization`, and `cookie`) pass through; all ten excluded names are rejected under mixed-case synthetic keys; `undefined` is not serialized; array values are appended member-by-member through Fetch Headers; and a forged mixed-case Session_Header is replaced by the computed ID.
    - Keep the Property 2 baseline and existing response-filtering test intact; use captured `RequestInit.headers` to test the request projection without network traffic.
    - _Bug_Condition: `isBugCondition(input)` where `input.route = "decoy"`, `A(input.nodeInboundHeaders)` is non-empty, and at least one allowed Node-observed value is missing from the original Decoy request_
    - _Expected_Behavior: `expectedBehavior(input, result)` requires `result.decoyRequest.allowedHeaders = A(input.nodeInboundHeaders)`, no client-supplied excluded header survives, and `result.decoyRequest[SESSION_HEADER] = input.authoritativeSessionId`_
    - _Preservation: Preserve the design's method/path/body, GET/HEAD, timeout, response filtering, response status/header/raw-byte, and timer-cleanup requirements_
    - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.6_

  - [x] 3.2 Pass a de-forged inbound-header snapshot on the Decoy route
    - In `gateway/src/io/server.ts`, preserve deletion of `req.headers[SESSION_HEADER]` as the first request-processing operation and capture the inbound-header snapshot only after that deletion.
    - Make the snapshot safe for the asynchronous handler by shallow-copying the map and copying each `string[]` value; preserve scalar strings and `undefined` as observed by Node.
    - Pass that snapshot to the new `forwardToDecoy` parameter only in the existing `route === "decoy"` branch.
    - Do not alter `userAgent`, `headerValues`, session derivation, body reading, `RequestMeta`, `updateSession`, pre-scoring route selection, `/verify` capture, Maze request construction, burn accounting, the single event-emission point, history/request-count updates, prediction scheduling, error mapping, or response writing.
    - _Bug_Condition: The original `createHandler` owns de-forged Node inbound headers but omits them from the Decoy call_
    - _Expected_Behavior: The Decoy call receives the same de-forged snapshot used by the request lifecycle, while the computed `sessionId` remains authoritative_
    - _Preservation: Maze routing and all session, scoring, telemetry, burn, prediction, error, and response behavior remain unchanged_
    - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [x] 3.3 Reconcile the stale Gateway design and steering contract
    - Update `.kiro/specs/siren-gateway/design.md` so the `forwardToDecoy` interface includes `http.IncomingHttpHeaders`, documents the exact request exclusion set separately from response filtering, and shows the de-forged header snapshot flowing from `server.ts` to `decoy.ts` in the current lifecycle order.
    - Update its transparent-proxy integration-test description to require preservation of `user-agent`, `content-type`, `authorization`, and `cookie` plus replacement of forged `x-siren-session`, while retaining method/path/body/response/event assertions.
    - Replace the conflicting rule in `.kiro/steering/gateway.md` that says the Decoy receives only `x-siren-session`. State that upstream `siren-gateway` Requirement 2.2 intentionally forwards inbound headers, including `authorization` and `cookie`, except for the exact exclusion set, and that the Gateway replaces any inbound Session_Header with its computed value.
    - Do not rewrite or otherwise modify `.kiro/specs/siren-gateway/requirements.md`; upstream Requirement 2.2 is already authoritative and current.
    - Validate the edited design with `validate_spec_format` and fix applicable format errors before continuing.
    - _Bug_Condition: Stale interface and steering text omit or prohibit the header flow required by the finalized Expected Behavior_
    - _Expected_Behavior: Documentation describes the fixed interface, exact safety boundary, authoritative session replacement, and actual request lifecycle_
    - _Preservation: No unrelated architecture, detector, Maze, session, event, response, or timeout contract changes_
    - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [x] 3.4 Verify the bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Allowed Headers and Authoritative Session Reach the Decoy
    - **IMPORTANT**: Re-run the SAME scoped property test created in task 1; do not replace it with a new test or remove the counterexample assertions.
    - Run `npx vitest --run src/io/server.proxy.test.ts` from `gateway/` and confirm the stub receives unchanged `user-agent`, `content-type`, `authorization`, and `cookie`, while `x-siren-session` equals `deriveSessionId(LOOPBACK, ua)` and differs from the forged value.
    - Confirm the original method/path/query/body, response status/header/raw-byte, route/session/flagged, and exactly-one-event assertions still pass in that flow.
    - **EXPECTED OUTCOME**: Property 1 PASSES, confirming the bug is fixed.
    - _Requirements: 2.1, 2.2, 2.3, 3.1_

  - [x] 3.5 Verify preservation properties still pass
    - **Property 2: Preservation** - Non-Header Proxy and Response Behavior
    - **IMPORTANT**: Re-run the SAME observation-first properties from task 2; do not replace them with tests that assume new behavior.
    - Run `npx vitest --run src/io/decoy.test.ts` from `gateway/` and confirm target/method/body rules, GET/HEAD omission, computed session identity, response status/headers/raw bytes, response filtering, and timer cleanup remain unchanged.
    - **EXPECTED OUTCOME**: Property 2 PASSES after the fix, confirming no regression in behavior outside the request-header projection.
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [x] 4. Checkpoint - run targeted checks and Gateway regressions
  - From `gateway/`, run the focused suite: `npx vitest --run src/io/decoy.test.ts src/io/server.proxy.test.ts`.
  - Run the relevant routing/failure/event regressions: `npx vitest --run src/io/server.decoyFailure.test.ts src/io/server.routing.test.ts src/io/server.ws.test.ts`.
  - Run the strict TypeScript build check: `npx tsc --noEmit -p tsconfig.json`. The package has no separate build script, so this is the applicable compile/type validation.
  - Run the complete Gateway test suite with `npm test` (`vitest --run`) to catch detector, session, replay, WebSocket, and other regressions.
  - Confirm no files under `gateway/src/maze` changed, no source behavior outside the scoped Decoy header flow changed, and `.kiro/specs/siren-gateway/requirements.md` was not rewritten.
  - Ensure every check passes; if a check fails, fix only the scoped implementation/test/documentation issue and rerun the smallest failing command before the full suite.
  - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_
