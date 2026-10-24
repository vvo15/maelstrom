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
