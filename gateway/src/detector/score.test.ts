/**
 * Property test for detector/score.ts (task 4.8).
 *
 * Feature: siren-gateway, Property 1: Bounded score
 * For all subsets of the five Signals, scoreSignals(subset) returns an
 * integer greater than or equal to 0 and less than or equal to 100.
 *
 * **Validates: Requirements 5.2 (Property 1)**
 */
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { scoreSignals } from "./score";
import { SIGNALS } from "./signals";

describe("scoreSignals", () => {
  // Feature: siren-gateway, Property 1: Bounded score
  it("Property 1: returns an integer in [0, 100] for any subset of signals", () => {
    fc.assert(
      fc.property(fc.subarray([...SIGNALS]), (subset) => {
        const score = scoreSignals(subset);
        expect(Number.isInteger(score)).toBe(true);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      }),
      { numRuns: 100 },
    );
  });
});
