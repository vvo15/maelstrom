# Siren Power

**Drop AI-agent honeypotting into any existing web app.**

The `siren` Power packages everything a team needs to detect and trap AI agents
probing their web service — steering rules, gateway integration guide, and the
bait safety lint hook — all ready to install in a new project.

## What's included

| File | Purpose |
|---|---|
| `steering/safety.md` | Safety rules: canary format, forbidden PHP functions, no real secrets |
| `steering/gateway-integration.md` | Step-by-step guide to putting the Siren gateway in front of an existing app |
| `hooks/bait-safety-lint.json` | PostFileSave hook that rejects dangerous code and bare credentials in decoy files |

## Quick start

1. Copy `steering/` contents into your project's `.kiro/steering/`.
2. Copy `hooks/bait-safety-lint.json` into `.kiro/hooks/` and update the path matcher to your decoy folder.
3. Follow `steering/gateway-integration.md` to wire the gateway in front of your app.
4. Run `docker compose up` — Siren starts detecting on port 8080.

## Canary format

Every fake credential must follow:

```
SIREN_<KIND>_<first 10 hex chars of session id>
```

Where `KIND` is `DBPASS`, `APIKEY`, or `ADMINTOKEN`. The gateway watches for
this pattern in every request; a match scores +40 (`canary_reused`).

## Safety guarantee

Nothing in a Siren decoy is exploitable. The safety lint hook enforces this
automatically on every save.
