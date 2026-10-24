## Requirements review
- Feature used: Spec (requirements phase, EARS format), steering (gateway.md with fileMatch)
- Reviewing Kiro's requirements before design caught 4 gaps: the flagging request would have been routed to the maze, so the decoy's /verify page (with the ADMINTOKEN canary) would never be served; enumeration depended on a response status that doesn't exist yet at scoring time; no error handling, so a rejected background promise could crash Node; burn totals trusted the maze's output, which could break Property 6.
- Compared to vibe coding: these would have surfaced as integration bugs at 3 PM. The spec's review gate caught them in 5 minutes.

## Design review
- Feature used: Spec (design phase)
- Reviewing Kiro's design before tasks caught a stateful global-regex bug: CANARY_REGEX in shared/contracts.ts has the /g flag, so reusing it with .test() would have made canary detection miss stolen-credential reuse on alternating checks. Also caught a wrong import path to the maze module, and that forwarding the decoy's content-encoding header after fetch decompresses the body would corrupt responses.
- Fix: the design now requires a fresh RegExp per check, plus an example test that checks the same canary twice in a row.
- Compared to vibe coding: the regex bug is intermittent, so it would likely have shown up as a flaky demo rather than a clear error.

## Proxy and event stream (tasks 1-3)
- Feature used: Spec tasks, run one at a time with a checkpoint
- The requirements encoded build order (proxy + WebSocket stream first), so Kiro's tasks built them with the detector stubbed to "no signals". The dashboard could integrate before any detection logic existed.
- Kiro's checkpoint report was honest about coverage: "green" covered only the decoy header unit tests, and the end-to-end path was verified by hand, with automated tests scheduled for tasks 9.2-9.5.
- Compared to vibe coding: we'd likely have built the detector first because it's the interesting part, and Stage would have waited hours to connect.