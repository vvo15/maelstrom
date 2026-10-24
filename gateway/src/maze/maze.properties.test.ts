import { describe, it, expect, beforeAll } from "vitest";
import fc from "fast-check";
import { canaryFor, CANARY_REGEX, DECOY_HEADERS, type CanaryKind } from "../../../shared/contracts";
import type { SirenEvent } from "../../../shared/events";
import { generateMock, ALLOWED_STATUS, depthOf } from "./mock";
import { sanitize, containsRealSecret } from "./sanitize";
import { estimateBurn } from "./burn";
import { SirenMaze } from "./index";
import { predictMock } from "./predict";

// All properties run in mock mode (no API key), which is the demo/judge path.
beforeAll(() => {
  process.env.SIREN_LLM = "mock";
  delete process.env.ANTHROPIC_API_KEY;
});

// A 16-lowercase-hex session id, matching the gateway's session_id shape.
const HEX = "0123456789abcdef".split("");
const sessionIdArb = fc.string({
  unit: fc.constantFrom(...HEX),
  minLength: 16,
  maxLength: 16,
});

// A single plausible path segment (letters, digits, dot, dash, underscore).
const SEG_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789._-".split("");
const segArb = fc.string({
  unit: fc.constantFrom(...SEG_CHARS),
  minLength: 1,
  maxLength: 12,
});

// Plausible request paths.
const pathArb = fc.oneof(
  fc.constant("/"),
  fc.array(segArb, { minLength: 1, maxLength: 5 }).map((segs) => "/" + segs.join("/"))
);

describe("Maze property: determinism (Requirement R2)", () => {
  it("generate() is byte-identical for the same (session_id, path), regardless of history", () => {
    fc.assert(
      fc.property(sessionIdArb, pathArb, (sid, path) => {
        const a = generateMock(sid, path);
        const b = generateMock(sid, path);
        expect(b.status).toBe(a.status);
        expect(b.body).toBe(a.body);
        expect(b.headers).toEqual(a.headers);
      })
    );
  });

  it("SirenMaze.generate() cache returns byte-identical content across calls and histories", async () => {
    const maze = new SirenMaze();
    await fc.assert(
      fc.asyncProperty(sessionIdArb, pathArb, async (sid, path) => {
        const first = await maze.generate({
          session_id: sid,
          method: "GET",
          path,
          body: "",
          history: [],
        });
        const second = await maze.generate({
          session_id: sid,
          method: "POST",
          path,
          body: "different body",
          history: [fakeEvent(sid, path)],
        });
        expect(second.body).toBe(first.body);
        expect(second.status).toBe(first.status);
        expect(second.headers).toEqual(first.headers);
      })
    );
  });
});

describe("Maze property: every SIREN_ string is a real canary (Requirement R4)", () => {
  it("every SIREN_<kind>_<slice> in output equals canaryFor(session_id, kind)", () => {
    fc.assert(
      fc.property(sessionIdArb, pathArb, (sid, path) => {
        const { body } = generateMock(sid, path);
        const matches = body.match(CANARY_REGEX) ?? [];
        const valid = new Set<string>(
          (["DBPASS", "APIKEY", "ADMINTOKEN"] as CanaryKind[]).map((k) => canaryFor(sid, k))
        );
        for (const m of matches) {
          expect(valid.has(m)).toBe(true);
        }
      })
    );
  });
});

describe("Maze property: sanitize never leaks real secrets (Requirement R4)", () => {
  it("sanitize(x) output never matches a real secret pattern, for any input x", () => {
    const realSecretArb = fc.oneof(
      fc.constant("AKIAIOSFODNN7EXAMPLE"),
      fc.constant("sk-ant-api03-" + "a".repeat(40)),
      fc.constant("sk-" + "b".repeat(40)),
      fc.constant("ghp_" + "c".repeat(36)),
      fc.constant("-----BEGIN RSA PRIVATE KEY-----"),
      fc.constant("AIza" + "d".repeat(35)),
      fc.string()
    );
    fc.assert(
      fc.property(sessionIdArb, fc.array(realSecretArb, { maxLength: 6 }), (sid, parts) => {
        const input = parts.join(" and also ");
        const out = sanitize(input, sid);
        expect(containsRealSecret(out)).toBe(false);
      })
    );
  });
});

describe("Maze property: status and headers (Requirement R?)", () => {
  it("status is always in the allowed set and headers always include DECOY_HEADERS", () => {
    fc.assert(
      fc.property(sessionIdArb, pathArb, (sid, path) => {
        const res = generateMock(sid, path);
        expect((ALLOWED_STATUS as readonly number[]).includes(res.status)).toBe(true);
        for (const [k, v] of Object.entries(DECOY_HEADERS)) {
          expect(res.headers[k]).toBe(v);
        }
      })
    );
  });
});

describe("Maze property: estimateBurn is non-negative and monotonic (Requirement R?)", () => {
  it("never returns negative values", () => {
    fc.assert(
      fc.property(fc.string(), fc.option(fc.string(), { nil: undefined }), (body, model) => {
        const { tokens, usd } = estimateBurn(body, model);
        expect(tokens).toBeGreaterThanOrEqual(0);
        expect(usd).toBeGreaterThanOrEqual(0);
      })
    );
  });

  it("never decreases as the body grows", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), fc.option(fc.string(), { nil: undefined }), (a, extra, model) => {
        const shorter = estimateBurn(a, model);
        const longer = estimateBurn(a + extra, model);
        expect(longer.tokens).toBeGreaterThanOrEqual(shorter.tokens);
        expect(longer.usd).toBeGreaterThanOrEqual(shorter.usd);
      })
    );
  });
});

describe("Maze property: 200 pages link deeper (Requirement R5/R?)", () => {
  it("every 200 page links to at least one path strictly deeper than the requested one", () => {
    fc.assert(
      fc.property(sessionIdArb, pathArb, (sid, path) => {
        const res = generateMock(sid, path);
        if (res.status !== 200) return; // property only constrains 200 pages
        const hrefs = [...res.body.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
        expect(hrefs.length).toBeGreaterThan(0);
        const reqDepth = depthOf(path);
        const deeper = hrefs.filter((h) => depthOf(h) > reqDepth);
        expect(deeper.length).toBeGreaterThan(0);
      })
    );
  });
});

describe("predictMock is deterministic and path-shaped", () => {
  it("returns a predicted_next_path starting with '/'", () => {
    fc.assert(
      fc.property(sessionIdArb, fc.array(pathArb, { minLength: 1, maxLength: 15 }), (sid, paths) => {
        const history = paths.map((p) => fakeEvent(sid, p));
        const pred = predictMock(history);
        expect(pred).toBeDefined();
        expect(pred!.predicted_next_path.startsWith("/")).toBe(true);
      })
    );
  });
});

function fakeEvent(sid: string, path: string): SirenEvent {
  return {
    session_id: sid,
    ts: Date.now(),
    method: "GET",
    path,
    user_agent: "python-httpx/0.27.0",
    body_snippet: "",
    status: 200,
    route: "maze",
    ai_score: 60,
    signals: ["bait_followed"],
    flagged: true,
    est_tokens_burned: 0,
    est_usd_burned: 0,
  };
}
