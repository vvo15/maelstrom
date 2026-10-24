# Kiro log — Stage

Role: Stage. Owns the dashboard, the hosted demo, the README, the `KIRO.md` write-up,
and the submission. Entries follow the playbook format and feed into `KIRO.md`.

Default autonomy: Auto. Surfaces used so far: Kiro IDE.

---

## 2026-10-24 — Dashboard spec (Prompt A), via a feature spec in the IDE

- **Feature used:** spec (feature spec) + steering + Kiro IDE.
- **What I asked Kiro and why that feature fit:** handed Kiro the dashboard spec from the
  playbook (three data sources, the full panel layout, the Town IT view, ATT&CK chips, and
  the accessibility bar) and told it to build the app in `/dashboard`, importing `SirenEvent`
  as a type only. A spec fit because the dashboard is a big, multi-file feature with clear
  acceptance criteria, so it's worth pinning requirements down before generating code.
- **What it got right:** scaffolded the whole app in one pass — the event reducer
  (`sessions.ts`), the source layer (`sources/`), the copy system with a full plain-language
  second set (`copy.ts`), and every panel component. It respected the steering: type-only
  import, no new `SirenEvent` fields (everything derived), colors only via CSS variables, and
  text+icon status instead of color alone.
- **What I corrected:**
  - A leftover dead expression inside the signal-title JSX (a no-op ternary) — removed it.
  - Timeline grid columns were too wide and wrapped on narrower viewports — tightened the
    `grid-template-columns` for both the technical and plain layouts.
  - The three-column page grid was a touch wide — narrowed the side columns.
- **Verification I ran (not assumed):**
  - `tsc -b` and `vite build` both pass.
  - A `BASE_PATH=/siren-Hackachusetts-/` build correctly rewrote asset/href paths for Pages.
  - Hand-wrote a Node script to compute WCAG contrast for every token pair in both light and
    dark schemes → 0 failures (text ≥ 4.5:1, UI ≥ 3:1).
  - Drove the production build in headless Chrome against a throwaway WebSocket "gateway":
    confirmed live connect, duplicate-frame dedupe (25 attacker rows, not 30), the flag alert
    with model claim + goal, all five signals lighting up, the attacker-mind panel, the Town
    IT rewrite, a sensible tab order, no mobile horizontal overflow, and both color schemes.
- **Compared to vibe coding:** much faster for the first 90% — the spec produced a coherent,
  consistent multi-file app instead of a pile of chat snippets I'd have to stitch. The last
  10% (layout tuning, dead code, the real verification) was still hands-on. The big win was
  consistency: the plain-language copy and the accessibility rules were applied uniformly
  across every component because they were stated once as requirements/steering.
- **Screenshot:** _TODO — add `img/stage-dashboard-live.png` and `img/stage-townit-view.png`._

## 2026-10-24 — Verified ATT&CK technique IDs against the live source

- **Feature used:** Kiro IDE + web tooling (research, not from memory).
- **What I asked and why:** the playbook requires every MITRE ATT&CK ID in the mapping to be
  checked on attack.mitre.org before shipping. Guessing IDs is exactly the kind of thing a
  model gets subtly wrong, so I treated it as a verification task, not recall.
- **What it got right / what I corrected:** confirmed all five — T1595.003 (Active Scanning:
  Wordlist Scanning), T1552.001 (Unsecured Credentials: Credentials In Files), T1078 (Valid
  Accounts), T1190 (Exploit Public-Facing Application), and T1594 (Search Victim-Owned
  Websites). Noticed T1078's tactic list on the current page includes "Stealth", so I used the
  site's wording rather than the older "Defense Evasion" from memory. T1594 is an addition
  beyond the playbook's suggested four; I did **not** map `bait_followed`, `think_pauses`, or
  `scripted_ua` because none has a clean, defensible technique.
- **Compared to vibe coding:** this is precisely where unverified generation is dangerous — a
  wrong technique ID would look authoritative and mislead a judge. Checking the source cost a
  few minutes and removed that risk.
- **Screenshot:** _TODO — add `img/stage-attack-chips.png`._

## 2026-10-24 — Saved progress: branch, commit, PR, and progress docs

- **Feature used:** Kiro IDE + Git/GitHub CLI.
- **What I asked and why:** commit the dashboard and open a PR so the work is saved, then
  create a living progress doc that gets updated every session.
- **What it did:** created branch `stage/dashboard`, staged only `dashboard/` (verified no
  `node_modules`/`.env`, and that `public/replays/*.jsonl` is tracked because the hosted demo
  needs it), committed, pushed, and opened **PR #2** against `main`. Left the two untracked
  root `.md` files alone since they're outside my lane. Added `dashboard/docs/PROGRESS.md`
  (status table, architecture, file map, ATT&CK table, build steps, known gaps, append-only
  session log) and this Kiro log.
- **What I corrected / flagged:** noted that `stage/dashboard` was branched off `member-4`, so
  the PR diff includes whatever `member-4` carries beyond `main` — worth a rebase/retarget if
  `member-4` isn't merged.
- **Compared to vibe coding:** the value here was discipline, not speed — staging specific
  paths and dry-running the add caught the ignore rules before anything wrong got committed.
- **Screenshot:** _TODO — add `img/stage-pr.png`._

## 2026-10-24 — Hosted demo (Prompt C), vibe session in the IDE

- **Feature used:** Kiro IDE (vibe chat, Autopilot) + GitHub CLI + headless Chrome.
- **What I asked Kiro and why that feature fit:** "execute on prompt C": a Pages workflow,
  replay curation with a generated `index.json`, and the replay banner. It's a small,
  well-bounded change, so a chat session fit better than a spec.
- **What it got right:**
  - Checked the latest major tag of each GitHub Action with `gh api` instead of
    writing versions from memory.
  - Read `base_path` from `configure-pages`, so a custom domain still works.
  - Noticed the banner already existed and didn't rebuild it.
  - Found that the gateway writes `replays/<startMs>.jsonl` and built the curation script
    around that format.
  - Noticed `npm run replay:sample` would have overwritten curated entries in
    `index.json` and fixed it.
- **What I corrected / what it caught:** the first phone screenshot showed the source
  controls cut off. Measuring through the DevTools protocol showed the replay `<select>` was
  534 px wide in a 390 px viewport, because it sized itself to the longest replay title.
  Session 1's "no mobile overflow" check had missed this. A two-line CSS fix gave 0 overflow
  at 320, 390, 768 and 1440 px. Kiro also flagged that `origin/main` already has an empty
  `index.json`, so PR #2 will conflict on that file. Pages also needs a repo admin to turn it
  on, and my account only has write access.
- **Compared to vibe coding:** this was vibe coding, and it suited a task this size. The
  lesson is the same as the spec session: the screenshot caught a bug that an earlier
  "verified" claim had missed.
- **Screenshot:** `img/stage-hosted-phone.png` (after the fix), `img/stage-hosted-desktop.png`.

---

## Backlog for this log (keep filling as we go)
- Figma MCP: what the design file gave Kiro that a screenshot wouldn't (when we do the token pass).
- Kiro Crew walking the hosted URL like a first-time judge (after Pages is live).
- Prompt D: the `stage-docs-sync` manual hook that compiles `KIRO.md`.
- Add real screenshots to `docs/kiro-log/img/` and link them above.
