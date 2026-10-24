/**
 * Property + example tests for the JSONL replay log (task 9.7).
 *
 * Feature: siren-gateway, Property 7: Replay round-trip
 * For all valid SirenEvent values, parseEvent(serializeEvent(ev)) deep-equals
 * ev, and every serialized line contains no embedded newline.
 *
 * **Validates: Requirements 9.1, 9.8 (Property 7)**
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { SirenEvent } from "../../../shared/events";
import { ReplayWriter, parseEvent, serializeEvent } from "./replay";

/*
 * Generator domain: values the gateway can actually emit.
 *
 * - Strings (path, user_agent, body_snippet, model_claim, stated_goal,
 *   prediction fields) are full-unicode, built from code points that include
 *   lone surrogates, and are biased toward the characters that matter for a
 *   one-line JSONL format: "\n", "\r", "\u2028", "\u2029", quotes, backslashes
 *   and lone high/low surrogates. body_snippet is capped at 500 UTF-16 code
 *   units via slice(0, 500), same as the gateway (which may split a pair).
 * - session_id: 16 lowercase hex chars.
 * - ts: integer ms epoch in [0, Number.MAX_SAFE_INTEGER].
 * - status: integer 100..599. ai_score: integer 0..100.
 * - est_tokens_burned / est_usd_burned: finite doubles >= 0, including 0,
 *   Number.MIN_VALUE, Number.MAX_VALUE and fractional values. applyBurn
 *   guarantees finite, non-negative, +0-normalized totals.
 * - NaN, +/-Infinity and -0 are deliberately excluded from every numeric
 *   field: JSON cannot represent them, and the gateway never produces them.
 * - signals: a subarray of the five signal names. route: "decoy" | "maze".
 * - Optional fields (model_claim, stated_goal, prediction) are either present
 *   or truly absent (no `key: undefined`), so strict deep equality is meaningful.
 */

const SPECIAL_CHARS = ["\n", "\r", "\u2028", "\u2029", '"', "'", "\\", "\uD800", "\uDBFF", "\uDC00", "\uDFFF", "\u0000", "\t"];

const unicodeChar = fc.oneof(
  fc.constantFrom(...SPECIAL_CHARS),
  fc.string({ unit: "binary", minLength: 1, maxLength: 1 }),
);

const unicodeString = (maxLength = 64) => fc.string({ unit: unicodeChar, maxLength });

const hexChar = fc.constantFrom(..."0123456789abcdef".split(""));
const sessionId = fc.string({ unit: hexChar, minLength: 16, maxLength: 16 });

// Finite, non-negative, never -0.
const burnValue = fc
  .oneof(
    fc.constantFrom(0, Number.MIN_VALUE, Number.MAX_VALUE, 0.5, 1e-9, 123.456),
    fc.double({ min: 0, noNaN: true, noDefaultInfinity: true }),
  )
  .map((d) => (d === 0 ? 0 : d));

const SIGNALS = ["bait_followed", "canary_reused", "think_pauses", "enumeration", "scripted_ua"];

const prediction = fc.record({
  likely_goal: unicodeString(),
  current_step: unicodeString(),
  predicted_next_path: unicodeString(),
}, { noNullPrototype: true });

const sirenEvent: fc.Arbitrary<SirenEvent> = fc.record(
  {
    session_id: sessionId,
    ts: fc.maxSafeNat(),
    method: fc.constantFrom("GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"),
    path: unicodeString(),
    user_agent: unicodeString(),
    body_snippet: unicodeString(500).map((s) => s.slice(0, 500)),
    status: fc.integer({ min: 100, max: 599 }),
    route: fc.constantFrom("decoy" as const, "maze" as const),
    ai_score: fc.integer({ min: 0, max: 100 }),
    signals: fc.subarray(SIGNALS),
    flagged: fc.boolean(),
    model_claim: unicodeString(),
    stated_goal: unicodeString(),
    est_tokens_burned: burnValue,
    est_usd_burned: burnValue,
    prediction,
  },
  {
    requiredKeys: [
      "session_id",
      "ts",
      "method",
      "path",
      "user_agent",
      "body_snippet",
      "status",
      "route",
      "ai_score",
      "signals",
      "flagged",
      "est_tokens_burned",
      "est_usd_burned",
    ],
    noNullPrototype: true,
  },
);

describe("Property 7: Replay round-trip", () => {
  it("parseEvent(serializeEvent(ev)) deep-equals ev and the line has no embedded newline", () => {
    fc.assert(
      fc.property(sirenEvent, (ev) => {
        const line = serializeEvent(ev);
        expect(line.includes("\n")).toBe(false);
        expect(line.includes("\r")).toBe(false);
        expect(parseEvent(line)).toStrictEqual(ev);
      }),
      { numRuns: 200 },
    );
  });
});

describe("ReplayWriter", () => {
  it("appends one parseable line per event to <start>.jsonl", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "siren-replay-"));
    try {
      const start = 1700000000000;
      const writer = new ReplayWriter(dir, start);
      const base: SirenEvent = {
        session_id: "0123456789abcdef",
        ts: start,
        method: "GET",
        path: "/",
        user_agent: "curl/8.0",
        body_snippet: "",
        status: 200,
        route: "decoy",
        ai_score: 0,
        signals: [],
        flagged: false,
        est_tokens_burned: 0,
        est_usd_burned: 0,
      };
      const events: SirenEvent[] = [
        base,
        { ...base, ts: start + 1, path: "/robots.txt", body_snippet: "line1\nline2\u2028", signals: ["scripted_ua"] },
        {
          ...base,
          ts: start + 2,
          route: "maze",
          ai_score: 87,
          flagged: true,
          model_claim: "gpt-x",
          stated_goal: "find admin",
          est_tokens_burned: 1234,
          est_usd_burned: 0.0042,
          prediction: { likely_goal: "creds", current_step: "recon", predicted_next_path: "/.env" },
        },
      ];
      for (const ev of events) writer.append(ev);

      expect(fs.readdirSync(dir)).toEqual([`${start}.jsonl`]);
      const lines = fs.readFileSync(path.join(dir, `${start}.jsonl`), "utf8").split("\n");
      expect(lines.at(-1)).toBe(""); // trailing newline after the last event
      const content = lines.slice(0, -1);
      expect(content).toHaveLength(3);
      content.forEach((line, i) => expect(parseEvent(line)).toStrictEqual(events[i]));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
