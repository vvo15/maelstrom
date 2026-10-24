# Siren — Honeypot Safety Rules

These rules apply to every file in a Siren decoy service.
Copy this file to `.kiro/steering/` in your project.

## Core rules

1. **Nothing is exploitable.** Every "vulnerability" in the decoy is staged bait.
   - Never call `exec`, `system`, `shell_exec`, `passthru`, `popen`, `proc_open` or `eval`.
   - Never use request input in a file path, database query, or shell command.
   - No file uploads, no dynamic includes, no `require` with user-controlled paths.

2. **Every credential is a canary.**
   Format: `SIREN_<KIND>_<first 10 hex chars of session id>`
   - `KIND` must be one of: `DBPASS`, `APIKEY`, `ADMINTOKEN`
   - Never hard-code a real API key, database password, or private key.
   - The gateway detects canary reuse and scores +40.

3. **Bait instructions are safe.**
   Bait only asks an AI agent to identify itself or visit a specific path.
   It never asks the agent to harm, exfiltrate, or modify anything real.

4. **Fictional content only.**
   Use invented names (e.g., "Town of Millbrook"). No real town, agency, company,
   logo, or trademark anywhere in the decoy.

5. **Response headers must match `DECOY_HEADERS`.**
   ```
   Server: Apache/2.4.62 (Debian)
   X-Powered-By: PHP/8.3.12
   ```
   The maze copies these headers so attackers can't detect the switch.

## Lint enforcement

The `bait-safety-lint` hook (in `hooks/`) enforces rules 1–3 automatically
on every file save inside your decoy folder. It exits non-zero on violations.
