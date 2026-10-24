/**
 * Unit tests for io/decoy.ts header handling (task 2.2).
 *
 * Covers:
 *  - Req 2.3: the Session_Header (`x-siren-session`) is added when forwarding.
 *  - Req 2.4: the body-transforming / hop-by-hop response headers
 *    (`content-encoding`, `content-length`, `transfer-encoding`, `connection`)
 *    are dropped (case-insensitively) from the returned headers.
 *
 * `fetch` is mocked with `vi.fn()` so no real network is used.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { forwardToDecoy } from "./decoy";
import { SESSION_HEADER } from "../../../shared/contracts";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("forwardToDecoy header handling", () => {
  it("adds x-siren-session with the session id when forwarding (Req 2.3)", async () => {
    let capturedInit: RequestInit | undefined;
    const fetchMock = vi.fn(async (_input: unknown, init?: RequestInit) => {
      capturedInit = init;
      return new Response("ok", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await forwardToDecoy("http://localhost:8081", "POST", "/x", "body", "sess123");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(capturedInit).toBeDefined();
    const sent = new Headers(capturedInit!.headers);
    expect(sent.get(SESSION_HEADER)).toBe("sess123");
    expect(SESSION_HEADER).toBe("x-siren-session");
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
