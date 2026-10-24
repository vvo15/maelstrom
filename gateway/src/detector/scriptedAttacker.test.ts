/**
 * Example test for the scripted attacker sequence (task 4.12).
 *
 * A scripted agent (python-httpx UA) walks the decoy, reads the planted
 * instructions, and follows the bait to /verify. scripted_ua alone (10) stays
 * below the flag threshold (50); bait_followed (60) on /verify crosses it.
 * The flagging request still routes to decoy; the next one routes to maze.
 *
 * **Validates: Requirements 4.1, 4.5, 5.2, 5.3, 5.4, 6.1, 6.4**
 */
import { describe, expect, it } from "vitest";
import type { SirenEvent } from "../../../shared/events";
import type { Signal } from "../types";
import type { RequestMeta } from "./signals";
import type { RouteDecision } from "./route";
import { updateSession } from "./sessionUpdate";

const SESSION_ID = "0123456789abcdef";
const UA = "python-httpx/0.27.0";

type State = { history: SirenEvent[]; signals: Set<Signal>; flagged: boolean };
type Outcome = { route: RouteDecision; flagged: boolean; aiScore: number };

/**
 * One request through the production `updateSession` (the same function
 * `io/server.ts` uses); the test writes back its result and appends the
 * emitted-style event to `history`.
 */
function step(state: State, req: RequestMeta, status: number): Outcome {
  const u = updateSession(state, state.history, req);
  const { route, aiScore, flagged } = u;
  state.signals = u.signals;
  state.flagged = flagged;
  state.history.push({
    session_id: SESSION_ID,
    ts: req.ts,
    method: req.method,
    path: req.path,
    user_agent: req.userAgent,
    body_snippet: req.body.slice(0, 500),
    status,
    route,
    ai_score: aiScore,
    signals: [...state.signals],
    flagged,
    est_tokens_burned: 0,
    est_usd_burned: 0,
  });
  return { route, flagged, aiScore };
}

/** Builds RequestMeta from a raw path+query; `path` is query-stripped. */
function get(url: string, ts: number): RequestMeta {
  const q = url.indexOf("?");
  return {
    method: "GET",
    path: q === -1 ? url : url.slice(0, q),
    url,
    body: "",
    userAgent: UA,
    headerValues: [UA],
    ts,
  };
}

describe("scripted attacker sequence", () => {
  it("stays unflagged on decoy until /verify, then routes to maze", () => {
    const sequence: Array<[string, number]> = [
      ["/", 200],
      ["/robots.txt", 200],
      ["/.env", 404],
      ["/backup/README_ADMIN.txt", 200],
      ["/verify?agent=scripted-agent&task=assess+town+portal", 200],
      ["/admin", 200],
    ];

    const state: State = { history: [], signals: new Set(), flagged: false };
    const t0 = 1_700_000_000_000;
    const out = sequence.map(([url, status], i) =>
      step(state, get(url, t0 + i * 1000), status)
    );

    // Requests 1-4: scripted_ua only (10 < 50) -> decoy, not flagged.
    for (let i = 0; i < 4; i++) {
      expect(out[i]).toEqual({ route: "decoy", flagged: false, aiScore: 10 });
    }

    // Request 5 (/verify): bait_followed + scripted_ua = 70 -> flagged, but
    // routed on the pre-scoring state -> decoy.
    expect(state.history[4].path).toBe("/verify");
    expect(out[4]).toEqual({ route: "decoy", flagged: true, aiScore: 70 });
    expect(new Set(state.history[4].signals)).toEqual(
      new Set<Signal>(["bait_followed", "scripted_ua"])
    );

    // Request 6: session already flagged -> maze.
    expect(out[5].route).toBe("maze");
    expect(out[5].flagged).toBe(true);
  });
});
