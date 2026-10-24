/**
 * Integration test (task 9.2): transparent proxy forwarding.
 * Drives the real `createGatewayServer` against a stub Decoy.
 * _Requirements: 2.2, 2.3, 2.4 (and 1.2 for the forged header)_
 */
import fc from "fast-check";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { SirenEvent } from "../../../shared/events";
import { deriveSessionId } from "../detector/sessionId";
import {
  LOOPBACK,
  closeAll,
  collectEvents,
  rawRequest,
  startGateway,
  startStubDecoy,
  uniqueBrowserUA,
  type ReceivedRequest,
  type Started,
} from "./testHarness";

/** Non-UTF-8 bytes: proves the body is forwarded as bytes, not text. */
const DECOY_BODY = Buffer.from([0xff, 0xfe, 0x00, 0x41]);
const DECOY_STATUS = 418;
const CONTENT_TYPE = "application/json; charset=utf-8";
const AUTHORIZATION = "Bearer regression-token";
const COOKIE = "mode=demo; theme=dark";
const FORGED_SESSION = "deadbeefdeadbeef";

const EXCLUDED_REQUEST_HEADERS = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
  "proxy-authorization",
  "te",
  "trailer",
  "host",
  "content-length",
  "x-siren-session",
]);

type HeaderValue = string | string[] | undefined;
type HeaderMap = Record<string, HeaderValue>;

type BugConditionInput = {
  route: "decoy";
  nodeInboundHeaders: HeaderMap;
  originalDecoyHeaders: HeaderMap;
  authoritativeSessionId: string;
};

type ProxyExecutionResult = {
  decoyRequest: ReceivedRequest;
};

function projectAllowedHeaders(headers: HeaderMap): HeaderMap {
  return Object.fromEntries(
    Object.entries(headers).filter(
      ([name, value]) => value !== undefined && !EXCLUDED_REQUEST_HEADERS.has(name.toLowerCase()),
    ),
  );
}

function headerValueEquals(actual: HeaderValue, expected: HeaderValue): boolean {
  if (Array.isArray(actual) || Array.isArray(expected)) {
    return Array.isArray(actual) && Array.isArray(expected) &&
      actual.length === expected.length && actual.every((value, index) => value === expected[index]);
  }
  return actual === expected;
}

/** Scoped predicate from the bugfix design, evaluated against the captured original behavior. */
function isBugCondition(input: BugConditionInput): boolean {
  const allowedHeaders = projectAllowedHeaders(input.nodeInboundHeaders);
  return input.route === "decoy" && Object.keys(allowedHeaders).length > 0 &&
    Object.entries(allowedHeaders).some(
      ([name, value]) => !headerValueEquals(input.originalDecoyHeaders[name], value),
    );
}

/** Expected behavior predicate from Property 1 of the bugfix design. */
function expectedBehavior(input: BugConditionInput, result: ProxyExecutionResult): boolean {
  const allowedHeaders = projectAllowedHeaders(input.nodeInboundHeaders);
  const receivedHeaders = result.decoyRequest.headers;

  return Object.entries(allowedHeaders).every(([name, value]) =>
    headerValueEquals(receivedHeaders[name], value),
  ) && receivedHeaders["x-siren-session"] === input.authoritativeSessionId &&
    !Array.isArray(receivedHeaders["x-siren-session"]) &&
    receivedHeaders["x-siren-session"] !== FORGED_SESSION;
}

describe("gateway transparent proxy (Req 2.2-2.4)", () => {
  let decoy: Started & { received: ReceivedRequest[] };
  let gateway: Started;
  let events: SirenEvent[];

  beforeAll(async () => {
    decoy = await startStubDecoy((_req, res) => {
      res.writeHead(DECOY_STATUS, {
        "x-decoy-test": "1",
        server: "Apache/2.4.62 (Debian)",
        "content-type": "application/octet-stream",
      });
      res.end(DECOY_BODY);
    });
    gateway = await startGateway(decoy.url);
  });

  beforeEach(() => {
    decoy.received.length = 0;
    events = collectEvents();
  });

  afterAll(async () => {
    await closeAll([gateway.server, decoy.server]);
  });

  it("forwards allowed headers and the authoritative session while preserving transparent proxy behavior", async () => {
    const ua = uniqueBrowserUA();
    const reqBody = Buffer.from("héllo ✓", "utf8");
    const expectedId = deriveSessionId(LOOPBACK, ua);
    const nodeInboundHeaders: HeaderMap = {
      "user-agent": ua,
      "content-type": CONTENT_TYPE,
      authorization: AUTHORIZATION,
      cookie: COOKIE,
      "x-siren-session": FORGED_SESSION,
    };

    const input: BugConditionInput = {
      route: "decoy",
      nodeInboundHeaders,
      // Concrete baseline from the original session-only Decoy request-header behavior.
      originalDecoyHeaders: { "x-siren-session": expectedId },
      authoritativeSessionId: expectedId,
    };

    // Feature: decoy-request-header-forwarding, Property 1: Bug Condition - Allowed Headers and Authoritative Session Reach the Decoy
    // **Validates: Requirements 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 3.1**
    await fc.assert(
      fc.asyncProperty(fc.constant(input), async (scopedInput) => {
        expect(isBugCondition(scopedInput)).toBe(true);

        const res = await rawRequest(gateway.url, {
          method: "POST",
          path: "/some/path?x=1",
          headers: {
            "user-agent": ua,
            "content-type": CONTENT_TYPE,
            authorization: AUTHORIZATION,
            cookie: COOKIE,
            "x-siren-session": FORGED_SESSION,
          },
          body: reqBody,
        });

        // Decoy saw the same method, path+query, and body bytes (Req 2.2).
        expect(decoy.received).toHaveLength(1);
        const seen = decoy.received[0];
        expect(seen.method).toBe("POST");
        expect(seen.url).toBe("/some/path?x=1");
        expect(seen.body.equals(reqBody)).toBe(true);

        // Session header added with the gateway-derived id, replacing the forged value (Req 1.2, 2.3).
        expect(seen.headers["x-siren-session"]).toBe(expectedId);
        expect(seen.headers["x-siren-session"]).not.toBe(FORGED_SESSION);
        expect(Array.isArray(seen.headers["x-siren-session"])).toBe(false);
        expect(expectedId).toMatch(/^[0-9a-f]{16}$/);

        // Client got the decoy's status, headers, and exact bytes (Req 2.4).
        expect(res.status).toBe(DECOY_STATUS);
        expect(res.headers["x-decoy-test"]).toBe("1");
        expect(res.headers.server).toBe("Apache/2.4.62 (Debian)");
        expect(res.headers["content-type"]).toBe("application/octet-stream");
        expect(res.body.equals(DECOY_BODY)).toBe(true);

        // Exactly one event, routed to the decoy, carrying the decoy's status and derived session.
        expect(events).toHaveLength(1);
        expect(events[0].route).toBe("decoy");
        expect(events[0].status).toBe(DECOY_STATUS);
        expect(events[0].session_id).toBe(expectedId);
        expect(events[0].flagged).toBe(false);

        // Exploration counterexample on unfixed code: the Decoy receives Fetch defaults/omissions
        // instead of the four allowed Node-observed values, while every preservation assertion above passes.
        expect(expectedBehavior(scopedInput, { decoyRequest: seen })).toBe(true);
      }),
      { numRuns: 1 },
    );
  });
});
