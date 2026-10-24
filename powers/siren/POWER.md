---
name: siren
displayName: Siren · AI-Agent Honeypot
description: Drop AI-agent honeypotting into any web app. Siren detects AI agents probing your service, lures them into a safe decoy full of canary bait, and traps flagged agents in an endless LLM-generated maze while dashboarding every move in plain language. Ships steering rules for building decoys safely, a gateway integration guide, and a safety-lint hook. Built for under-resourced public-sector portals (town halls, school districts, libraries).
author: Siren Team (Hackachusetts 2026)
keywords:
  - honeypot
  - ai agent
  - ai attacker
  - deception
  - decoy
  - canary
  - tarpit
  - maze
  - prompt injection
  - agent detection
  - civic security
  - web security
  - gateway
  - siren
---

## What this Power gives your agent

Siren packages a battle-tested pattern for catching AI agents that probe web
services. When you ask Kiro to build or harden a honeypot, decoy, or agent trap,
this Power supplies:

- **Safety rules** (`steering/safety.md`) — the non-negotiable constraints that keep
  a decoy harmless: canary-only credentials, no exploitable code, fictional content.
- **Gateway integration guide** (`steering/gateway-integration.md`) — how to put the
  Siren detection gateway in front of an existing app in four steps.
- **A safety-lint hook** (`hooks/bait-safety-lint.kiro.hook`) — rejects dangerous
  code and bare credentials on every save inside your decoy folder.

## Onboarding

Run these steps the first time this Power activates. Skip any the user has already done.

### Step 1: Copy the steering rules

Copy `steering/safety.md` and `steering/gateway-integration.md` into the target
project's `.kiro/steering/` folder. The safety rules apply to every decoy file.

### Step 2: Install the safety-lint hook

Copy `hooks/bait-safety-lint.kiro.hook` into `.kiro/hooks/`. Update its `matcher`
to point at the project's decoy folder (default: `decoy/`). Create the lint script
at `decoy/scripts/safety-lint.sh` (see `examples/safety-lint.sh`).

### Step 3: Define the canary format

Every fake credential in the decoy must use:

```
SIREN_<KIND>_<first 10 hex chars of session id>
```

Where `KIND` is `DBPASS`, `APIKEY`, or `ADMINTOKEN`. The gateway watches for this
pattern in every request; a match scores +40 (`canary_reused`) toward the flag
threshold of 50.

### Step 4: Wire the gateway

Follow `steering/gateway-integration.md` to add the gateway service in front of the
real app. Run `docker compose up`, then `docker compose run --rm attacker` to confirm
detection fires within ~6 requests.

## Safety guarantee

Nothing in a Siren decoy is exploitable. The safety-lint hook enforces this
automatically on every save: no `exec`/`system`/`eval`, no request input in file
paths, no real secret formats, and every credential prefixed `SIREN_`.
