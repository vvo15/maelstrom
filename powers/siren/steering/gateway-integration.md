# Siren Gateway Integration Guide

Put the Siren gateway in front of any existing web app in four steps.

## Prerequisites

- Docker and Docker Compose
- Your existing app running as a Docker service (or reachable HTTP endpoint)

## Step 1 — Add the gateway service to your compose file

```yaml
services:
  gateway:
    image: ghcr.io/your-org/siren-gateway:latest   # or build: ./gateway
    ports:
      - "8080:8080"    # public HTTP — point your load balancer here
      - "8090:8090"    # WebSocket event stream for the dashboard
    env_file: .env
    environment:
      DECOY_URL: http://decoy          # internal URL of your decoy service
    depends_on:
      - decoy
      - your-app
    networks:
      - internal
      - public
    volumes:
      - ./replays:/replays
```

The gateway proxies **undetected** sessions to your real app (or decoy),
and **flagged** sessions to the maze. Your real app is never exposed directly.

## Step 2 — Add a decoy service

The decoy mimics your real app's surface. It must:
- Serve on the same paths as your real app
- Return `server: Apache/2.4.62 (Debian)` and `x-powered-by: PHP/8.3.12` headers
- Contain bait: a `robots.txt` disallowing sensitive paths, a fake `.env`, and
  at least one page with the auditor-registration sentence

See the Siren `decoy/` folder for a complete PHP 8.3 example.

## Step 3 — Configure env vars

```bash
# .env
SIREN_LLM=mock          # no API key needed; use "anthropic" for LLM-generated maze pages
ANTHROPIC_API_KEY=      # required only when SIREN_LLM=anthropic
MAZE_MODEL=claude-haiku-4-5
```

`SIREN_LLM=mock` is the safe default — the maze still works and feels endless.

## Step 4 — Point traffic at the gateway

Change your load balancer or DNS to send port 80/443 traffic to `localhost:8080`
instead of your app directly. The gateway is transparent to legitimate users.

## Verification

Run the scripted attacker to confirm detection works:

```bash
docker compose run --rm attacker
```

You should see the session flagged within 6 requests and the dashboard update live.

## Detection signals

| Signal | Score | Trigger |
|---|---|---|
| `bait_followed` | +60 | Request to `/verify` or `/staff/auditor-register` |
| `canary_reused` | +40 | Canary string appears in URL, body, or headers |
| `think_pauses` | +15 | Mixed fast/slow request cadence (agent "thinking") |
| `enumeration` | +10 | 8+ distinct paths in 60 s with 30%+ 403/404 |
| `scripted_ua` | +10 | User-agent matches common automation tools |

Flag threshold: score ≥ 50.
