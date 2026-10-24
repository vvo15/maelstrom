/**
 * Property test for detector/sessionId.ts (task 4.2).
 *
 * Feature: siren-gateway, Property 4: Deterministic session id shape
 * For all (sourceIp, userAgent) string pairs, deriveSessionId returns a value
 * matching /^[0-9a-f]{16}$/, and two calls with equal inputs return identical
 * values.
 *
 * **Validates: Requirements 1.1, 1.3, 10.2**
 */
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { deriveSessionId } from "./sessionId";

const SESSION_ID_SHAPE = /^[0-9a-f]{16}$/;

// Mix of unicode-capable strings (full code points incl. astral planes, and
// grapheme clusters) plus the empty string, weighted in explicitly so it is
// exercised on every run.
const inputString = fc.oneof(
  fc.constant(""),
  fc.string({ unit: "binary" }),
  fc.string({ unit: "grapheme" }),
  fc.string(),
);

describe("deriveSessionId", () => {
  // Feature: siren-gateway, Property 4: Deterministic session id shape
  it("Property 4: returns 16 lowercase hex chars and is deterministic", () => {
    fc.assert(
      fc.property(fc.tuple(inputString, inputString), ([sourceIp, userAgent]) => {
        const first = deriveSessionId(sourceIp, userAgent);
        // Re-derive from fresh copies so equality is by value, not identity.
        const second = deriveSessionId(
          String(sourceIp.slice()),
          String(userAgent.slice()),
        );
        expect(first).toMatch(SESSION_ID_SHAPE);
        expect(second).toBe(first);
      }),
      { numRuns: 200 },
    );
  });
});
