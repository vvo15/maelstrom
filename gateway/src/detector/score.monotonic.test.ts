/**
 * Property test for the session-update fold over detectSignals + scoreSignals
 * (task 4.10).
 *
 * Feature: siren-gateway, Property 2: Monotonic score
 * For all sequences of requests folded through the session-update logic, the
 * ai_score after each request is greater than or equal to the ai_score before
 * that request.
 *
 * **Validates: Requirements 5.2, 4.6 (Property 2)**
 */
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { SirenEvent } from "../../../shared/events";
import { BAIT_PATHS, canaryFor, type CanaryKind } from "../../../shared/contracts";
import type { Signal } from "../types";
import { detectSignals, SCRIPTED_UA_TOKENS, type RequestMeta } from "./signals";
import { scoreSignals } from "./score";

const SESSION_ID = "0123456789abcdef";

type Step = { req: RequestMeta; status: number };

/**
 * Pure mirror of the design's session update (the production fold is wired
 * in task 6.4). Signals accumulate in a Set so each is recorded at most once
 * (Req 4.6); the score is recomputed from the whole set (Req 5.2).
 */
function foldScores(steps: Step[]): number[] {
  const history: SirenEvent[] = [];
  const recorded = new Set<Signal>();
  const scores: number[] = [];
  for (const { req, status } of steps) {
    for (const s of detectSignals(history, req)) recorded.add(s);
    const aiScore = scoreSignals(recorded);
    scores.push(aiScore);
    history.push({
      session_id: SESSION_ID,
      ts: req.ts,
      method: req.method,
      path: req.path,
      user_agent: req.userAgent,
      body_snippet: req.body.slice(0, 500),
      status,
      route: "decoy",
      ai_score: aiScore,
      signals: [...recorded],
      flagged: false,
      est_tokens_burned: 0,
      est_usd_burned: 0,
    });
  }
  return scores;
}

// --- Generators -----------------------------------------------------------

const hexSessionId = fc
  .array(fc.constantFrom(..."0123456789abcdef".split("")), { minLength: 16, maxLength: 16 })
  .map((cs) => cs.join(""));

const canary = fc
  .tuple(hexSessionId, fc.constantFrom<CanaryKind>("DBPASS", "APIKEY", "ADMINTOKEN"))
  .map(([id, kind]) => canaryFor(id, kind));

/** Text that sometimes embeds a valid canary. */
const maybeCanaryText = fc.oneof(
  { weight: 4, arbitrary: fc.string() },
  { weight: 1, arbitrary: fc.tuple(fc.string(), canary, fc.string()).map(([a, c, b]) => a + c + b) },
);

const path = fc.oneof(
  { weight: 3, arbitrary: fc.string() },
  { weight: 3, arbitrary: fc.stringMatching(/^\/[a-z]{1,8}(\/[a-z0-9]{1,6})?$/) },
  { weight: 1, arbitrary: fc.constantFrom(...BAIT_PATHS) },
  { weight: 1, arbitrary: fc.tuple(fc.constantFrom(...BAIT_PATHS), fc.string()).map(([b, s]) => b + s) },
);

const userAgent = fc.oneof(
  { weight: 3, arbitrary: fc.string() },
  { weight: 1, arbitrary: fc.constantFrom("Mozilla/5.0 (Macintosh)", "curl/8.0", "python-requests/2.31", "axios/1.6") },
  {
    weight: 1,
    arbitrary: fc.tuple(fc.string(), fc.constantFrom(...SCRIPTED_UA_TOKENS), fc.boolean()).map(
      ([pre, tok, upper]) => pre + (upper ? tok.toUpperCase() : tok),
    ),
  },
);

/** Mostly increasing timeline: short, medium, long and window-busting gaps, rare small regressions. */
const gap = fc.oneof(
  { weight: 4, arbitrary: fc.integer({ min: 0, max: 799 }) },
  { weight: 2, arbitrary: fc.integer({ min: 800, max: 2000 }) },
  { weight: 3, arbitrary: fc.integer({ min: 2001, max: 10_000 }) },
  { weight: 1, arbitrary: fc.integer({ min: 60_001, max: 120_000 }) },
  { weight: 1, arbitrary: fc.integer({ min: -1_000, max: -1 }) },
);

const rawStep = fc.record({
  gap,
  method: fc.oneof(fc.constantFrom("GET", "POST", "PUT", "DELETE", "HEAD"), fc.string()),
  path,
  query: fc.oneof(fc.constant(""), maybeCanaryText.map((q) => `?q=${q}`)),
  body: maybeCanaryText,
  userAgent,
  headerValues: fc.array(maybeCanaryText, { maxLength: 4 }),
  status: fc.constantFrom(200, 403, 404, 500),
});

const steps = fc
  .tuple(fc.integer({ min: 1_700_000_000_000, max: 1_800_000_000_000 }), fc.array(rawStep, { minLength: 1, maxLength: 30 }))
  .map(([start, raws]): Step[] => {
    let ts = start;
    return raws.map((r) => {
      ts += r.gap;
      return {
        req: {
          method: r.method,
          path: r.path,
          url: r.path + r.query,
          body: r.body,
          userAgent: r.userAgent,
          headerValues: r.headerValues,
          ts,
        },
        status: r.status,
      };
    });
  });

describe("session-update fold", () => {
  // Feature: siren-gateway, Property 2: Monotonic score
  it("Property 2: ai_score never decreases across a request sequence", () => {
    fc.assert(
      fc.property(steps, (seq) => {
        const scores = foldScores(seq);
        let prev = 0;
        for (const s of scores) {
          expect(s).toBeGreaterThanOrEqual(prev);
          prev = s;
        }
      }),
      { numRuns: 200 },
    );
  });
});
