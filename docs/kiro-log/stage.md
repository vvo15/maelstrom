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
- **Screenshot:** none yet.
  - SCREENSHOT NEEDED: `img/stage-dashboard-live.png`. Show the dashboard in technical view with
    the flagged `auditor-llm-large` session selected. All panels should be visible: the top bar
    numbers, the session list with the flagged badge, the timeline with decoy and maze rows, the
    lit signals checklist, the flag alert and the attacker-mind panel.
  - SCREENSHOT NEEDED: `img/stage-townit-view.png`. Show the same session and moment with the
    Town IT view switched on, so the plain-language rewrite is visible.

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
- **Screenshot:** none yet.
  - SCREENSHOT NEEDED: `img/stage-attack-chips.png`. Show the ATT&CK chips panel for the flagged
    session with the technique IDs readable, next to the attack.mitre.org page for one of them
    (for example T1552.001) so the check against the source is visible.

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
- **Screenshot:** none yet.
  - SCREENSHOT NEEDED: `img/stage-pr.png`. Show the PR #2 page on GitHub with the title,
    `stage/dashboard` into `main`, and the merge box saying it has no conflicts.

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

## 2026-10-24 — Integration 1 with Brain, vibe session in the IDE

- **Feature used:** Kiro IDE (vibe chat, Autopilot) + Docker + headless Chrome via the
  DevTools protocol.
- **What I asked and why:** run the first integration gate, where a browser request to
  `localhost:8080` has to appear on the live dashboard. I asked Kiro to prove it end to end
  rather than just eyeball it.
- **What it got right:**
  - Ran the stack from `origin/main` in a throwaway git worktree, so my branch stayed
    untouched.
  - Checked every WebSocket frame with the dashboard's own `isSirenEvent` guard instead of
    writing a second validator.
  - Exercised both detection paths, the `/verify` bait and canary reuse.
  - Confirmed the last open contract question: the gateway sends one event per message.
- **What I corrected:** its first attacker script used a guessed token regex and grabbed the
  session ID instead of the canary. It noticed, read `CANARY_REGEX` in `shared/contracts.ts`,
  and re-ran with the real format.
- **Compared to vibe coding:** the steering and the shared contract kept this fast. The
  validator was already written for the dashboard, so the integration test reused it.
- **Screenshot:** `img/stage-live-integration.png`.

## 2026-10-24 — Pre-submission risk pass, vibe session in the IDE

- **Feature used:** Kiro IDE (vibe chat, Autopilot) + Git/GitHub CLI + Docker + the Kiro docs
  sub-agent.
- **What I asked and why:** a numbered checklist of submission risks, with three rules: work
  only in Stage's files, run every check and paste its real output, and stop at named gates
  (secrets found, any push). A chat session fit because each step was small but had to be
  proved, not assumed.
- **What it fixed:**
  - Merged `origin/main` into `stage/dashboard` (`518b56f`). All five conflicts were add/add in
    `dashboard/` against Bait's kickoff placeholders, so I kept ours. `npm run replays:index`
    left `index.json` unchanged, and `npm run build` and `tsc` passed. After the push, PR #2
    went from `CONFLICTING` to `MERGEABLE`.
  - The Pages workflow now builds with `BASE_PATH: /${{ github.event.repository.name }}/`
    (`df5301c`). A `BASE_PATH=/maestrom/` build rewrote the asset URLs to `/maestrom/assets/...`.
  - Rewrote `dashboard/Dockerfile` for the repo-root build context Compose uses (`377aa6c`). It
    now copies from `dashboard/`, uses `node:24-alpine` to match CI, and runs
    `npx vite --host 0.0.0.0 --port 5173` with no tsc step.
  - Added `.kiro/steering/stage-docs-sync.md` (`9149895`), the on-demand `KIRO.md` sync.
- **What the checks caught:**
  - Plain `npx tsc --noEmit` in `dashboard/` checks nothing: `tsconfig.json` has `"files": []`
    and only project references. Running it with `-p tsconfig.app.json` and
    `-p tsconfig.node.json` gave the real result (both pass).
  - The workflow wasn't hard-coded before. `configure-pages`' `base_path` already followed a
    rename, so the change only swaps that for the event payload. The trade-off is that a custom
    domain would now need `BASE_PATH=/`.
  - `gh repo view` showed the repo was already renamed to `vvo15/maestrom` and already
    **public**. The UI says "Maelstrom", so the product and repo names are spelled differently.
  - Safety: `git check-ignore -v .kiro` and the tracked-`.env` check printed nothing. The
    history grep printed 16 lines. All of them are test fixtures or detection patterns:
    Labyrinth's property-test inputs (AWS's documented example key and strings built with
    `.repeat()`), Bait's `safety-lint.sh` regexes, and spec and playbook prose. A stricter search
    for full-length literal keys found none, and no history was rewritten.
  - Docker: `docker compose build dashboard` failed with `npm ci` `EUSAGE` (no lockfile).
    Compose uses the repo root as context, so the old `COPY package*.json ./` copied nothing.
    After the fix the image builds, serves HTTP 200 and runs only Vite. `dashboard/.dockerignore`
    has no effect with a repo-root context. The root `.dockerignore` is what keeps
    `node_modules` out.
  - The bundled replay judges see first (`sample-attack.jsonl`) is synthetic, generated from the
    mock emitter. It has 2 sessions, 1 flagged (`auditor-llm-large`), a max burn of $0.283362
    and 16 events with a prediction.
  - Kiro 1.x hooks have no manual trigger. The docs agent quoted kiro.dev: for an on-demand IDE
    workflow, use a manually included steering file, which runs as a `/<filename>` slash
    command.
- **What was blocked:**
  - Product name and repo-link edits: the target name and repo were never filled in, so
    nothing was renamed.
  - `docker compose up -d dashboard` failed with `port is already allocated`. An older container
    (`sleepy_bell`, image `siren-dashboard`) holds 5173. I didn't stop it; I verified the image
    on port 5174 instead.
  - Recording a scripted mock run: decoy and gateway start under Compose, but the attacker on
    `main` is still Labyrinth's placeholder. It printed two lines, sent no requests and wrote no
    replay. The maze on `main` is also a stub (`usd: 0`, no prediction). Labyrinth's real
    attacker and maze are on `origin/member3-labrynth`, which `git merge-tree` says merges into
    `main` cleanly.
  - `/stage-docs-sync` was created but not run yet.
- **Compared to vibe coding:** this was vibe coding with gates, and the gates did the work.
  "Run every check" exposed a `tsc` that checked nothing and a wrong premise about the workflow.
  The stop rule held the session at the secret scan until a human looked at the matches.
- **Screenshot:** none yet.
  - SCREENSHOT NEEDED: `img/stage-risk-pass.png`. Show the terminal with
    `docker compose build dashboard` ending in `Image siren-hackachusetts--dashboard Built` and
    the `curl` returning 200.

---

## Backlog for this log (keep filling as we go)
- Figma MCP: what the design file gave Kiro that a screenshot wouldn't (when we do the token pass).
- Kiro Crew walking the hosted URL like a first-time judge (after Pages is live).
- Prompt D: run `/stage-docs-sync` (a manual steering file, since IDE 1.x has no manual hooks) and log what it produced in `KIRO.md`.
- Add real screenshots to `docs/kiro-log/img/` and link them above.
