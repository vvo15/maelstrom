/**
 * Property test for routing + flag latching over flag-transition sequences
 * (task 4.11).
 *
 * Feature: siren-gateway, Property 3: Latched flag implies maze routing
 * For all request sequences that cause a Session to flag: the request that
 * first sets `flagged` true emits `flagged = true` and `route = "decoy"`, and
 * every request handled after it emits `flagged = true` and `route = "maze"`.
 *
 * **Validates: Requirements 5.3, 5.4, 6.1, 6.2, 6.3, 6.4, 9.4 (Property 3)**
 */
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { SirenEvent } from "../../../shared/events";
import { BAIT_PATHS, canaryFor, type CanaryKind } from "../../../shared/contracts";
import type { Signal } from "../types";
import { SCRIPTED_UA_TOKENS, type RequestMeta } from "./signals";
import type { RouteDecision } from "./route";
import { updateSession } from "./sessionUpdate";

const SESSION_ID = "0123456789abcdef";
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";

type Step = { req: RequestMeta; status: number };
type State = { history: SirenEvent[]; signals: Set<Signal>; flagged: boolean };
type Outcome = { route: RouteDecision; flagged: boolean };

/**
 * One request through the production `updateSession` (the same function
 * `io/server.ts` uses); the test only writes back its result and appends
 * the emitted-style event to `history`.
 */
function step(state: State, { req, status }: Step): Outcome {
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
  return { route, flagged };
}

function run(steps: Step[]): Outcome[] {
  const state: State = { history: [], signals: new Set(), flagged: false };
  return steps.map((s) => step(state, s));
}

function meta(
  path: string,
  ts: number,
  opts: Partial<Omit<RequestMeta, "path" | "ts">> = {}
): RequestMeta {
  return {
    method: opts.method ?? "GET",
    path,
    url: opts.url ?? path,
    body: opts.body ?? "",
    userAgent: opts.userAgent ?? BROWSER_UA,
    headerValues: opts.headerValues ?? [BROWSER_UA],
    ts,
  };
}

// Benign prefix: alphanumeric non-bait paths, browser UA, no canary, and
// timestamps 100 s apart (no short gaps -> no think_pauses; each 60 s
// enumeration window holds at most one prior request -> no enumeration).
const BENIGN_SPACING_MS = 100_000;
const benignPathArb = fc
  .stringMatching(/^[a-z0-9]{1,12}$/)
  .map((s) => `/pages/${s}`);
const benignPrefixArb = fc.array(
  fc.record({ path: benignPathArb, status: fc.constantFrom(200, 301, 404) }),
  { minLength: 0, maxLength: 10 }
);

// Crossing request: a bait path (exact or with suffix) -> bait_followed (60).
const baitPathArb = fc
  .tuple(fc.constantFrom(...BAIT_PATHS), fc.constantFrom("", "/", "x", "/step2", "-now"))
  .map(([b, s]) => b + s);

// Suffix: arbitrary content, including more signals.
const anyUaArb = fc.oneof(
  fc.constant(BROWSER_UA),
  fc.constantFrom(...SCRIPTED_UA_TOKENS).map((t) => `${t}/1.0`),
  fc.string({ maxLength: 40 })
);
const anyPathArb = fc.oneof(
  benignPathArb,
  baitPathArb,
  fc.string({ maxLength: 30 }).map((s) => `/${s}`)
);
const anyBodyArb = fc.oneof(
  fc.string({ maxLength: 60 }),
  fc
    .constantFrom<CanaryKind>("DBPASS", "APIKEY", "ADMINTOKEN")
    .map((k) => `password=${canaryFor(SESSION_ID, k)}`)
);
const suffixArb = fc.array(
  fc.record({
    path: anyPathArb,
    body: anyBodyArb,
    userAgent: anyUaArb,
    method: fc.constantFrom("GET", "POST"),
    gap: fc.integer({ min: 0, max: 5000 }),
    status: fc.constantFrom(200, 302, 403, 404, 500),
  }),
  { minLength: 0, maxLength: 15 }
);

describe("Property 3: latched flag implies maze routing", () => {
  it("first-flagging request routes to decoy; every later request routes to maze", () => {
    fc.assert(
      fc.property(
        benignPrefixArb,
        baitPathArb,
        suffixArb,
        fc.integer({ min: 1_600_000_000_000, max: 1_900_000_000_000 }),
        (prefix, baitPath, suffix, t0) => {
          const steps: Step[] = [];
          let ts = t0;
          for (const p of prefix) {
            steps.push({ req: meta(p.path, ts), status: p.status });
            ts += BENIGN_SPACING_MS;
          }
          steps.push({ req: meta(baitPath, ts), status: 200 });
          for (const s of suffix) {
            ts += s.gap;
            steps.push({
              req: meta(s.path, ts, {
                method: s.method,
                body: s.body,
                userAgent: s.userAgent,
                headerValues: [s.userAgent],
              }),
              status: s.status,
            });
          }

          const out = run(steps);
          const k = prefix.length;
          for (let i = 0; i < k; i++) {
            expect(out[i]).toEqual({ route: "decoy", flagged: false });
          }
          expect(out[k]).toEqual({ route: "decoy", flagged: true });
          for (let i = k + 1; i < out.length; i++) {
            expect(out[i]).toEqual({ route: "maze", flagged: true });
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it("example: benign, then /verify, then two more requests", () => {
    const out = run([
      { req: meta("/index.php", 1_000), status: 200 },
      { req: meta("/verify", 200_000, { url: "/verify?agent=x" }), status: 200 },
      { req: meta("/admin", 201_000), status: 403 },
      { req: meta("/pages/a", 202_000), status: 200 },
    ]);
    expect(out).toEqual([
      { route: "decoy", flagged: false },
      { route: "decoy", flagged: true },
      { route: "maze", flagged: true },
      { route: "maze", flagged: true },
    ]);
  });
});
