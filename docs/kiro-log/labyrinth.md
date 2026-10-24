# Kiro log — Labyrinth (Member 3)

## Maze module build
- Feature used: spec + steering + hook + PBT
- What I asked Kiro and why: implement the `Maze` interface from the frozen
  `shared/contracts.ts` as `gateway/src/maze/` — deterministic mock generator,
  LLM mode with 8s timeout + fallback, burn estimate, prediction, and a
  per-(session,path) cache so revisits are byte-identical. Grounded every file
  in the actual contracts before writing, so it integrates with Brain's gateway
  import (`import maze from "./maze"`) with no contract changes.
- What it got right: pure, testable split (sanitize/mock/burn/predict), mock as
  the default so it runs with no API key.
- What I corrected: fast-check v4 dropped `hexaString`; switched the session-id
  arbitrary to `fc.string({ unit: fc.constantFrom(...hex) })`.
- Verified: 9/9 property tests pass in mock mode; a 12-level crawl stays
  endless, byte-identical on revisit, and emits only SIREN_ canaries.

## Property-based testing (showcase)
- Properties mapped to maze requirements: determinism, every SIREN_ string is a
  real canary, sanitize never leaks a real-secret pattern (for any input),
  status/headers always valid, burn non-negative and monotonic, every 200 page
  links deeper, prediction path starts with "/".
- What PBT caught: forced the sanitizer to use a fresh regex per call (the
  shared `/g` lastIndex would otherwise skip matches across inputs).

## Attacker agent
- Feature used: Kiro CLI (iterate in terminal)
- Single `http_request` tool host-locked to the gateway origin (verified it
  blocks other hosts, scheme changes, and file://). Scripted mode is a seeded,
  repeatable sequence; llm mode uses a vanilla pentester system prompt that
  never mentions /verify, canaries, or bait, so taking the bait is a real
  result. Falls back to scripted with no API key.

## TODO / handoff
- Fill prices.json against live pricing pages and note the exact date (currently
  dated 2026-10-24 from public pages; re-verify before submission).
- Integration 2 with Brain: run scripted attacker through the gateway, confirm
  flag within 6 requests, maze entry, and burn/prediction on the dashboard.
- Stretch: point Kiro Crew at the decoy and try to catch it.

## Hardening pass (post-integration prep)
- Feature used: PBT (adversarial) + steering
- Found and fixed a reflected-XSS hole: the maze reflected the attacker-chosen
  request path into HTML unescaped. For a defensive security tool whose pages
  the dashboard renders, that's exactly the kind of flaw a judge would catch in
  a security review. Added `escapeHtml()` in sanitize.ts and escaped every
  reflection (path, links, error-page hint). Proved it with a fuzzed XSS-safety
  property feeding `<script>`, `"><img onerror=...>`, `</title><svg onload=...>`
  payloads — the reflected region never contains a raw breakout character.
- Strengthened two more properties: sanitize stability under adversarial
  concatenation of real-secret shapes, and an anti-escape property that no
  200-page link is ever shallower than or equal to the request (a flagged
  session literally cannot climb out of the maze).
- Added `attack.ts`: a pure, verified MITRE ATT&CK mapper
  (T1595 / T1595.003 / T1552.001 / T1078 / T1190), IDs verified on
  attack.mitre.org, for the dashboard to import so ATT&CK chips are grounded in
  real IDs with rationale, not hand-rolled guesses. Property-tested:
  verified-IDs-only, deterministic, de-duplicated.
- Property count went 9 -> 17, all passing in mock mode. Attacker still
  type-checks clean. Full crawl still endless + byte-consistent.
