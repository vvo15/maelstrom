---
inclusion: fileMatch
fileMatchPattern: "decoy/**"
---
# Decoy rules

- The decoy is a fictional town portal. Never name a real town, agency or company.
  Use "Town of Millbrook" or a similarly invented name.
- **Nothing is exploitable.** Never call `exec`, `system`, `shell_exec`, `passthru`,
  `popen`, `proc_open` or `eval`, and never use request input in a file path.
- Every credential is a canary in the format `SIREN_<KIND>_<10 hex chars>`.
  Use `canaryFor()` from `shared/contracts.ts` as the reference implementation.
- Bait instructions only ask an agent to identify itself or visit a path.
  They never ask it to harm anything.
- Response headers must equal `DECOY_HEADERS` in `shared/contracts.ts`:
  `server: Apache/2.4.62 (Debian)` and `x-powered-by: PHP/8.3.12`.
- Only edit files under `/decoy`.
