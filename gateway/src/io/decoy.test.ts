/**
 * Unit and property tests for io/decoy.ts preservation behavior.
 *
 * Covers:
 *  - Req 2.2: allowed inbound request headers are projected while transport
 *    headers and forged session identity are excluded.
 *  - Req 2.3: the Session_Header (`x-siren-session`) is added when forwarding.
 *  - Req 2.4: response status, raw bytes, and benign headers are preserved while
 *    body-transforming / hop-by-hop response headers are dropped.
 *  - Bugfix Property 2: non-header proxy behavior remains unchanged before and
 *    after request-header forwarding is added.
 *
 * `fetch` is mocked with `vi.fn()` so no real network is used.
 */
import fc from "fast-check";
import { afterEach, describe, expect, it, vi } from "vitest";
import { forwardToDecoy } from "./decoy";
import { SESSION_HEADER } from "../../../shared/contracts";

const METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"] as const;
const SAFE_PATH_CHARACTER = fc.constantFrom(
  ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~/".split(""),
);
const SAFE_PATH = fc
  .array(SAFE_PATH_CHARACTER, { minLength: 0, maxLength: 48 })
  .map((characters) => `/${characters.join("")}`);
const SESSION_ID = fc
  .array(fc.constantFrom(..."0123456789abcdef".split("")), {
    minLength: 16,
    maxLength: 16,
  })
  .map((characters) => characters.join(""));
const SAFE_HEADER_VALUE = fc
  .array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -._/".split("")), {
    minLength: 1,
    maxLength: 48,
  })
  .map((characters) => characters.join(""));

function headerCaseArbitrary(name: string): fc.Arbitrary<string> {
  return fc
    .array(fc.boolean(), { minLength: name.length, maxLength: name.length })
    .map((uppercase) =>
      [...name]
        .map((character, index) => uppercase[index] ? character.toUpperCase() : character.toLowerCase())
        .join(""),
    );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("forwardToDecoy header handling", () => {
  it("adds x-siren-session with the session id when forwarding (Req 2.3)", async () => {
    let capturedInit: RequestInit | undefined;
    const fetchMock = vi.fn(async (_input: unknown, init?: RequestInit) => {
      capturedInit = init;
      return new Response("ok", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await forwardToDecoy("http://localhost:8081", "POST", "/x", "body", {}, "sess123");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(capturedInit).toBeDefined();
    const sent = new Headers(capturedInit!.headers);
    expect(sent.get(SESSION_HEADER)).toBe("sess123");
    expect(SESSION_HEADER).toBe("x-siren-session");
  });

  it("passes allowed scalar request headers through the Fetch Headers API unchanged", async () => {
    let capturedInit: RequestInit | undefined;
    vi.stubGlobal("fetch", vi.fn(async (_input: unknown, init?: RequestInit) => {
      capturedInit = init;
      return new Response("ok", { status: 200 });
    }));

    await forwardToDecoy(
      "http://localhost:8081",
      "POST",
      "/headers",
      "body",
      {
        "user-agent": "Browser/1.0",
        "content-type": "application/json; charset=utf-8",
        authorization: "Bearer regression-token",
        cookie: "mode=demo; theme=dark",
      },
      "0123456789abcdef",
    );

    const sent = capturedInit!.headers as Headers;
    expect(sent).toBeInstanceOf(Headers);
    expect(sent.get("user-agent")).toBe("Browser/1.0");
    expect(sent.get("content-type")).toBe("application/json; charset=utf-8");
    expect(sent.get("authorization")).toBe("Bearer regression-token");
    expect(sent.get("cookie")).toBe("mode=demo; theme=dark");
  });

  it("rejects every excluded request header under mixed-case synthetic keys", async () => {
    let capturedInit: RequestInit | undefined;
    vi.stubGlobal("fetch", vi.fn(async (_input: unknown, init?: RequestInit) => {
      capturedInit = init;
      return new Response("ok", { status: 200 });
    }));

    await forwardToDecoy(
      "http://localhost:8081",
      "GET",
      "/headers",
      "",
      {
        CoNnEcTiOn: "client-connection",
        "KeEp-AlIvE": "client-keep-alive",
        "TrAnSfEr-EnCoDiNg": "client-transfer-encoding",
        UpGrAdE: "client-upgrade",
        "PrOxY-AuThOrIzAtIoN": "client-proxy-authorization",
        tE: "client-te",
        TrAiLeR: "client-trailer",
        hOsT: "client-host",
        "CoNtEnT-LeNgTh": "999",
        "X-SiReN-SeSsIoN": "forged-session",
      },
      "authoritative-session",
    );

    const sent = capturedInit!.headers as Headers;
    for (const excluded of [
      "connection",
      "keep-alive",
      "transfer-encoding",
      "upgrade",
      "proxy-authorization",
      "te",
      "trailer",
      "host",
      "content-length",
    ]) {
      expect(sent.has(excluded)).toBe(false);
    }
    expect(sent.get(SESSION_HEADER)).toBe("authoritative-session");
  });

  it("skips undefined inbound request header values instead of serializing them", async () => {
    let capturedInit: RequestInit | undefined;
    vi.stubGlobal("fetch", vi.fn(async (_input: unknown, init?: RequestInit) => {
      capturedInit = init;
      return new Response("ok", { status: 200 });
    }));

    await forwardToDecoy(
      "http://localhost:8081",
      "GET",
      "/headers",
      "",
      { "x-defined": "present", "x-undefined": undefined },
      "authoritative-session",
    );

    const sent = capturedInit!.headers as Headers;
    expect(sent.get("x-defined")).toBe("present");
    expect(sent.has("x-undefined")).toBe(false);
  });

  it("appends array-valued inbound headers member-by-member in order", async () => {
    let capturedInit: RequestInit | undefined;
    vi.stubGlobal("fetch", vi.fn(async (_input: unknown, init?: RequestInit) => {
      capturedInit = init;
      return new Response("ok", { status: 200 });
    }));

    await forwardToDecoy(
      "http://localhost:8081",
      "GET",
      "/headers",
      "",
      { "x-ordered-values": ["first", "second", "third"] },
      "authoritative-session",
    );

    const sent = capturedInit!.headers as Headers;
    expect(sent.get("x-ordered-values")).toBe("first, second, third");
  });

  it("replaces a forged mixed-case session header with the computed session id", async () => {
    let capturedInit: RequestInit | undefined;
    vi.stubGlobal("fetch", vi.fn(async (_input: unknown, init?: RequestInit) => {
      capturedInit = init;
      return new Response("ok", { status: 200 });
    }));

    await forwardToDecoy(
      "http://localhost:8081",
      "GET",
      "/headers",
      "",
      { "X-SiReN-SeSsIoN": "deadbeefdeadbeef", "x-allowed": "kept" },
      "0123456789abcdef",
    );

    const sent = capturedInit!.headers as Headers;
    expect(sent.get(SESSION_HEADER)).toBe("0123456789abcdef");
    expect(sent.get(SESSION_HEADER)).not.toBe("deadbeefdeadbeef");
    expect(sent.get("x-allowed")).toBe("kept");
  });

  it("drops content-encoding, content-length, transfer-encoding, and connection from the returned headers while keeping benign headers (Req 2.4)", async () => {
    // Hand-roll an object shaped like the parts forwardToDecoy consumes. The
    // real `Response` constructor strips/normalizes some of these restricted
    // headers (e.g. content-length, connection), which would hide the drop
    // behavior we want to assert, so we build the Headers directly.
    const responseHeaders = new Headers();
    responseHeaders.set("content-encoding", "gzip");
    responseHeaders.set("content-length", "123");
    responseHeaders.set("transfer-encoding", "chunked");
    responseHeaders.set("connection", "keep-alive");
    responseHeaders.set("content-type", "text/html");

    const fakeResponse = {
      status: 200,
      headers: responseHeaders,
      arrayBuffer: async () => new ArrayBuffer(2),
    };

    const fetchMock = vi.fn(async () => fakeResponse as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const result = await forwardToDecoy(
      "http://localhost:8081",
      "GET",
      "/x",
      "",
      {},
      "sess123",
    );

    // Case-insensitive check: none of the four dropped headers survive.
    const returnedKeys = Object.keys(result.headers).map((k) => k.toLowerCase());
    for (const dropped of [
      "content-encoding",
      "content-length",
      "transfer-encoding",
      "connection",
    ]) {
      expect(returnedKeys).not.toContain(dropped);
    }

    // Benign headers are preserved.
    expect(returnedKeys).toContain("content-type");
  });
});

describe("Property 2: non-header proxy and response preservation", () => {
  it("preserves target, method, existing body policy, and computed session with no forwardable inbound headers", async () => {
    // Feature: decoy-request-header-forwarding, Property 2: Preservation - Non-Header Proxy and Response Behavior
    // **Validates: Requirements 3.2**
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...METHODS),
        SAFE_PATH,
        fc.string({ maxLength: 96 }),
        SESSION_ID,
        async (method, path, body, sessionId) => {
          let capturedTarget: unknown;
          let capturedInit: RequestInit | undefined;
          const fetchMock = vi.fn(async (target: unknown, init?: RequestInit) => {
            capturedTarget = target;
            capturedInit = init;
            return new Response(null, { status: 200 });
          });
          vi.stubGlobal("fetch", fetchMock);

          await forwardToDecoy("http://localhost:8081", method, path, body, {}, sessionId);

          expect(fetchMock).toHaveBeenCalledTimes(1);
          expect(capturedTarget).toBe(`http://localhost:8081${path}`);
          expect(capturedInit).toBeDefined();
          expect(capturedInit!.method).toBe(method);
          if (method === "GET" || method === "HEAD") {
            expect(capturedInit!.body).toBeUndefined();
          } else {
            expect(capturedInit!.body).toBe(body);
          }
          expect(new Headers(capturedInit!.headers).get(SESSION_HEADER)).toBe(sessionId);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("preserves generated response status, raw bytes, and benign headers while filtering blocked headers case-insensitively", async () => {
    // Feature: decoy-request-header-forwarding, Property 2: Preservation - Non-Header Proxy and Response Behavior
    // **Validates: Requirements 3.3**
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 200, max: 599 }),
        fc.uint8Array({ maxLength: 128 }),
        SAFE_HEADER_VALUE,
        headerCaseArbitrary("content-encoding"),
        headerCaseArbitrary("content-length"),
        headerCaseArbitrary("transfer-encoding"),
        headerCaseArbitrary("connection"),
        async (
          status,
          generatedBytes,
          benignValue,
          contentEncoding,
          contentLength,
          transferEncoding,
          connection,
        ) => {
          const responseBytes = Buffer.from(generatedBytes);
          const entries: Array<[string, string]> = [
            [contentEncoding, "gzip"],
            [contentLength, "999"],
            [transferEncoding, "chunked"],
            [connection, "keep-alive"],
            ["X-Decoy-Benign", benignValue],
          ];
          const fakeResponse = {
            status,
            headers: {
              forEach(callback: (value: string, key: string) => void) {
                for (const [key, value] of entries) callback(value, key);
              },
            },
            arrayBuffer: async () => Uint8Array.from(generatedBytes).buffer,
          };
          vi.stubGlobal("fetch", vi.fn(async () => fakeResponse as unknown as Response));

          const result = await forwardToDecoy(
            "http://localhost:8081",
            "GET",
            "/response-fixture",
            "ignored GET body",
            {},
            "0123456789abcdef",
          );

          expect(result.status).toBe(status);
          expect(result.bodyBytes.equals(responseBytes)).toBe(true);
          expect(result.body).toBe(responseBytes.toString("utf8"));
          expect(result.headers["X-Decoy-Benign"]).toBe(benignValue);

          const returnedKeys = Object.keys(result.headers).map((key) => key.toLowerCase());
          for (const dropped of [
            "content-encoding",
            "content-length",
            "transfer-encoding",
            "connection",
          ]) {
            expect(returnedKeys).not.toContain(dropped);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
