# Siren Dashboard — Progress Log

Living documentation for the Stage lane (the dashboard, hosted demo, and submission
materials). This file is updated at the end of every work session so anyone can see,
step by step, what has been built and what comes next.

> **How to use this doc:** The [Session Log](#session-log) is append-only — add a new
> dated entry each session, newest at the top, and never rewrite old entries. The
> sections above it (status, architecture, decisions) describe the *current* state and
> should be edited in place to stay accurate.

---

## Current status at a glance

| Item | State |
| --- | --- |
| Dashboard app (`/dashboard`) | ✅ Built and building clean (`tsc -b` + `vite build`) |
| Prompt A — dashboard spec | ✅ Done |
| Prompt B — `.kiro/steering/dashboard.md` | ✅ Already existed; app follows it |
| Mock / Live / Replay sources | ✅ All three working, switchable in the UI |
| Town IT (plain-language) view | ✅ Done |
| MITRE ATT&CK mapping | ✅ Done, IDs verified on attack.mitre.org 2026-10-24 |
| Accessibility (contrast, keyboard, aria-live) | ✅ Checked in headless Chrome, both color schemes |
| GitHub Pages base path | ✅ Configurable via `BASE_PATH` |
| Committed + PR | ✅ Branch `stage/dashboard`, PR #2 |
| Figma design tokens | ⬜ Not done — `theme.css` values are hand-picked placeholders |
| Prompt C — hosted demo + Pages workflow | ⬜ Not started (next up) |
| Prompt D — docs-sync hook | ⬜ Not started |
| README / KIRO.md / demo script | ⬜ Not started |

**Next step:** Prompt C — add `.github/workflows/pages.yml`, curate real replays into
`public/replays/`, and ship the hosted demo. (Needs the OK to write outside `/dashboard`
for the workflow file.)

---

## What the dashboard does

Siren watches an AI attacker get detected and trapped in a fake town-services portal.
The dashboard is a **read-only consumer** of `SirenEvent` (imported as a type only); it
never adds fields to the schema and derives everything it shows.

### Data sources (switchable in the UI)
1. **Mock** — a built-in emitter producing realistic events for two sessions: an ordinary
   resident and a scripted AI attacker that gets flagged on its 5th request, enters the
   maze, and gets a new prediction every 5 requests.
2. **Live** — a WebSocket feed at `ws://localhost:8090` (override with `VITE_LIVE_WS_URL`).
3. **Replay** — plays a `.jsonl` recording from `public/replays/` (listed in
   `public/replays/index.json`) or a file dropped anywhere on the page, at 1x / 2x / 4x.

On load it tries **Live first**; if nothing connects within 2 seconds it falls back to the
first bundled replay. The hosted build works with **no backend at all**.

### Layout
- **Top bar:** time to detect, dollars the attacker burned, and "real resident data touched: 0".
- **Session list:** AI score, flagged badge, and model claim.
- **Request timeline:** per-selected-session, newest first (method, path, status, route decoy/maze).
- **Detection signals checklist:** lights up as each signal first appears.
- **Flag alert:** shows the model claim and stated goal.
- **Attacker mind panel:** the latest prediction (likely goal, current step, predicted next path).
- **MITRE ATT&CK chips:** derived from signals and paths via a mapping table in the app.
- **Town IT view toggle:** rewrites the whole UI in plain language.

### Accessibility
WCAG AA contrast (verified in light and dark), full keyboard navigation, `aria-live`
assertive on the flag alert and polite on the timeline, `prefers-reduced-motion` respected,
and status is never conveyed by color alone (always text + icon).

---

## File map (`dashboard/src`)

| Path | Responsibility |
| --- | --- |
| `App.tsx` | Top-level layout, Town IT toggle, drag-and-drop file handling |
| `useFeed.ts` | Source selection, dedupe sink, batching, live/replay/mock wiring |
| `model.ts` | `SessionView` and derived types; re-exports `SirenEvent` (type only) |
| `sessions.ts` | Reducer that folds events into per-session views + totals |
| `attack.ts` | MITRE ATT&CK mapping table and the rules that trigger each technique |
| `copy.ts` | All UI strings for both technical and plain-language views |
| `format.ts` | Duration, USD, clock/offset, and HTTP-status formatting |
| `theme.css` | Design tokens (colors, type, spacing) — **placeholder, pending Figma** |
| `index.css` / `App.css` | Global resets and component styles (no hard-coded colors) |
| `sources/mock.ts` | Deterministic two-session mock data |
| `sources/live.ts` | WebSocket client with auto-reconnect |
| `sources/player.ts` | Timeline player (gap-based pacing, speed, pause/restart) |
| `sources/replays.ts` | Loads the replay index and recording files |
| `sources/validate.ts` | Runtime `SirenEvent` validation + `.jsonl` parsing |
| `components/*` | TopBar, SessionList, Timeline, SignalChecklist, FlagAlert, AttackerMind, AttackChips, Icon, SourceControls |
| `scripts/make-sample-replay.ts` | Generates the bundled sample replay from mock data |

---

## MITRE ATT&CK mapping

All IDs and names were confirmed on attack.mitre.org on **2026-10-24**.

| ID | Technique | Triggered by |
| --- | --- | --- |
| T1595.003 | Active Scanning: Wordlist Scanning | `enumeration` signal |
| T1552.001 | Unsecured Credentials: Credentials In Files | `.env`, README, `/backup/`, config files served with status < 400 |
| T1078 | Valid Accounts | `canary_reused` signal |
| T1190 | Exploit Public-Facing Application | injection/traversal patterns on maze requests |
| T1594 | Search Victim-Owned Websites | `robots.txt` and `sitemap.xml` |

Not mapped (no clean technique): `bait_followed`, `think_pauses`, `scripted_ua`.

---

## Build, run, and verify

```bash
cd dashboard
npm install
npm run dev                 # local dev server
npm run build               # tsc -b && vite build
npm run replay:sample       # regenerate public/replays/sample-attack.jsonl from mock data
BASE_PATH=/siren-Hackachusetts-/ npm run build   # build for GitHub Pages sub-path
```

Environment overrides:
- `VITE_LIVE_WS_URL` — live WebSocket URL (default `ws://localhost:8090`)
- `VITE_REPO_URL` — repo link used in the replay banner
- `BASE_PATH` — base path for hosting under a sub-path

---

## Open decisions & known gaps

- **`theme.css` is not from Figma yet.** Values are hand-picked; names match the intended
  token set so swapping in Figma values is a values-only change.
- **Bundled replay is synthetic.** `public/replays/sample-attack.jsonl` comes from mock
  data. Replace with a real gateway recording when Brain provides one.
- **WebSocket message shape assumed.** We assume one `SirenEvent` per message (arrays also
  handled). Confirm with Brain.
- **Docker build caveat.** The build imports `../../shared/events.ts`, but the dashboard
  Dockerfile only copies `dashboard/`, so a containerized *build* would fail on that type
  import. Dev server is unaffected.
- **Lint warnings.** `oxlint` reports two `set-state-in-effect` warnings in `useFeed.ts`
  (from resetting playback state when a source starts); left as-is.
- **Branch note.** `stage/dashboard` was branched off `member-4`. If `member-4` isn't yet
  merged/identical to `main`, PR #2's diff includes those changes too.

---

## Session Log

Newest entries first. Append a new entry at the end of each work session.

### 2026-10-24 — Session 1: Build the dashboard, commit, open PR

**Goal:** Implement Prompt A (the dashboard spec) and save progress to the repo.

**Done:**
1. Read the steering files and the shared `SirenEvent` / contracts; confirmed the type-only
   import rule and the dashboard steering constraints.
2. Built the full app in `/dashboard`: three data sources (mock, live, replay), live-first
   startup with a 2s replay fallback, and the complete layout (top bar, session list,
   timeline, signal checklist, flag alert, attacker-mind panel, ATT&CK chips).
3. Added the Town IT plain-language view and a full second copy set in `copy.ts`.
4. Built the MITRE ATT&CK mapping in `attack.ts` and **verified all five technique IDs on
   attack.mitre.org** (noted T1078's tactic list now includes "Stealth").
5. Implemented accessibility: hand-computed WCAG AA contrast for every token pair in both
   color schemes (0 failures), keyboard nav, `aria-live` assertive/polite, reduced-motion,
   and text+icon status (never color alone).
6. Made the base path configurable via `BASE_PATH` for GitHub Pages.
7. Generated a bundled sample replay from the mock data (`npm run replay:sample`).
8. Verified: `tsc -b` + `vite build` pass; a `BASE_PATH` build rewrites asset paths; drove
   the build in headless Chrome against a fake gateway (live connect, duplicate-frame
   dedupe, flag alert, signals, attacker-mind, Town IT view, tab order, mobile width, both
   schemes).
9. Committed the dashboard on new branch `stage/dashboard` and opened **PR #2** against
   `main`. Left the two root `.md` files (outside `/dashboard`) untouched.

**Next session:** Prompt C — hosted demo. Add `.github/workflows/pages.yml`, curate real
replays into `public/replays/`, and confirm the hosted build runs with no backend. Decide
whether to do the Figma token pass first.

<!-- Template for the next entry:

### YYYY-MM-DD — Session N: <short title>

**Goal:** ...

**Done:**
1. ...

**Next session:** ...
-->
