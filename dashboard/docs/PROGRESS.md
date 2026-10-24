# Siren Dashboard — Progress Log

Living documentation for the Stage lane (the dashboard, hosted demo, and submission
materials). This file is updated at the end of every work session so anyone can see,
step by step, what has been built and what comes next.

> **How to use this doc:** The [Session Log](#session-log) is append-only — add a new
> dated entry each session, newest at the top, and never rewrite old entries. The
> sections above it (status, architecture, decisions) describe the *current* state and
> should be edited in place to stay accurate.
>
> **Related:** the Kiro-feature write-up for this lane lives in `docs/kiro-log/stage.md`
> (feeds `KIRO.md`). This file is the technical/engineering log; that one is the
> Kiro-usage log.

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
| Prompt C — hosted demo + Pages workflow | 🟨 Workflow, curation script and banner done; live once PR #2 merges and Pages is enabled |
| Real gateway replays | ⬜ None recorded yet; only the synthetic sample is bundled |
| Integration 1 (live WS vs. real gateway) | ✅ Passed 2026-10-24 against `origin/main` @ `035de66` |
| Prompt D — docs-sync hook | ⬜ Not started |
| README / KIRO.md / demo script | ⬜ Not started |

**Next step:** a repo admin sets Settings → Pages → Source to "GitHub Actions", then merge
PR #2. Once Brain/Labyrinth produce a real run, curate it with `npm run replays:curate`.
Then have Kiro Crew walk the hosted URL like a first-time judge.

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
| `scripts/curate-replays.ts` | Copies a gateway recording into `public/replays/` (valid lines only) and rebuilds the index |
| `scripts/replay-index.ts` | Shared `index.json` rebuild: keeps titles/order, features new files first, fails on empty replays |
| `../.github/workflows/pages.yml` | Builds with the Pages base path and deploys on every push to `main` |

---

## How it works (detailed)

### Data flow
```
source (mock | live | replay)
  → SirenEvent objects
    → dedupe sink in useFeed.ts (drops repeats, batches ~50ms)
      → sessionsReducer folds each event into a SessionView
        → App derives the selected session + totals
          → panels render (technical or plain copy)
```

### The event pipeline
- **`useFeed.ts`** owns source selection and lifecycle. It wires up exactly one active
  source at a time, and on any source change it dispatches a `reset` so the view starts
  clean. Its **dedupe sink** keys events on `session_id|ts|method|path` — this matters
  because the live gateway resends its last 500 events to every new client on connect, so
  without dedupe a reconnect would double every row. Events are flushed to the reducer in
  ~50ms batches to avoid a render per event.
- **Startup policy:** on first load it tries Live, and only the *first* attempt is allowed
  to auto-fall-back to the first bundled replay after a 2s timeout. Once the user manually
  picks a source, auto-fallback is disabled so we never yank them off their choice.
- **`sessions.ts`** is a pure reducer. For each event it updates the running `SessionView`:
  request count, score, flagged state (sticky — once flagged, stays flagged), first/last
  timestamps, the model claim/goal, the ordered list of signals with the request number
  each first appeared, running USD/token burn (taken as a max so it never ticks backward),
  the latest prediction, and the accumulated ATT&CK technique hits. It caps stored events
  per session and total sessions to stay bounded on long live runs. `computeTotals` derives
  the top-bar numbers (newest flagged session's time-to-detect, summed USD, flagged count).

### Sources
- **`sources/mock.ts`** — deterministic for a given base timestamp (seeded PRNG for response
  sizes). Two sessions: a resident browsing permits/311 (never flagged) and a scripted AI
  attacker (`python-httpx` UA) that trips `scripted_ua`, follows the `/verify` bait on
  request 5 to get flagged, is then served by the maze, reuses the planted admin canary, and
  emits a fresh prediction roughly every 5 requests. Scoring mirrors the playbook's detector
  weights only so the mock reads consistently — the real detector lives in the gateway.
- **`sources/live.ts`** — WebSocket client with auto-reconnect (3s), tolerant of a single
  object or an array per frame, and defensive against malformed frames (ignores them, keeps
  the stream alive). Guards against `new WebSocket` throwing (e.g. mixed-content on https).
- **`sources/player.ts`** — plays an event list in timestamp order, spacing rows by their
  original gaps divided by the speed (1x/2x/4x), with long idle gaps clamped so a recording
  never visibly stalls. Supports pause/resume/restart and reports progress.
- **`sources/replays.ts`** — loads `public/replays/index.json` (array or `{replays:[]}`,
  items may be strings or `{file,title}`), restricts to plain `*.jsonl` filenames, and
  fetches recordings relative to the configured base path. Returns `[]`/`undefined` on any
  problem so the app falls back instead of erroring.
- **`sources/validate.ts`** — runtime `SirenEvent` type guard (used for live frames and
  dropped files) plus a `.jsonl` parser that counts bad lines instead of throwing.

### UI and accessibility specifics
- **`copy.ts`** holds two complete copy sets keyed by view mode (`technical`, `plain`). The
  Town IT toggle swaps the whole set, including a plain-English `describe()` for each request
  and plain outcome/route labels. Mode is remembered in `localStorage`.
- **Flag alert** uses `aria-live="assertive"` and stays mounted so the announcement fires the
  moment a session flips to flagged. **Timeline** list uses `aria-live="polite"` with
  `aria-relevant="additions"`.
- **No color-only status:** every status/route pill and every signal/badge pairs a shape icon
  (`Icon.tsx`) with text. Selected session also shows a text/arrow marker, not just a tint.
- **`theme.css`** is the single source of color/type/spacing tokens, with a dark-scheme block.
  No component hard-codes a color (verified by grep — only the unused Vite template SVGs match).

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
npm run replays:curate -- ../replays/<startMs>.jsonl --name crew-flagged --title "Kiro Crew follows the bait"
npm run replays:index       # make index.json match the .jsonl files on disk
BASE_PATH=/siren-Hackachusetts-/ npm run build   # build for GitHub Pages sub-path
```

### Curating replays
The gateway writes one recording per run to `replays/<startMs>.jsonl` at the repo root
(git-ignored). `replays:curate` copies one into `public/replays/`, keeps only valid
`SirenEvent` lines (bad lines are reported and dropped), sorts by `ts`, and rebuilds
`index.json`. The curated file goes first in the index, so it becomes the replay the hosted
demo falls back to. Existing titles and order are kept. A file without `--title` gets an
auto title such as "Recorded run (Oct 24): auditor-llm-large flagged after 5 requests".
`replay:sample` no longer overwrites curated entries.

### Hosted demo (GitHub Pages)
`.github/workflows/pages.yml` runs on every push to `main` (and by hand via
`workflow_dispatch`). It runs `npm ci`, then `replays:index` (which fails the build if a
bundled replay has no valid events), then `npm run build` with `BASE_PATH` from
`actions/configure-pages` and `VITE_REPO_URL` set to the repo's own URL. It deploys
`dashboard/dist` with `actions/deploy-pages`. **One-time setup:** a repo admin must set
Settings → Pages → Source to "GitHub Actions".

Environment overrides:
- `VITE_LIVE_WS_URL` — live WebSocket URL (default `ws://localhost:8090`)
- `VITE_REPO_URL` — repo link used in the replay banner
- `BASE_PATH` — base path for hosting under a sub-path

---

## Verification done so far (2026-10-24)

What was actually run, and the result — so we don't re-litigate "does it work".

| Check | How | Result |
| --- | --- | --- |
| Type check | `tsc -b` | Passes |
| Production build | `vite build` | Passes (~258 kB JS / ~82 kB gzip) |
| Pages sub-path build | `BASE_PATH=/siren-Hackachusetts-/ vite build` | Asset + favicon paths rewritten to the sub-path |
| Lint | `oxlint` | 2 `set-state-in-effect` warnings in `useFeed.ts`, no errors |
| WCAG AA contrast | Node script over every `theme.css` token pair, light + dark | 0 failures (text ≥ 4.5:1, UI/borders/focus ≥ 3:1) |
| No hard-coded colors | grep across `src` | None outside `theme.css` (only Vite template SVGs match) |
| Live connect + dedupe | Headless Chrome vs. a throwaway WS gateway that resends frames | Connects; duplicates dropped (25 attacker rows, not 30) |
| Replay fallback | Headless Chrome with no gateway | Falls back to bundled replay after 2s; shows notice + banner |
| Flag alert | Headless Chrome, attacker session | Shows `auditor-llm-large` / "assess town portal"; time-to-detect 3.7s at request 5; $0.28 burned |
| Signals + attacker mind | Headless Chrome | All five signals light up; prediction panel fills in |
| Town IT view | Headless Chrome, toggle on | Alert/timeline/signals/chips all rewritten to plain language |
| Keyboard order | Headless Chrome, simulated Tab | Skip link → toggle → source radios → sessions → timeline → chips |
| Mobile width | Headless Chrome at 390px | No horizontal overflow |
| Both color schemes | Headless Chrome emulated media | Render correctly in light and dark |

Session 3 additions:

| Check | How | Result |
| --- | --- | --- |
| Curation script | Curated a fake gateway file with 2 bad lines; re-ran with `--name`/`--title`; ran `replay:sample` after; tried an empty file | Bad lines dropped, curated file first, titles kept, sample didn't clobber index, empty file rejected |
| CI-style build | `BASE_PATH=/siren-Hackachusetts-` (no trailing slash, as `configure-pages` outputs it) | Asset paths rewritten to `/siren-Hackachusetts-/` |
| Hosted, no backend | `dist` served under `/siren-Hackachusetts-/`, nothing on port 8090, headless Chrome | Falls back to replay, flags `auditor-llm-large`, shows "Watching a recorded attack" banner linking to the repo |
| Phone width | Chrome DevTools protocol, measured `scrollWidth` at 320/390/768/1440 px | **Found** the replay `<select>` overflowing to 534 px at 390 px; fixed in `App.css`; now 0 overflow at all four widths |
| Workflow file | Parsed YAML; checked each action's latest major tag exists | Parses; uses checkout@v7, setup-node@v7, configure-pages@v6, upload-pages-artifact@v5, deploy-pages@v5. Not yet run on GitHub |

Session 4 additions (Integration 1, real gateway + decoy from `origin/main` @ `035de66`):

| Check | How | Result |
| --- | --- | --- |
| Frame shape | Node WS client; every frame checked with the dashboard's own `isSirenEvent` | 10/10 valid, one event per message (never arrays), no fields outside the contract |
| Bait path | `python-httpx` UA: `/`, `/robots.txt`, `/.env`, `/backup/README_ADMIN.txt`, `/verify?agent=…` | `scripted_ua` + `bait_followed`, flagged at request 5, `model_claim`/`stated_goal` captured, later requests routed to maze |
| Canary path | Reused `SIREN_DBPASS_…` from `/.env` as a Bearer token | `canary_reused` fires, session flagged |
| Backlog on connect | New WS client after traffic | Gateway replays its buffer; dashboard shows all sessions on load |
| Dashboard, Live | Production build in headless Chrome, nothing but the gateway running | Auto-connects to Live (no fallback); a new browser request through `:8080` appears as a new session within seconds |

Expected gaps, not bugs: the maze is still Labyrinth's stub, so `est_usd_burned` is 0 and
`prediction` is never set (the Attacker-mind panel stays empty). Re-check both at Integration 2.

**Not yet verified:** the Pages workflow running on GitHub, Integration 2 (real maze, burn, prediction) (only a fake WS server was used), and a
containerized Docker build (expected to fail on the `../../shared` type import — see gaps).

---

## Open decisions & known gaps

- **`theme.css` is not from Figma yet.** Values are hand-picked; names match the intended
  token set so swapping in Figma values is a values-only change.
- **Bundled replay is synthetic.** `public/replays/sample-attack.jsonl` comes from mock
  data. Replace with a real gateway recording when Brain provides one.
- ~~**WebSocket message shape assumed.**~~ Confirmed at Integration 1: one `SirenEvent` per
  message, no extra fields.
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

### 2026-10-24 — Session 4: Integration 1 with Brain

**Goal:** a browser request to `localhost:8080` shows up on the live dashboard.

**Done:** ran decoy + gateway from `origin/main` in a throwaway worktree (`docker compose -p
integ1`), validated every WS frame with the dashboard's own guard, exercised the bait and
canary paths, and drove the production dashboard in headless Chrome in Live mode. All checks
passed (see "Session 4 additions"). Closes the "WebSocket message shape assumed" gap: it is one
`SirenEvent` per message.

**Next session:** Integration 2 once Labyrinth's maze lands (burn and prediction); product
rename to Maelstrom.

### 2026-10-24 — Session 3: Prompt C, hosted demo

**Goal:** Pages workflow, replay curation + generated `index.json`, replay banner.

**Done:**
1. Added `.github/workflows/pages.yml` (build `/dashboard` with the Pages base path, deploy
   on every push to `main`).
2. Added `scripts/replay-index.ts` (shared index rebuild) and `scripts/curate-replays.ts`,
   plus `replays:curate` / `replays:index` npm scripts. `make-sample-replay.ts` now uses the
   shared rebuild so it keeps curated entries.
3. The "Watching a recorded attack" banner with the GitHub link already existed from
   Session 1. Confirmed it renders in the hosted build, and that CI points the link at the
   repo via `VITE_REPO_URL`.
4. Fixed a phone-width overflow: the replay `<select>` sized itself to the longest title.
5. Verified everything listed under "Session 3 additions" above.

**Not done:** no real gateway recording exists yet, so only the synthetic sample is bundled.
The workflow hasn't run on GitHub yet, because it needs PR #2 merged and Pages enabled.
`origin/main` already has `dashboard/public/replays/index.json` as `[]` (from the bait
kickoff), so PR #2 will have an add/add conflict on that file. Keep our version.

**Next session:** Kiro Crew walks the hosted URL like a judge; curate a real run; Prompt D.

### 2026-10-24 — Session 2: Progress docs + Kiro log

**Goal:** Document everything built so far and set up docs we keep current each session.

**Done:**
1. Created this progress log (`dashboard/docs/PROGRESS.md`): status table, "what it does",
   file map, a detailed "how it works" section, the ATT&CK table, build/run commands, a
   verification-results table, known gaps, and this append-only session log.
2. Created the Stage Kiro log (`docs/kiro-log/stage.md`) in the playbook format, backfilled
   with entries for the dashboard build, the ATT&CK verification, and the commit/PR work.
3. Committed and pushed to `stage/dashboard` (PR #2).

**Next session:** Prompt C — hosted demo (Pages workflow + curated replays), or the Figma
token pass first. Add real screenshots to `docs/kiro-log/img/` and link them in the Kiro log.

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
