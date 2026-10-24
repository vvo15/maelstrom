# Maelstrom

**A defensive deception honeypot that detects, traps, and measures automated AI agents probing a web app you own.**

AI agents now probe web apps for weaknesses on their own — cheaply, around the clock. The targets least able to defend themselves are under-resourced public bodies: town halls, school districts, small clinics. Maelstrom is a drop-in defensive layer for a web app. Real visitors never notice it. When an automated AI agent shows up, Maelstrom baits it, flags it, routes it into an endless maze of fake pages, and shows the whole thing on a live dashboard — including the (self-reported) model and the estimated time and money the agent burned.

Maelstrom is **defensive and sandbox-only**. It never attacks back, never makes outbound requests to anyone but its own configured LLM endpoint, and every "leaked" credential is a fake canary.

> **Track:** Civic Action — protecting public-sector web services that have no security team.

---

## Quickstart (no API key needed)

Prerequisites: Docker + Docker Compose.

```bash
cp .env.example .env        # optional — omitting it still defaults to mock mode
docker compose up            # builds and starts decoy, gateway, dashboard
docker compose run --rm attacker   # launches the demo attacker against the local gateway
```

Then open:

- **Dashboard:** http://localhost:5173 — watch sessions get flagged in real time
- **Portal (what the agent sees):** http://localhost:8080 — the fake "Town of Millbrook" services site
- Gateway WebSocket event stream: `ws://localhost:8090` (the dashboard consumes this)

**Mock mode is the default.** With `SIREN_LLM=mock` (the default when no `ANTHROPIC_API_KEY` is set), the maze serves deterministic fake pages and needs no API key — so a judge can run the whole thing offline. Set `SIREN_LLM=anthropic` + `ANTHROPIC_API_KEY=...` in `.env` to use a live model for maze pages and the LLM attacker.

---

## How it works

Five layers, left to right:

```
 AI agent ──HTTP──▶ Gateway ──▶ Detector (score 0–100) ──┬─ clean ─▶ Decoy portal (real-looking fake town site)
                      │                                   └─ flagged ─▶ Maze (endless fake internal system)
                      └──▶ Event stream (ws:8090) ──▶ Dashboard (live)
```

1. **Bait (decoy).** A fictional "Town of Millbrook Online Services" PHP site with planted content only an automated agent would chase: a `robots.txt` pointing at hidden paths, a leaked-looking `/.env`, a `/backup/README_ADMIN.txt`, HTML comments, and a `/verify` endpoint. Every credential is a fake canary in the form `SIREN_<KIND>_<10 hex>`. Nothing is actually exploitable.
2. **Detection.** The gateway scores each session 0–100 from signals: following a planted instruction, reusing a canary, machine-speed request timing, rapid enumeration, and scripted user-agents. A session flags at **score ≥ 50** and, once flagged, stays flagged.
3. **Labyrinth (maze).** Flagged sessions are quietly routed into an endless, self-consistent fake internal system — deeper directories, config dumps, admin consoles, "almost working" endpoints. The same `(session, path)` always returns byte-identical content, so the agent never sees anything inconsistent, and every link only ever goes *deeper* (it can't climb back out).
4. **Burn + prediction.** The maze estimates the tokens/dollars the agent is spending and predicts its likely next move, both surfaced on the dashboard.
5. **Dashboard.** Live view of each session, the moment it flags, its self-reported model, a reconstructed "attacker plan," MITRE ATT&CK technique chips, and a plain-language "Town IT view."

### Project layout

| Path | What it is |
|------|------------|
| `decoy/` | The fake town-services PHP site (the bait) |
| `gateway/` | Node/TS proxy: session scoring, routing, event stream, replay |
| `gateway/src/maze/` | The Labyrinth: deterministic + LLM maze, burn estimate, prediction, ATT&CK mapping |
| `attacker/` | Demo pentester agent (sandbox-locked to the gateway) |
| `dashboard/` | Live React dashboard (consumes the WebSocket stream) |
| `shared/` | Frozen cross-module contract (`contracts.ts`, `events.ts`) |
| `.kiro/` | Specs, steering, and hooks — how we built this with Kiro |

---

## Safety (stated plainly)

- **Sandbox-only.** Runs on localhost / a sandbox you own. Never exposed to the open internet during the event.
- **No hack-back.** Maelstrom only responds to visitors that come to it. It never scans or acts on another system.
- **Fake content only.** Every credential is a `SIREN_`-prefixed canary. No real or working credentials, exploit code, or malware is ever generated. Maze output is passed through a sanitizer that scrubs any real-secret-format string, and reflected request paths are HTML-escaped so the honeypot can't be turned into an XSS vector.
- **The attacker is sandbox-locked.** It can reach exactly one host — the gateway — and rejects any other host, scheme, or redirect. Its prompt is a generic authorized-pentester prompt that never mentions the bait, so a catch is a genuine result, not a staged one.
- **Self-reported identity.** The model name shown on the dashboard is what the agent reports; it is labeled unverified. The reconstructed "plan" is inferred from request logs, not the agent's real reasoning. Burn figures are estimates (exact for our own test runs).

## Testing / quality

- **Property-based tests** (fast-check) cover both the detector (score bounded 0–100, monotonic, sticky flag) and the maze (deterministic per `(session, path)`, canary-only output, sanitizer never leaks a real-secret pattern for any input, links never climb out, burn non-negative and monotonic, ATT&CK mapping uses only verified IDs).
- Run the maze suite: `cd gateway && SIREN_LLM=mock npx vitest run src/maze`
- Run the full gateway suite: `cd gateway && npm test`

## How we used Kiro

- **Specs** (`.kiro/specs/`) in EARS form, one per module (detection gateway, decoy, maze, dashboard).
- **Steering** (`.kiro/steering/`) — global rules plus one `fileMatch` file per module, so Kiro only loads the rules for the code it's touching.
- **Hooks** (`.kiro/hooks/`) — e.g. maze property tests run on save, a contract typecheck guard, and a decoy safety lint.
- **Property-based testing** derived directly from the EARS requirements.
- See [KIRO.md](KIRO.md) for the full write-up.

## Credits

Standing on prior public work:
- Palisade Research — LLM agent honeypot with planted instructions and timing checks
- Mantis — prompt-injection defense against AI attackers (arXiv 2410.20911)
- Cloudflare AI Labyrinth — trapping content-scraping bots in generated mazes
- Beelzebub — open-source honeypot framework

<!-- TODO(Stage): fill these submission items before final push -->
- **Hosted demo:** _TODO(Stage) — paste the GitHub Pages / hosted dashboard URL (replay mode, no backend needed)._
- **Demo video:** _TODO(Stage) — paste the public YouTube link (< 3:00, own voiceover, no music, fictional town only)._
- **Screenshot / GIF:** _TODO(Stage) — add a dashboard screenshot or GIF here._
- **Open datasets:** _TODO(Stage) — credit any public dataset used to seed decoy data (e.g. a city 311 open dataset)._
