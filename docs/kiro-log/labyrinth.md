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
- Verified: 9/9 initial property tests passed in mock mode; a 12-level crawl
  stayed endless, byte-identical on revisit, and emitted only SIREN_ canaries.

## Property-based testing (showcase)
- Properties mapped to maze requirements: determinism, every SIREN_ string is a
  real canary, sanitize never leaks a real-secret pattern (for any input),
  status/headers always valid, burn non-negative and monotonic, every 200 page
  links deeper, prediction path starts with "/".
- What PBT caught: forced the sanitizer to use a fresh regex per call (the
  shared `/g` lastIndex would otherwise skip matches across inputs).

## Attacker agent
- Feature used: Kiro CLI (iterate in terminal)
- Single `http_request` tool host-locked to exactly `http://gateway:8080`.
  Absolute URLs, scheme-relative paths, backslashes, control characters,
  off-origin targets, and redirects are rejected before they can leave the
  sandbox. Scripted mode is seeded and repeatable; LLM mode uses a vanilla
  pentester prompt that never mentions `/verify`, canaries, or bait. It falls
  back to scripted mode with no API key.

## Pricing verification and remaining team handoff
- Rechecked the active Claude pricing rows on 2026-10-24 against Anthropic's
  official [Haiku](https://www.anthropic.com/claude/haiku),
  [Sonnet](https://www.anthropic.com/claude/sonnet),
  [Opus](https://www.anthropic.com/claude/opus), and
  [Fable](https://www.anthropic.com/claude/fable) pages. The primary values in
  `prices.json` match those published list prices. The
  [OpenAI pricing page](https://openai.com/api/pricing/) was also checked;
  legacy GPT rows remain explicitly approximate because they are used only for
  self-reported model claims. Content was rephrased for compliance with
  licensing restrictions.
- Integration 2 still requires a Docker-capable owner to run the scripted
  attacker through the full stack and confirm maze entry plus dashboard burn
  and prediction. Docker was unavailable during the final local audit.
- Stretch evidence, not a release requirement: point Kiro Crew at the decoy and
  record whether it follows the bait.

## Hardening pass (post-integration prep)
- Feature used: PBT (adversarial) + steering
- Found and fixed a reflected-XSS hole: the maze reflected the attacker-chosen
  request path into HTML unescaped. Added `escapeHtml()` in sanitize.ts and
  escaped every reflection (path, links, error-page hint). Proved it with a
  fuzzed XSS-safety property feeding `<script>`, `"><img onerror=...>`,
  `</title><svg onload=...>` payloads — the reflected region never contains a
  raw breakout character.
- Strengthened sanitizer stability and anti-escape properties. Added a pure,
  verified MITRE ATT&CK mapper for T1595, T1595.003, T1552.001, T1078, and
  T1190, with deterministic and de-duplicated output.
- The final audit hardened cache determinism for concurrent first requests,
  froze cached responses, normalized dotted/hyphenated model IDs for pricing,
  and corrected every property heading and EARS mapping.
