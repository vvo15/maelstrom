# Kiro Log — Bait

## Session 1 — Kickoff & full build

- **Feature used:** steering, hooks, spec (via Kiro chat/Auto), custom Power
- **What I asked Kiro and why:**
  - Asked Kiro to scaffold the full decoy portal (PHP 8.3 + Apache), docker-compose,
    all placeholder services, the safety-lint hook, and the custom `siren` Power.
  - Used steering so Kiro loaded `decoy.md` only when touching `decoy/` files —
    kept context small and rules focused.
  - Used a PostFileSave hook (`bait-safety-lint`) rather than an agent hook so it
    runs in milliseconds with zero LLM calls.
- **What it got right:**
  - Generated all PHP pages with correct canary format matching `canaryFor()` in
    `shared/contracts.ts` without being told explicitly.
  - Produced the safety-lint script and caught the macOS `grep -P` incompatibility,
    then rewrote to `-E` POSIX regex that works on both macOS and Linux (Docker).
  - Structured the custom Power with steering + hook + integration guide.
- **What I corrected:**
  - Lint script needed rewrite from `grep -P` to `grep -E` for macOS compatibility.
  - Added `set -uo pipefail` (not `set -e`) so the loop doesn't exit early on
    grep finding no matches.
- **Compared to vibe coding:** Significantly faster for boilerplate-heavy PHP pages
  and Docker config. The steering scoping feature saved real time — without it,
  every request would have needed the full contract pasted in.
- **Screenshot:** *(add img/bait-session1-lint-pass.png)*

---
<!-- Add entries hourly during the hackathon -->

## Session 2 — Spec, Power layout, verification

- **Feature used:** spec, Power (Agent Plugins / POWER.md format)
- **What I asked Kiro and why:**
  - Wrote the decoy spec (`requirements.md` in EARS form, `tasks.md`) so the decoy
    build is documented and traceable to 20 numbered requirements.
  - Checked kiro.dev/powers docs + two reference Power repos (Unleash, praveenc) to
    follow the documented Power layout exactly — `POWER.md` with YAML front-matter at
    the package root, plus `steering/`, `hooks/`, `examples/`.
- **What it got right:**
  - Matched the legacy POWER.md front-matter schema (name, displayName, description,
    author, keywords) from the real Unleash example.
  - Canary format in every PHP page exactly matches `canaryFor()` in the frozen contract.
- **What I corrected:**
  - `gateway/tsconfig.json`: removed `baseUrl` (removed in TS 7) and fixed `rootDir`
    conflict so `tsc --noEmit` passes with the `../shared` include. This unblocks
    Brain's contract-guard hook.
  - Renamed bundled hook to `.kiro.hook` convention.
- **Verification done (no Docker/PHP locally):**
  - Negative-tested the lint: it catches `system()` and an `AKIA...` secret, exits 1,
    then passes clean after removal.
  - `gateway/tsc --noEmit` passes — maze stub conforms to the Maze interface.
  - `git check-ignore -v .kiro` prints nothing (rule compliance confirmed).
- **Compared to vibe coding:** The spec made the 20 bait requirements explicit instead
  of implicit, which caught two I'd otherwise have missed (REQ-D-11 HTML comment,
  REQ-D-15 session fallback).
- **Screenshot:** *(add img/bait-session2-lint-negative-test.png)*
