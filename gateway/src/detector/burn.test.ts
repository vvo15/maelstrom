/**
 * Property test for burn accounting (task 6.3).
 *
 * Feature: siren-gateway, Property 6: Non-decreasing burn totals
 * For all sequences of estimateBurn return values (including negative, NaN,
 * and Infinity), folding through applyBurn yields running totals that never
 * decrease and never become NaN or Infinity.
 *
 * **Validates: Requirements 7.2, 7.3, 7.4 (Property 6)**
 */
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { applyBurn, clampBurnValue } from "./burn";

// Full finite non-negative range, negatives, and pathological values.
const rawBurnValue = fc.oneof(
  fc.double({ min: 0, noNaN: true, noDefaultInfinity: true }),
  fc.double({ max: -Number.MIN_VALUE, noNaN: true }),
  fc.constantFrom(NaN, Infinity, -Infinity),
);

describe("Property 6: Non-decreasing burn totals", () => {
  it("running totals folded through applyBurn never decrease and stay finite", () => {
    fc.assert(
      fc.property(fc.array(rawBurnValue, { minLength: 0, maxLength: 50 }), (raws) => {
        let total = 0;
        for (const raw of raws) {
          const next = applyBurn(total, raw);
          expect(next).toBeGreaterThanOrEqual(total);
          expect(Number.isFinite(next)).toBe(true);
          // The clamped addend itself must be a finite value >= 0.
          const addend = clampBurnValue(raw);
          expect(Number.isFinite(addend) && addend >= 0).toBe(true);
          total = next;
        }
      }),
      { numRuns: 100 },
    );
  });
});
