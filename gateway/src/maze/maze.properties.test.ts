import { describe, it, expect, beforeAll } from "vitest";
import fc from "fast-check";
import { canaryFor, CANARY_REGEX, DECOY_HEADERS, type CanaryKind } from "../../../shared/contracts";
import type { SirenEvent } from "../../../shared/events";
import { generateMock, ALLOWED_STATUS, depthOf } from "./mock";
import { sanitize, containsRealSecret, escapeHtml, containsRawHtml } from "./sanitize";
import { estimateBurn, priceFor } from "./burn";
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

describe("Maze property: determinism and immutable cache (Requirement R2)", () => {
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

  it("SirenMaze.generate() shares one immutable response across calls and histories", async () => {
    const maze = new SirenMaze();
    await fc.assert(
      fc.asyncProperty(sessionIdArb, pathArb, async (sid, path) => {
        const firstRequest = {
          session_id: sid,
          method: "GET",
          path,
          body: "",
          history: [] as SirenEvent[],
        };
        const secondRequest = {
          session_id: sid,
          method: "POST",
          path,
          body: "different body",
          history: [fakeEvent(sid, path)],
        };
        const [first, concurrent] = await Promise.all([
          maze.generate(firstRequest),
          maze.generate(secondRequest),
        ]);
        const repeated = await maze.generate(secondRequest);

        expect(concurrent).toBe(first);
        expect(repeated).toBe(first);
        expect(repeated.body).toBe(first.body);
        expect(repeated.status).toBe(first.status);
        expect(repeated.headers).toEqual(first.headers);
        expect(Object.isFrozen(first)).toBe(true);
        expect(Object.isFrozen(first.headers)).toBe(true);
      })
    );
  });
});

describe("Maze property: at most one valid SIREN_ canary (Requirement R5)", () => {
  it("every canary matches canaryFor(session_id, kind), with at most one per page", () => {
    fc.assert(
      fc.property(sessionIdArb, pathArb, (sid, path) => {
        const { body } = generateMock(sid, path);
        const matches = body.match(CANARY_REGEX) ?? [];
        const valid = new Set<string>(
          (["DBPASS", "APIKEY", "ADMINTOKEN"] as CanaryKind[]).map((k) => canaryFor(sid, k))
        );
        expect(matches.length).toBeLessThanOrEqual(1);
        for (const match of matches) expect(valid.has(match)).toBe(true);
      })
    );
  });
});

describe("Maze property: sanitize never leaks real secrets (Requirement R6)", () => {
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
          const out = sanitize(parts.join(glue), sid);
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

describe("Maze property: no reflected markup escapes (Requirement R12)", () => {
  const hostileSegArb = fc.oneof(
    segArb,
    fc.constant("<script>alert(1)</script>"),
    fc.constant('\"><img src=x onerror=alert(1)>'),
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
          const h2 = body.match(/<h2>Index of ([^]*?)<\/h2>/);
          expect(h2).not.toBeNull();
          expect(h2![1]).not.toMatch(/[<>"']/);
          for (const match of body.matchAll(/href="([^"]*)"/g)) {
            expect(match[1]).not.toMatch(/[<>']/);
          }
        } else {
          const hint = body.match(/<!-- try ([^]*?) -->/);
          expect(hint).not.toBeNull();
          expect(hint![1]).not.toMatch(/[<>"']/);
        }
      })
    );
  });
});

describe("Maze property: status and headers (Requirement R9)", () => {
  it("status is always allowed and headers always include DECOY_HEADERS", () => {
    fc.assert(
      fc.property(sessionIdArb, pathArb, (sid, path) => {
        const res = generateMock(sid, path);
        expect((ALLOWED_STATUS as readonly number[]).includes(res.status)).toBe(true);
        for (const [key, value] of Object.entries(DECOY_HEADERS)) {
          expect(res.headers[key]).toBe(value);
        }
      })
    );
  });
});

describe("Maze property: burn estimate and model matching (Requirement R10)", () => {
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

  it("matches dotted and API-style hyphenated model versions to one price row", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("haiku", "sonnet", "opus", "fable"),
        (family) => {
          const version = family === "fable" ? "5.1" : family === "haiku" ? "4.5" : "5.5";
          const dotted = `claude-${family}-${version}`;
          const hyphenated = dotted.replaceAll(".", "-");
          expect(priceFor(hyphenated)).toEqual(priceFor(dotted));
        }
      )
    );
  });
});

describe("Maze property: links only go deeper, never out (Requirement R8)", () => {
  it("every 200 page links to at least one strictly-deeper path", () => {
    fc.assert(
      fc.property(sessionIdArb, pathArb, (sid, path) => {
        const res = generateMock(sid, path);
        if (res.status !== 200) return;
        const hrefs = [...res.body.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
        expect(hrefs.length).toBeGreaterThan(0);
        expect(hrefs.some((href) => depthOf(href) > depthOf(path))).toBe(true);
      })
    );
  });

  it("no link on any 200 page is shallower than or equal to the request", () => {
    fc.assert(
      fc.property(sessionIdArb, pathArb, (sid, path) => {
        const res = generateMock(sid, path);
        if (res.status !== 200) return;
        const hrefs = [...res.body.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
        for (const href of hrefs) {
          expect(depthOf(href)).toBeGreaterThan(depthOf(path));
          expect(href.startsWith("/")).toBe(true);
        }
      })
    );
  });
});

describe("Maze property: deterministic path-shaped prediction (Requirement R11)", () => {
  it("returns the same prediction with a next path beginning '/'", () => {
    fc.assert(
      fc.property(sessionIdArb, fc.array(pathArb, { minLength: 1, maxLength: 15 }), (sid, paths) => {
        const history = paths.map((path) => fakeEvent(sid, path));
        const first = predictMock(history);
        const second = predictMock(history);
        expect(first).toBeDefined();
        expect(second).toEqual(first);
        expect(first!.predicted_next_path.startsWith("/")).toBe(true);
      })
    );
  });
});

describe("Maze property: ATT&CK mapping integrity (Requirement R13)", () => {
  const VERIFIED_IDS = new Set(["T1595", "T1595.003", "T1552.001", "T1078", "T1190"]);
  const SIGNALS = ["bait_followed", "canary_reused", "think_pauses", "enumeration", "scripted_ua"];
  const signalArb = fc.subarray(SIGNALS);

  it("only emits verified technique IDs with an official URL and rationale", () => {
    fc.assert(
      fc.property(signalArb, fc.array(pathArb, { maxLength: 8 }), (signals, paths) => {
        const techs = techniquesForSession(signals, paths);
        for (const technique of techs) {
          expect(VERIFIED_IDS.has(technique.id)).toBe(true);
          expect(technique.url.startsWith("https://attack.mitre.org/")).toBe(true);
          expect(technique.rationale.length).toBeGreaterThan(0);
        }
      })
    );
  });

  it("is deterministic and de-duplicated", () => {
    fc.assert(
      fc.property(signalArb, fc.array(pathArb, { maxLength: 8 }), (signals, paths) => {
        const first = techniquesForSession(signals, paths);
        const second = techniquesForSession(signals, paths);
        expect(second.map((t) => t.id)).toEqual(first.map((t) => t.id));
        const ids = first.map((t) => t.id);
        expect(new Set(ids).size).toBe(ids.length);
      })
    );
  });

  it("maps canary reuse to Valid Accounts and enumeration to scanning", () => {
    const reuse = techniquesForSession(["canary_reused"], ["/staff/portal"]);
    expect(reuse.some((t) => t.id === "T1078")).toBe(true);

    const enumerated = techniquesForSession(["enumeration"], ["/a", "/b"]);
    expect(enumerated.some((t) => t.id === "T1595")).toBe(true);
    expect(enumerated.some((t) => t.id === "T1595.003")).toBe(true);
  });

  it("derives techniques from an event timeline", () => {
    const events: SirenEvent[] = [
      { ...fakeEvent("abcd000000000000", "/.env"), signals: ["bait_followed"] },
      { ...fakeEvent("abcd000000000000", "/admin/console"), signals: ["enumeration"] },
    ];
    const ids = techniquesForEvents(events).map((t) => t.id);
    expect(ids).toContain("T1552.001");
    expect(ids).toContain("T1190");
    expect(ids).toContain("T1595");
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
