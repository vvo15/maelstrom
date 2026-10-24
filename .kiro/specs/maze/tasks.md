# Maze (Labyrinth) — Tasks

- [x] 0. Commit stub `gateway/src/maze/index.ts` implementing the Maze interface
      so Brain can import immediately.
- [x] 1. `prices.json` filled from public pricing pages, dated.
- [x] 2. `sanitize.ts`: real-secret patterns + `sanitize()` + `containsRealSecret()`.
- [x] 3. `mock.ts`: deterministic seeded generator, 1-3 deeper links, ≤1 canary,
      allowed status set, DECOY_HEADERS.
- [x] 4. `burn.ts`: `estimateBurn` + `priceFor` substring match.
- [x] 5. `llm.ts`: Anthropic fetch wrapper with 8s timeout + `llmMode()`.
- [x] 6. `generateLlm.ts`: LLM page generation with validation + mock fallback.
- [x] 7. `predict.ts`: deterministic mock heuristic + LLM predict with fallback.
- [x] 8. `index.ts`: `SirenMaze` with per-(session, path) cache + default export.
- [x] 9. Property tests (`maze.properties.test.ts`) for determinism, canary-only,
      sanitize-never-leaks, status/headers, burn monotonic, 200-links-deeper,
      prediction shape. All passing in mock mode.
- [x] 10. `.kiro/steering/maze.md` (fileMatch for maze + attacker).
- [x] 11. `maze-property-tests` hook: run PBT on save under `gateway/src/maze/`.
- [x] 12. Attacker in `attacker/`: host-locked `http_request`, scripted mode,
      llm mode (vanilla pentester prompt), split-screen UI, Dockerfile.
- [x] 13. HTML-escape reflected request paths (reflected-XSS fix) + fuzzed
      XSS-safety property; adversarial sanitize-stability property; anti-escape
      link property.
- [x] 14. `attack.ts`: pure MITRE ATT&CK mapper with verified IDs, for the
      dashboard to import; property-tested (verified-IDs-only, deterministic,
      de-duplicated).

## Done when
- `SIREN_LLM=mock` serves an endless, consistent maze with no key. (verified)
- Every property test passes. (verified: 17/17)
- Both attacker modes run end to end (scripted standalone; llm falls back to
  scripted without a key). Full flag+maze+dashboard run depends on Brain's
  gateway at Integration 2.
