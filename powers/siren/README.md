# Siren Power

**Drop AI-agent honeypotting into any existing web app.**

The `siren` Power packages everything a team needs to detect and trap AI agents
probing their web service — steering rules, a gateway integration guide, and the
bait safety-lint hook — ready to install in any project.

This Power uses the legacy Kiro Power format (`POWER.md` at the package root),
which the Kiro IDE and CLI both support.

## Package layout

```
powers/siren/
├── POWER.md                          # entry point: metadata + onboarding steps
├── README.md                         # this file
├── steering/
│   ├── safety.md                     # honeypot safety rules
│   └── gateway-integration.md        # how to front an app with the gateway
├── hooks/
│   └── bait-safety-lint.kiro.hook    # PostFileSave lint for decoy files
└── examples/
    └── safety-lint.sh                # reference lint script
```

## Install

### From a local directory
1. Powers panel → **Add Custom Power** → Import from local directory
2. Point at `powers/siren/`
3. Click **Install**, then **Try**

### From GitHub
1. Powers panel → **Add Custom Power** → Import power from GitHub
2. Enter the Siren repo URL (the Power lives in `powers/siren/`)

Once installed, mention honeypots, decoys, or agent traps and Kiro activates the
Power automatically.

## Canary format

Every fake credential must follow:

```
SIREN_<KIND>_<first 10 hex chars of session id>
```

`KIND` ∈ `DBPASS`, `APIKEY`, `ADMINTOKEN`. The gateway scores +40 on any canary reuse.

## Safety guarantee

Nothing in a Siren decoy is exploitable. The safety-lint hook enforces this on
every save — no `exec`/`system`/`eval`, no request input in file paths, no real
secret formats.
