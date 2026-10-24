import { describe, it, expect, beforeAll } from "vitest";
import fc from "fast-check";
import { canaryFor, CANARY_REGEX, DECOY_HEADERS, type CanaryKind } from "../../../shared/contracts";
import type { SirenEvent } from "../../../shared/events";
import { generateMock, ALLOWED_STATUS, depthOf } from "./mock";
import { sanitize, containsRealSecret, escapeHtml, containsRawHtml } from "./sanitize";
import { estimateBurn } from "./burn";
import { SirenMaze } from "./index";
import { predictMock } from "./predict";
import { techniquesForSession, techniquesForEvents } from "./attack";

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
  // Known real-secret shapes plus fully arbitrary strings and glued-together
  // fragments, so the fuzzer actively tries to construct a secret the
  // sanitizer misses (e.g. by concatenation across boundaries).
  const realSecretArb = fc.oneof(
    fc.constant("AKIAIOSFODNN7EXAMPLE"),
    fc.constant("sk-ant-api03-" + "a".repeat(40)),
    fc.constant("sk-" + "b".repeat(40)),
    fc.constant("ghp_" + "c".repeat(36)),
    fc.constant("gho_" + "c".repeat(36)),
    fc.constant("-----BEGIN RSA PRIVATE KEY-----"),
    fc.constant("-----BEGIN OPENSSH PRIVATE KEY-----"),
    fc.constant("AIza" + "d".repeat(35)),
    fc.constant("xoxb-" + "9".repeat(24)),
    fc.string()
  );

  it("sanitize(x) output never matches a real secret pattern, for any input x", () => {
    fc.assert(
      fc.property(
        sessionIdArb,
        fc.array(realSecretArb, { maxLength: 8 }),
        fc.string(),
        (sid, parts, glue) => {
          const input = parts.join(glue);
          const out = sanitize(input, sid);
          expect(containsRealSecret(out)).toBe(false);
        }
      )
    );
  });

  it("sanitize is stable: re-sanitizing already-clean output stays clean", () => {
    fc.assert(
      fc.property(sessionIdArb, fc.array(realSecretArb, { maxLength: 8 }), (sid, parts) => {
        const once = sanitize(parts.join("|"), sid);
        const twice = sanitize(once, sid);
        expect(containsRealSecret(twice)).toBe(false);
      })
    );
  });
});

describe("Maze property: no reflected markup escapes (XSS-safe)", () => {
  // Hostile path segments that try to break out of the surrounding HTML.
  const hostileSegArb = fc.oneof(
    segArb,
    fc.constant("<script>alert(1)</script>"),
    fc.constant('"><img src=x onerror=alert(1)>'),
    fc.constant("</title><svg onload=alert(1)>"),
    fc.constant("'\"></a>"),
    fc.string()
  );
  const hostilePathArb = fc
    .array(hostileSegArb, { minLength: 1, maxLength: 4 })
    .map((segs) => "/" + segs.join("/"));

  it("escapeHtml output never contains a raw HTML-breaking character", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        expect(containsRawHtml(escapeHtml(s))).toBe(false);
      })
    );
  });

  it("a hostile request path is reflected only as escaped text, never raw markup", () => {
    fc.assert(
      fc.property(sessionIdArb, hostilePathArb, (sid, path) => {
        const { status, body } = generateMock(sid, path);
        if (status === 200) {
          // The reflected path inside <h2>Index of ...</h2> must contain no raw
          // breakout characters -- they are all entity-encoded.
          const h2 = body.match(/<h2>Index of ([^]*?)<\/h2>/);
          expect(h2).not.toBeNull();
          expect(h2![1]).not.toMatch(/[<>"']/);
          // href attribute values are likewise free of raw breakout characters.
          for (const m of body.matchAll(/href="([^"]*)"/g)) {
            expect(m[1]).not.toMatch(/[<>']/);
          }
        } else {
          // Error pages reflect the hint inside an HTML comment "<!-- try ... -->".
          // The reflected hint must contain no raw breakout characters either.
          const hint = body.match(/<!-- try ([^]*?) -->/);
          expect(hint).not.toBeNull();
          expect(hint![1]).not.toMatch(/[<>"']/);
        }
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

describe("Maze property: links only go deeper, never out (anti-escape)", () => {
  it("every 200 page links to at least one strictly-deeper path", () => {
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

  it("no link on any 200 page is shallower than or equal to the request (cannot climb out)", () => {
    fc.assert(
      fc.property(sessionIdArb, pathArb, (sid, path) => {
        const res = generateMock(sid, path);
        if (res.status !== 200) return;
        const hrefs = [...res.body.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
        const reqDepth = depthOf(path);
        for (const h of hrefs) {
          // Links are built under the request path, so each must be deeper.
          expect(depthOf(h)).toBeGreaterThan(reqDepth);
          expect(h.startsWith("/")).toBe(true);
        }
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

describe("ATT&CK mapping is deterministic and uses only verified IDs", () => {
  const VERIFIED_IDS = new Set(["T1595", "T1595.003", "T1552.001", "T1078", "T1190"]);
  const SIGNALS = ["bait_followed", "canary_reused", "think_pauses", "enumeration", "scripted_ua"];
  const signalArb = fc.subarray(SIGNALS);

  it("only ever emits verified technique IDs with a url and rationale", () => {
    fc.assert(
      fc.property(signalArb, fc.array(pathArb, { maxLength: 8 }), (signals, paths) => {
        const techs = techniquesForSession(signals, paths);
        for (const t of techs) {
          expect(VERIFIED_IDS.has(t.id)).toBe(true);
          expect(t.url.startsWith("https://attack.mitre.org/")).toBe(true);
          expect(t.rationale.length).toBeGreaterThan(0);
        }
      })
    );
  });

  it("is deterministic and de-duplicated (no repeated IDs, stable order)", () => {
    fc.assert(
      fc.property(signalArb, fc.array(pathArb, { maxLength: 8 }), (signals, paths) => {
        const a = techniquesForSession(signals, paths);
        const b = techniquesForSession(signals, paths);
        expect(b.map((t) => t.id)).toEqual(a.map((t) => t.id));
        const ids = a.map((t) => t.id);
        expect(new Set(ids).size).toBe(ids.length);
      })
    );
  });

  it("maps canary reuse to Valid Accounts (T1078) and enumeration to scanning", () => {
    const reuse = techniquesForSession(["canary_reused"], ["/staff/portal"]);
    expect(reuse.some((t) => t.id === "T1078")).toBe(true);

    const enumer = techniquesForSession(["enumeration"], ["/a", "/b"]);
    expect(enumer.some((t) => t.id === "T1595")).toBe(true);
    expect(enumer.some((t) => t.id === "T1595.003")).toBe(true);
  });

  it("derives techniques from an event timeline (union of signals and paths)", () => {
    const events: SirenEvent[] = [
      { ...fakeEvent("abcd000000000000", "/.env"), signals: ["bait_followed"] },
      { ...fakeEvent("abcd000000000000", "/admin/console"), signals: ["enumeration"] },
    ];
    const techs = techniquesForEvents(events);
    const ids = techs.map((t) => t.id);
    expect(ids).toContain("T1552.001"); // credentials in files (.env)
    expect(ids).toContain("T1190"); // exploit public-facing app (admin/console)
    expect(ids).toContain("T1595"); // active scanning (enumeration)
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
