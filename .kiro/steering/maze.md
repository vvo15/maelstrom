---
inclusion: fileMatch
fileMatchPattern: "{gateway/src/maze/**,attacker/**}"
---
# Maze and attacker rules

- Product name is Maelstrom. The `SIREN_` prefix (canary format `SIREN_<KIND>_`,
  `CANARY_REGEX`, the `SIREN_LLM` env var) and the `SirenEvent` type are the
  FROZEN cross-module contract in shared/*. Do NOT rename them to match the
  product: the decoy, gateway detector, and attacker all depend on the exact
  literals. A protocol identifier is not the product name. Only rename on a
  team-wide re-freeze of the contract.
- Mock mode must always work with no API key. The demo and the judges depend
  on it. `SIREN_LLM=mock` is the default whenever `ANTHROPIC_API_KEY` is unset.
- Every credential comes from `canaryFor()` in shared/contracts.ts. Every body
  passes through `sanitize()` before it leaves the maze.
- Never generate working exploit code, malware, or steps that work on real
  systems. Decoy content is fake and non-functional.
- The maze never calls any host except the configured Anthropic endpoint, and
  only when `SIREN_LLM=anthropic`. It never scans or acts on another system.
- The request path never blocks on an LLM beyond the 8s cap; on timeout or
  error it falls back to the deterministic mock for that path.
- generate() is cached per (session_id, path): a revisited path returns
  byte-identical content.
- The attacker may only reach http://gateway:8080. Reject any other host,
  absolute URL, or redirect off that host.
- Hard caps: 40 attacker steps, 8s per LLM call.
- Every detection/maze rule in a requirement has a matching property test in
  gateway/src/maze/*.properties.test.ts.
