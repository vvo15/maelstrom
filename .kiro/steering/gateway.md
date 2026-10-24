---
inclusion: fileMatch
fileMatchPattern: "gateway/src/**"
---
# Gateway rules
- The detector is pure: (sessionState, request) -> {score, signals, flagged}. No I/O inside it.
- Never edit gateway/src/maze. Call it only through the Maze interface in shared/contracts.ts.
- Every request produces exactly one SirenEvent from shared/events.ts. Never add fields to SirenEvent. The score goes in the ai_score field.
- Forward the client's own request headers to the decoy (minus hop-by-hop headers, host and content-length). The gateway adds only the x-siren-session header and never injects real secrets.
- Prefer the smallest change that passes the property tests.