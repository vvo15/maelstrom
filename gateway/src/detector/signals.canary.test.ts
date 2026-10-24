/**
 * Property test for detector/signals.ts (task 4.4).
 *
 * Feature: siren-gateway, Property 5: Canary presence sets the signal
 * For any session id, canary kind, and placement (URL / body / one header
 * value), embedding canaryFor(sessionId, kind) in arbitrary surrounding text
 * makes detectSignals include "canary_reused".
 *
 * Stateful-global-regex guard: all iterations run in one process against the
 * shared, `g`-flagged CANARY_REGEX. If detection used .test()/.exec() on that
 * instance, its advancing lastIndex would cause misses on alternating
 * iterations and this property would fail.
 *
 * **Validates: Requirements 4.2 (Property 5)**
 */
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { canaryFor, type CanaryKind } from "../../../shared/contracts";
import { detectSignals, type RequestMeta } from "./signals";

// Real session id shape produced by deriveSessionId.
const sessionIdArb = fc.stringMatching(/^[0-9a-f]{16}$/);
const kindArb = fc.constantFrom<CanaryKind>("DBPASS", "APIKEY", "ADMINTOKEN");
const placementArb = fc.constantFrom("url", "body", "header" as const);

// Neutral request: no bait path, no canary, non-scripted UA.
function neutralRequest(): RequestMeta {
  return {
    method: "GET",
    path: "/",
    url: "/",
    body: "",
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)",
    headerValues: ["text/html", "en-US"],
    ts: 1_700_000_000_000,
  };
}

describe("detectSignals canary_reused", () => {
  // Feature: siren-gateway, Property 5: Canary presence sets the signal
  it("Property 5: canary anywhere in URL/body/one header sets canary_reused", () => {
    fc.assert(
      fc.property(
        sessionIdArb,
        kindArb,
        placementArb,
        fc.string(),
        fc.string(),
        (sessionId, kind, placement, prefix, suffix) => {
          const embedded = `${prefix}${canaryFor(sessionId, kind)}${suffix}`;
          const req = neutralRequest();
          if (placement === "url") {
            req.url = `/search?q=${embedded}`;
          } else if (placement === "body") {
            req.body = embedded;
          } else {
            req.headerValues = [...req.headerValues, embedded];
          }
          expect(detectSignals([], req)).toContain("canary_reused");
        },
      ),
      { numRuns: 200 },
    );
  });

  // Task 4.5 (example, non-property): the same canary on two consecutive
  // calls must be detected both times. A shared `g`-flagged regex used via
  // .test() would leave lastIndex advanced after the first match and miss
  // the second call. Validates: Requirements 4.2
  it("detects the same canary string on two consecutive calls", () => {
    const req = neutralRequest();
    req.body = `password=${canaryFor("0123456789abcdef", "DBPASS")}`;

    expect(detectSignals([], req)).toContain("canary_reused");
    expect(detectSignals([], req)).toContain("canary_reused");
  });
});
