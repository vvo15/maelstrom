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
