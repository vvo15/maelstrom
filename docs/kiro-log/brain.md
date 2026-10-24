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

## Property-based testing caught an overflow bug
- Feature used: PBT with fast-check (Property 6: burn totals never decrease and stay finite)
- Property 6 failed in 3 of 7 runs. Shrunk counterexample: [1.0977e+293, 1.7977e+308]. Both values are finite and non-negative, so the clamp passed them through, but their sum overflowed past Number.MAX_VALUE and the total became Infinity.
- A unit test with realistic numbers would never have hit this. Fix: saturate the total at Number.MAX_VALUE, and add Requirement 7.5 so the spec covers overflow.
- Also: Kiro's task runner refused untracked work, so the scripted-attacker test was added to the spec as task 4.12 instead of being slipped in. The spec stayed the single source of truth.

## Shared session-update function (task 6)
- The Property 2 and 3 tests had been checking a test-only helper, not the real server logic. Task 6.4 extracted one pure updateSession function used by server.ts AND the tests, so the properties now test the code that actually runs.
- While wiring it, Kiro found server.ts never appended to session.history or incremented requestCount. The detection windows, the maze, and prediction all depend on those, so they would have silently never worked.
- End-to-end check: scripted attacker flagged at request 5 (/verify, score 70), still served the decoy page, then routed to the maze; burn totals strictly increasing.

## Property 7 failure was a test bug, not a product bug
- Property 7 (replay round-trip) failed on the smallest possible event. Shrinking 26 times reduced it to an event with every field at its minimum, which pointed straight at the cause: fast-check 4's fc.record can build null-prototype objects, and JSON.parse never does, so toStrictEqual failed even though every value matched.
- Fix: noNullPrototype: true in the generator. We kept toStrictEqual instead of loosening to toEqual, because the strict check still catches a key: undefined that JSON would silently drop.
- Lesson: shrinking made the difference between a real format bug and a test-setup artifact obvious within minutes.

## Gateway spec complete
- 23 tests in 14 files, all 7 correctness properties covered, green on 5 consecutive runs.
- Kiro verified the history-snapshot test is meaningful by temporarily reverting the fix: the test failed (5 events where 3 were expected), proving it guards the behavior.
- Final end-to-end run through the real entry point: 4 decoy requests, /verify flagged at score 70 but still served by the decoy, 5 maze requests; replay file and WebSocket stream had 10 matching events.

## Integration 2 on the real stack
- docker compose (real PHP decoy + gateway): scripted sequence with the python-httpx user agent.
- Result: 4 requests to the decoy at score 10; /verify flagged at score 70 but still served by the decoy; /staff/portal and /admin routed to the maze.
- The routing rule fixed during requirements review (route on the pre-scoring flag) is exactly what makes the /verify bait page reachable in the real system.

## Bugfix spec: decoy request headers
- Feature used: Bug Fix spec (separate bugfix.md record, design, tasks)
- Found during Integration 2: the decoy's Apache logs showed every request with user agent "node". The gateway forwarded only method, path and body, so Content-Type (form POSTs), Authorization and Cookie never reached the decoy.
- Root cause traced to our own spec: Requirement 2.2 listed only method, path and body, and our steering line "the decoy gets only the x-siren-session header added" reinforced it. The bugfix spec updated the requirement, the steering, the code, and added a regression test.
- Compared to a chat fix: the spec traced the bug to the requirement and steering that caused it, so it can't come back on the next Kiro run.

## Submission checks (Brain-owned)
- Secret scan of full git history (all branches): only test fixtures matched (AWS's documented example key AKIAIOSFODNN7EXAMPLE and bare PEM headers inside fc.constant property-test inputs). No real .env ever committed.
- Clean-clone check: fresh clone of vvo15/maestrom, cp .env.example .env, docker compose up --build decoy gateway → gateway responds 200.
- Kiro Web: started a cloud session from GitHub issue #3 (replay validator) while continuing local work.

## Kiro Web (cloud agent)
- Created GitHub issue #3 (replay validator), connected the repo at app.kiro.dev, and ran it as an autonomous cloud session while I kept working locally on submission checks.
- Result: PR #4 touching exactly the 2 files the issue allowed, tested against valid, invalid and no-argument fixtures. It reported honestly that its sandbox blocked npm, so it couldn't run tsx; I verified it locally against real replay files from our Integration 2 Docker run.
- Compared to the IDE: zero setup on my machine and fully parallel, but the issue had to be self-contained and scoped by file. Good for well-bounded tasks, not for work that depends on local services.