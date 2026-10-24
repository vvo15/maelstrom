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

## Session 3: Build fixes and first real end-to-end run

- **Feature used:** IDE chat (Autopilot), steering (decoy.md loaded for decoy/ edits)
- **What I asked Kiro and why:** Asked it to review its own "done" skeleton before teammates
  pulled it. The review found five bugs that would have broken `docker compose up`.
- **What it caught:**
  - Dashboard/attacker Dockerfiles ran `npm ci` with no lockfile. That would fail on the first build.
  - Gateway build context was `./gateway`, so `shared/` never reached the image. It would have
    broken as soon as Brain imported the contract.
  - `Header always set Server` doesn't work in Apache (the core writes `Server` for
    non-proxied responses), and `always set X-Powered-By` would have sent a duplicate next to PHP's.
    Fix: pin `php:8.3.12-apache`. Kiro checked inside the image that it ships Apache 2.4.62
    and PHP 8.3.12, which matches DECOY_HEADERS exactly. Then `expose_php=Off` plus one
    `header()` call in the router.
  - Attacker shared a network with the dashboard. Now it has its own `attack` network,
    and the decoy network is `internal: true` (no egress).
  - Host `node_modules` (macOS binaries) would have been copied into Linux images. Fixed with
    a root `.dockerignore`.
- **Verified live in Docker, with no .env (the judge path):** all 4 images build. `/.env` shows
  `SIREN_DBPASS_abcdef0123`. Exactly one `Server` and one `X-Powered-By` header. All 13
  routes return the expected status through `localhost:8080`. A spoofed `x-siren-session`
  is replaced. The attacker can reach the gateway but not the decoy or dashboard. The decoy
  has no internet access.
- **Compared to vibe coding:** The first pass looked done but had never been run. Asking for
  a review and then a live verification found real integration bugs before Integration 1,
  not during it.
- **Screenshot:** *(add img/bait-session3-compose-verified.png)*
