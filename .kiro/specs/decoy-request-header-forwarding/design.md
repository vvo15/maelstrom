# Decoy Request Header Forwarding Bugfix Design

## Overview

The Gateway currently forwards a decoy-bound request's method, URL, body, and computed `x-siren-session`, but drops every other inbound request header. This violates `siren-gateway` Requirement 2.2 and prevents the Decoy from observing headers such as `user-agent`, `content-type`, `authorization`, and `cookie`.

The fix will carry the de-forged Node inbound header map from `gateway/src/io/server.ts` into `gateway/src/io/decoy.ts`, project it through an explicit case-insensitive exclusion set, and then set the Gateway-computed session header as the sole authoritative `x-siren-session` value. It will not alter routing, request method/path/body handling, response proxying, timeout behavior, event emission, or Maze behavior. This scope directly reconciles bugfix Requirements 2.1–2.3 and 3.1–3.7 with upstream `siren-gateway` Requirements 1.2, 2.2, 2.3, and 2.4.

This document describes the bug fix only. No source-code or `tasks.md` change is part of the design phase.

## Glossary

- **Bug_Condition (C)**: A request is routed to the Decoy, contains at least one defined forwardable inbound header, and the original proxy fails to send that header with the Node-observed value.
- **Property (P)**: The Decoy-bound request contains the allowed inbound-header projection, omits excluded client-supplied headers, and contains the Gateway-computed Session_Header.
- **Preservation**: Existing routing, method/path/body forwarding, response status/header/body proxying, timeout mapping, and event behavior that must remain unchanged.
- **Inbound_Headers**: The `http.IncomingHttpHeaders` snapshot exposed by Node after parsing an inbound request; names are normally lowercase and values have type `string | string[] | undefined`.
- **Forwardable_Header**: A defined Inbound_Headers entry whose case-insensitive name is not in Excluded_Request_Headers.
- **Excluded_Request_Headers**: `connection`, `keep-alive`, `transfer-encoding`, `upgrade`, `proxy-authorization`, `te`, `trailer`, `host`, `content-length`, and `x-siren-session`.
- **Session_Header**: `SESSION_HEADER` from `shared/contracts.ts`, whose value is `x-siren-session`.
- **Authoritative_Session_Id**: The session ID computed by the Gateway from source IP and user agent under Requirements 1.1 and 1.3.
- **`createHandler`**: The request lifecycle orchestrator in `gateway/src/io/server.ts` that strips the inbound Session_Header, derives session state, routes the request, and calls the Decoy or Maze adapter.
- **`forwardToDecoy`**: The function in `gateway/src/io/decoy.ts` that uses Node's built-in `fetch`, applies the ten-second timeout, and returns the Decoy response as status, filtered headers, raw bytes, and decoded text.
- **Original function (F)**: The current `createHandler`/`forwardToDecoy` path, which supplies only the computed Session_Header to `fetch`.
- **Fixed function (F')**: The revised path, which forwards the allowed inbound-header projection and then supplies the computed Session_Header.

## Bug Details

### Bug Condition

Let `D` be the lowercase Excluded_Request_Headers set and let `H` be the Node-observed inbound header map after Requirement 1.2 removes the inbound Session_Header. Define the forwardable projection as:

`A(H) = {(lowercase(name), value) | (name, value) ∈ H ∧ value ≠ undefined ∧ lowercase(name) ∉ D}`

For array-valued entries, `value` denotes the ordered sequence of strings rather than an application-created comma-joined replacement.

The bug manifests because `server.ts` does not pass `H` to `forwardToDecoy`, and `decoy.ts` initializes the `fetch` headers with only `x-siren-session`. Therefore every member of `A(H)` is absent from the Decoy request.

**Formal Specification:**

```text
FUNCTION isBugCondition(input)
  INPUT: input of type GatewayRequestExecution
  OUTPUT: boolean

  allowedHeaders := projectAllowedHeaders(input.nodeInboundHeaders)

  RETURN input.route = "decoy"
         AND size(allowedHeaders) > 0
         AND EXISTS header IN allowedHeaders WHERE
               fetchRequestValue(input.originalResult, header.name)
               != header.value
END FUNCTION
```

The required behavior predicate is:

```text
FUNCTION expectedBehavior(input, result)
  INPUT: input of type GatewayRequestExecution
  INPUT: result of type ProxyExecutionResult
  OUTPUT: boolean

  allowedHeaders := projectAllowedHeaders(input.nodeInboundHeaders)

  RETURN result.decoyRequest.method = input.method
         AND result.decoyRequest.path = input.path
         AND result.decoyRequest.body = existingBodyPolicy(input.method, input.body)
         AND result.decoyRequest.allowedHeaders = allowedHeaders
         AND noClientSuppliedExcludedHeaderSurvives(result.decoyRequest)
         AND result.decoyRequest[SESSION_HEADER] = input.authoritativeSessionId
         AND result.clientResponse.status = result.decoyResponse.status
         AND result.clientResponse.forwardableHeaders = result.decoyResponse.forwardableHeaders
         AND result.clientResponse.bodyBytes = result.decoyResponse.bodyBytes
END FUNCTION
```

### Header Filtering Semantics

1. Filtering is case-insensitive. Each candidate name is compared as `name.toLowerCase()` even though Node normally lowercases `IncomingMessage.headers` keys.
2. Entries with `undefined` values are ignored; no string such as `"undefined"` is emitted.
3. A scalar string value is supplied to the Fetch `Headers` layer without application-level trimming, parsing, redaction, or rewriting.
4. A `string[]` value is handled as its ordered members. The implementation must not call `.toString()` or invent a join delimiter; it appends each member to a Fetch-compatible `Headers` representation in order.
5. “Unchanged” is measured at the Node-to-Fetch handoff: the Gateway supplies the scalar value or ordered array members it observed. Fetch may apply its standards-required header-value normalization and may combine repeated field values for wire serialization. The design therefore does not promise original wire casing, pre-Node whitespace, or duplicate-line layout and does not use `rawHeaders` as the source contract.
6. The entire fixed exclusion set is applied before constructing `RequestInit`. This avoids forwarding connection-specific metadata and allows Fetch to derive the target `host` and actual `content-length`.
7. `x-siren-session` is excluded at this boundary even though `server.ts` already deletes it. This defense in depth prevents a future caller from bypassing Requirement 1.2. After filtering, `SESSION_HEADER` is set exactly once to the Authoritative_Session_Id.
8. `authorization` and `cookie` are intentionally forwardable under the updated Requirement 2.2. The existing steering statement prohibiting their forwarding is stale and must be corrected as described under Fix Implementation.
9. Integration coverage verifies singular Node-observed values after real Node HTTP parsing and Fetch serialization. Isolated tests cover scalar, array, and `undefined` values at the Node-to-Fetch boundary.

### Examples

- A Decoy-routed POST with `user-agent: Browser/1.0` currently reaches the Decoy without `user-agent`; after the fix the Decoy observes `Browser/1.0`.
- A POST with `content-type: application/json` and `authorization: Bearer regression-token` currently loses both headers; after the fix both values arrive unchanged.
- A request with `cookie: mode=demo; theme=dark` must preserve that Node-observed value because `cookie` is not excluded.
- A request with `x-siren-session: deadbeefdeadbeef` must never forward that forged value; the Decoy must receive only the Gateway-computed 16-character session ID.
- A request with client-supplied `host`, `content-length`, `connection`, or another excluded header must not copy that value into `RequestInit`; Fetch supplies transport-appropriate values where applicable.
- A GET or HEAD request still sends no body, exactly as the current `forwardToDecoy` behavior requires.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**

- `server.ts` removes the inbound Session_Header before deriving signals or flattening header values.
- Session derivation continues to use the inbound `user-agent` value captured after forged-session removal.
- Pre-scoring flagged state continues to select Decoy versus Maze routing through `updateSession`.
- Request method, URL including query string, and body handling remain unchanged; GET and HEAD continue to omit a Fetch body.
- The ten-second `AbortController` timeout and Decoy failure mapping to an empty 502 response remain unchanged.
- Decoy response status and raw body bytes continue to reach the client unchanged.
- Existing response filtering remains unchanged: `content-encoding`, `content-length`, `transfer-encoding`, and `connection` are removed after Fetch decompression, while other Decoy response headers are returned.
- Burn accounting, the single telemetry emission point, history updates, prediction scheduling, and Maze behavior remain unchanged.

**Scope:**

All behavior outside the Decoy-bound request-header projection is unaffected. This includes:

- Maze-routed requests, which continue to use `MazeRequest` and do not call `forwardToDecoy`.
- Requests with no forwardable inbound headers.
- Decoy response proxying and error handling.
- Detector, scoring, session storage, WebSocket, and replay behavior.
- Node/Fetch-generated outbound transport headers, particularly `host` and `content-length`.

## Hypothesized Root Cause

The implementation inspection identifies the root cause rather than leaving it speculative:

1. **Missing interface data**: `forwardToDecoy(decoyUrl, method, path, body, sessionId)` has no inbound-header parameter.
   - `server.ts` holds the de-forged `req.headers` map but omits it from the call.
   - The stale interface shown in `.kiro/specs/siren-gateway/design.md` also omits headers, so the implementation matched an obsolete design contract.

2. **Session-only Fetch headers**: `decoy.ts` creates `const headers = { [SESSION_HEADER]: sessionId }`.
   - No projection or allow/deny decision exists.
   - Consequently, legitimate headers and credentials are all dropped.

3. **Stale lifecycle documentation**: The existing `siren-gateway/design.md` sequence does not exactly match current `server.ts` ordering and does not show the inbound-header snapshot flowing into `decoy.ts`.
   - Current code strips the session header, captures request metadata and derives the session, reads the body, calls `updateSession`, performs `/verify` capture, routes, emits, updates history/count, schedules prediction, and writes the response.
   - Documentation must show this current ordering rather than introducing unrelated lifecycle changes in the fix.

4. **Steering conflict**: `.kiro/steering/gateway.md` says the Decoy receives only `x-siren-session` and forbids forwarding real secrets.
   - That statement directly contradicts updated Requirement 2.2, which explicitly requires forwarding `authorization` and `cookie`.
   - Requirement 2.2 is authoritative for this bugfix. The steering rule must be revised in the implementation/documentation task, with the exclusion set serving as the new safety boundary.

## Correctness Properties

Property 1: Bug Condition - Allowed Headers and Authoritative Session Reach the Decoy

_For any_ Decoy-routed request where the bug condition holds, the fixed Gateway SHALL forward every defined inbound header value in the case-insensitive allowed projection, including `user-agent`, `content-type`, `authorization`, and `cookie`; SHALL omit every client-supplied header in Excluded_Request_Headers; and SHALL set the sole outbound Session_Header value to the Gateway-computed Session_Id rather than any forged inbound value.

**Validates: Requirements 2.1, 2.2, 2.3, 3.1**

Property 2: Preservation - Non-Header Proxy and Response Behavior

_For any_ request execution where the bug condition does not hold, and for all non-header behavior of executions where it does hold, the fixed Gateway SHALL produce the same routing, method/path/body forwarding (including the existing GET/HEAD body policy), timeout/error outcome, telemetry lifecycle, client response status, forwardable response headers, raw response body bytes, and Maze behavior as the original Gateway.

**Validates: Requirements 3.2, 3.3, 3.4, 3.5, 3.6, 3.7**

### Requirements Traceability

References in the two property validation lines above are to this bugfix's `bugfix.md`. Their relationship to the upstream `siren-gateway` requirements and design/test evidence is:

| Bugfix clauses | Upstream clauses | Design and validation evidence |
|---|---|---|
| 1.1, 1.2, 1.3 | 1.2, 2.2, 2.3 | Bug Condition, concrete Examples, confirmed root cause, and exploratory counterexamples |
| 2.1, 2.2 | 2.2 | Exact exclusion set, Node/Fetch handoff semantics, projection unit/property tests, and the blocking real proxy regression |
| 2.3, 3.1 | 1.2, 2.2, 2.3 | Defense-in-depth Session_Header exclusion, set-last authoritative ID, forged-session unit/property coverage, and integration assertion |
| 3.2 | 2.2 | `existingBodyPolicy`, preserved method/path/query/body assertions, and GET/HEAD coverage |
| 3.3 | 2.4 | Existing response-status/header/raw-byte assertions and response-filtering unit test |
| 3.4 | 2.2 and routing requirements | Unchanged `updateSession` route selection and existing Decoy/Maze routing tests |
| 3.5 | Telemetry and enrichment requirements | Unchanged single emission point, history/count, burn, prediction, WebSocket, and replay tests |
| 3.6 | Decoy failure requirement | Existing connection-error and timeout tests retain empty 502 and exactly-one-event assertions |
| 3.7 | Maze requirements | Maze branch receives no inbound-header argument and existing Maze success/failure tests remain unchanged |

Stale-artifact reconciliation is part of the implementation scope, not this design-only pass: `.kiro/specs/siren-gateway/design.md` must gain the inbound-header parameter, exact request exclusions, corrected lifecycle, and expanded proxy regression description; `.kiro/steering/gateway.md` must replace its contradictory session-only rule with Requirement 2.2's forwarding contract. `siren-gateway/tasks.md` is intentionally not modified by this phase.

## Fix Implementation

### Changes Required

Assuming the confirmed root-cause analysis remains accurate at implementation time:

**File**: `gateway/src/io/decoy.ts`

**Function**: `forwardToDecoy` and a small request-header projection helper

**Specific Changes**:

1. **Define the request exclusion boundary**: Add a case-insensitive `ReadonlySet<string>` containing exactly `connection`, `keep-alive`, `transfer-encoding`, `upgrade`, `proxy-authorization`, `te`, `trailer`, `host`, `content-length`, and `SESSION_HEADER.toLowerCase()`.
2. **Accept inbound headers**: Extend `forwardToDecoy` with an `http.IncomingHttpHeaders`-compatible input, reflected in its exported signature and comments.
3. **Build Fetch headers safely**: Copy defined allowed scalar values and append array members without application-level coercion; skip undefined and excluded entries.
4. **Set session identity last**: Set `SESSION_HEADER` to `sessionId` after projection so no caller-supplied value can win.
5. **Leave response logic untouched**: Do not change response byte collection, response-header filtering, timeout cleanup, or return shape.

Target interface:

```ts
export async function forwardToDecoy(
  decoyUrl: string,
  method: string,
  path: string,
  body: string,
  inboundHeaders: http.IncomingHttpHeaders,
  sessionId: string,
): Promise<DecoyResult>;
```

**File**: `gateway/src/io/server.ts`

**Function**: `createHandler`

**Specific Changes**:

1. Preserve the existing first operation that deletes `req.headers[SESSION_HEADER]`.
2. Pass the resulting inbound header map, or a shallow snapshot with copied array values, to `forwardToDecoy` only on the Decoy route.
3. Do not change `headerValues`, session derivation, `RequestMeta`, `updateSession`, route selection, Maze requests, response writes, or event lifecycle.

The relevant current-and-fixed lifecycle is:

```text
receive request
  -> delete inbound x-siren-session
  -> capture method, URL, path, source IP, user-agent, header values, and de-forged headers
  -> derive/get session
  -> read body
  -> update session and select route from pre-scoring flag
  -> capture /verify fields
  -> if decoy: project allowed headers, set computed session header, fetch Decoy
     else: call Maze adapter unchanged
  -> apply burn
  -> build and emit one event
  -> update history/count and optionally schedule prediction
  -> write existing outcome status/headers/body bytes
```

**File**: `gateway/src/io/decoy.test.ts`

**Specific Changes**:

1. Update existing calls for the new `forwardToDecoy` parameter.
2. Add focused unit coverage that captures `RequestInit.headers` and proves allowed scalar values are present unchanged.
3. Cover all excluded names case-insensitively, undefined values, array-valued inputs, and forged Session_Header replacement.
4. Retain the existing response-header filtering test without changing its assertions.

**File**: `gateway/src/io/server.proxy.test.ts`

**Test**: Existing transparent proxy integration test

**Specific Changes**:

1. Extend one real POST through `rawRequest` with distinct values for `user-agent`, `content-type`, `authorization`, `cookie`, and forged `x-siren-session`.
2. Assert the stub Decoy observes exact equality for the Node-observed `user-agent`, `content-type`, `authorization`, and `cookie` values.
3. Assert the observed `x-siren-session` equals `deriveSessionId(LOOPBACK, ua)` and differs from the forged value.
4. Keep the existing assertions for method, path/query, request body bytes, response status, response headers, response body bytes, and exactly one event. This makes the regression test simultaneously prove the fix and response preservation.

**File**: `.kiro/specs/siren-gateway/design.md`

**Documentation changes required when implementing the fix**:

1. Update the `forwardToDecoy` interface to include inbound headers and document the request exclusion set separately from response filtering.
2. Correct the request lifecycle to match `server.ts` and show the de-forged header snapshot flowing to `decoy.ts`.
3. Update the transparent-proxy integration-test description with request-header forwarding and forged-session replacement.

**File**: `.kiro/steering/gateway.md`

**Documentation conflict resolution required before or with implementation**:

Replace the stale “only `x-siren-session`” rule with guidance that Decoy-bound requests forward inbound headers according to Requirement 2.2's explicit exclusion set and replace inbound `x-siren-session` with the computed value. The new text must acknowledge that `authorization` and `cookie` are intentionally forwarded by this product requirement. Until that conflict is edited, implementers must treat Requirement 2.2 and this design as authoritative for this scoped bugfix.

## Testing Strategy

### Validation Approach

Validation uses two phases: first, demonstrate the missing-header counterexample on unfixed code; then verify the allowed projection and authoritative session after the fix while rerunning response-preservation coverage. Tests use the existing Vitest setup and real ephemeral Node HTTP servers for the serialization boundary.

### Exploratory Bug Condition Checking

**Goal**: Surface the known counterexample before implementation and ensure the observed failure is missing interface data rather than Fetch rejecting the required headers.

**Test Plan**: Extend or temporarily instrument the existing `server.proxy.test.ts` request with `user-agent`, `content-type`, and `authorization`, run it against unfixed code, and inspect the stub Decoy's `ReceivedRequest.headers`.

**Test Cases**:

1. **User-Agent Loss**: Send a unique browser user agent and observe that the Decoy does not receive it from the current proxy.
2. **Content-Type Loss**: Send `application/json; charset=utf-8` with a POST body and observe that the current proxy omits or replaces it.
3. **Authorization Loss**: Send `Bearer regression-token` and observe that the current proxy omits it.
4. **Forged Session Edge Case**: Send all three headers plus `x-siren-session: deadbeefdeadbeef`; verify current code already replaces the forged session while still losing the other three headers.

**Expected Counterexamples**:

- The stub Decoy's captured headers lack the inbound `user-agent`, `content-type`, and `authorization` values.
- The captured Session_Header contains the computed ID, confirming that session replacement is preservation-sensitive and not the source of the missing-header defect.

### Fix Checking

**Goal**: Verify that all inputs satisfying the bug condition produce the required allowed-header projection and authoritative Session_Header.

**Pseudocode:**

```text
FOR ALL input WHERE isBugCondition(input) DO
  result := gateway_fixed(input)
  ASSERT expectedBehavior(input, result)
END FOR
```

The blocking regression is the existing transparent proxy integration test updated to send, in the same POST:

```text
user-agent: <unique browser UA>
content-type: application/json; charset=utf-8
authorization: Bearer regression-token
cookie: mode=demo; theme=dark
x-siren-session: deadbeefdeadbeef
```

The stub Decoy must observe exact Node-parsed values for the first four and `deriveSessionId(LOOPBACK, ua)` for `x-siren-session`, never `deadbeefdeadbeef`. The same test retains its existing assertions for method, path/query, request body bytes, response status/headers/body bytes, route, session, and exactly one event.

### Preservation Checking

**Goal**: Verify that inputs outside the request-header bug condition and all non-header effects retain original behavior.

**Pseudocode:**

```text
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT observableNonHeaderBehavior(gateway_original(input))
         = observableNonHeaderBehavior(gateway_fixed(input))
END FOR
```

**Testing Approach**: Retain existing tests unchanged wherever possible and add assertions to the existing proxy integration flow instead of creating a parallel lifecycle. This minimizes the chance that the regression test stops exercising response bytes, telemetry, or routing.

**Test Cases**:

1. **Response Preservation**: Keep exact status, benign response headers, and non-UTF-8 response-byte assertions in `server.proxy.test.ts`.
2. **Response Header Filtering**: Keep `decoy.test.ts` assertions that remove decompression/framing headers and retain benign response headers.
3. **GET/HEAD Preservation**: Verify the updated call still omits Fetch bodies for GET and HEAD.
4. **Failure Preservation**: Run existing Decoy connection-error and timeout tests to preserve empty 502 behavior and exactly one event.
5. **Maze Isolation**: Run routing integration tests to prove Maze-bound requests never enter the new header-forwarding path.

### Unit Tests

- Test a pure or isolated request-header projection with each excluded name and mixed-case synthetic names.
- Test `string`, `string[]`, and `undefined` Node header values without accidental coercion.
- Test allowed `user-agent`, `content-type`, `authorization`, and `cookie` values in captured Fetch initialization.
- Test that a forged Session_Header is absent from the projected client headers and the computed value is set last.
- Retain response-header and timeout cleanup unit tests.

### Property-Based Tests

- Generate valid `http.IncomingHttpHeaders` maps and assert every defined non-excluded entry appears in the projection while every excluded entry does not.
- Generate casing variants of excluded names and assert filtering is case-insensitive.
- Generate valid forged session values and computed session IDs and assert the resulting Session_Header always equals the computed ID.
- Generate allowed scalar and array-valued headers and assert the Gateway introduces no trimming, redaction, `undefined` coercion, or custom joining before the Fetch boundary.
- Compare original and fixed non-header outcomes over generated method/path/body and Decoy response fixtures to support Property 2.

### Integration Tests

- Extend `gateway/src/io/server.proxy.test.ts` to prove `user-agent`, `content-type`, `authorization`, and `cookie` arrive with their Node-observed values while forged `x-siren-session` is replaced in the same real HTTP/Fetch round trip.
- Preserve the existing method/path/query/body, raw Decoy response, event count, route, status, and session assertions.
- Run existing `server.decoyFailure.test.ts` and routing tests to detect timeout/error or Maze regressions.
