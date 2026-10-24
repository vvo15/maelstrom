# Maze (Labyrinth) — Requirements

The maze is the endless fake system that traps flagged attackers. It implements
the `Maze` interface from `shared/contracts.ts`. It must run with no API key so
judges can run it.

## Requirement 1: Interface conformance
THE System SHALL implement the `Maze` interface from `shared/contracts.ts`:
`generate(req)`, `estimateBurn(body, modelClaim?)`, and `predict(history)`.

## Requirement 2: Determinism (state-driven)
THE System SHALL return byte-identical content (status, headers, body) for
identical `(session_id, path)` pairs, regardless of request history or body.
WHEN simultaneous first requests use an identical `(session_id, path)`, THE
System SHALL share one in-flight generation. THE System SHALL make cached
responses and their headers immutable to callers.

## Requirement 3: No-key operation (unwanted behavior / safety)
IF no `ANTHROPIC_API_KEY` is configured, OR `SIREN_LLM` is not `anthropic`,
THEN THE System SHALL serve deterministic mock pages and SHALL NOT make any
outbound request.

## Requirement 4: Bounded LLM latency (event-driven)
WHEN `SIREN_LLM=anthropic`, THE System SHALL call the configured model for a
page, AND IF the call errors or exceeds 8 seconds, THEN THE System SHALL fall
back to the deterministic mock page for that `(session_id, path)`.

## Requirement 5: Fake-only credentials (unwanted behavior)
THE System SHALL emit at most one credential per page, and every emitted
credential SHALL equal `canaryFor(session_id, kind)` for some kind.

## Requirement 6: Secret sanitization (unwanted behavior / safety)
THE System SHALL pass every response body through `sanitize()`, which replaces
any real-secret-format substring (AWS, `sk-ant-`, `sk-`, `gh*_`, Google API
keys, Slack tokens, PEM private-key headers) with a SIREN_ canary, so no
real-secret-format value ever leaves the maze.

## Requirement 7: No working exploits (unwanted behavior / safety)
THE System SHALL NOT generate working exploit code, malware, or steps that
function on real systems, even if the request body asks for them.

## Requirement 8: Endless, deeper links (state-driven)
WHILE serving a 200 page, THE System SHALL include at least one link to a path
strictly deeper than the requested path, and all links SHALL stay within the
maze (under the requested path), so a flagged session cannot leave by following
links.

## Requirement 9: Response shape
THE System SHALL return a status in {200, 301, 302, 401, 403, 404, 500} and
headers that always include `DECOY_HEADERS` from `shared/contracts.ts`.

## Requirement 10: Burn estimate (monotonic)
THE System SHALL estimate burn as `tokens = ceil(body.length / 4) + 1500` and
`usd = tokens * input_price + 300 * output_price`, matching `modelClaim` to a
price row by normalized substring (else `default`). Dotted and hyphenated model
versions SHALL match the same price row. Burn SHALL be non-negative and SHALL
NOT decrease as the body grows. Figures are labeled estimates.

## Requirement 11: Prediction
THE System SHALL derive a prediction (`likely_goal`, `current_step`,
`predicted_next_path`) from the session's last 15 events. In mock mode this is
a deterministic heuristic; in anthropic mode a single short LLM call with the
heuristic as fallback. `predicted_next_path` SHALL begin with `/`.

## Requirement 12: Safe HTML reflection
WHEN attacker-controlled path text appears in an HTML body or link attribute,
THE System SHALL HTML-escape the text so no raw markup-breaking character can
escape its intended text or attribute context.

## Requirement 13: ATT&CK mapping integrity
WHEN signals or paths map to MITRE ATT&CK techniques, THE System SHALL return a
deterministic, de-duplicated list containing only the verified IDs `T1595`,
`T1595.003`, `T1552.001`, `T1078`, and `T1190`, with an official ATT&CK URL and
non-empty rationale for every result.

## Correctness property mapping

| Property suite | Requirement | Property evidence |
| --- | --- | --- |
| Deterministic generation and immutable shared cache | R2 | `maze.properties.test.ts` determinism suite |
| At most one valid SIREN_ canary | R5 | canary suite |
| Sanitizer never emits a real-secret shape | R6 | sanitizer suite |
| Reflected path text cannot break HTML context | R12 | XSS-safe suite |
| Allowed status and decoy headers | R9 | response-shape suite |
| Non-negative, monotonic burn and normalized model IDs | R10 | burn suite |
| Every successful page links only deeper | R8 | anti-escape suite |
| Deterministic, path-shaped mock prediction | R11 | prediction suite |
| Verified, deterministic, de-duplicated ATT&CK IDs | R13 | ATT&CK suite |
