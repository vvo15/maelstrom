/**
 * Integration test (task 9.2): transparent proxy forwarding.
 * Drives the real `createGatewayServer` against a stub Decoy.
 * _Requirements: 2.2, 2.3, 2.4 (and 1.2 for the forged header)_
 */
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

  it("forwards method/path/body, adds x-siren-session, and returns the decoy response byte-for-byte", async () => {
    const ua = uniqueBrowserUA();
    const reqBody = Buffer.from("héllo ✓", "utf8");

    const res = await rawRequest(gateway.url, {
      method: "POST",
      path: "/some/path?x=1",
      headers: { "user-agent": ua, "content-type": "text/plain; charset=utf-8" },
      body: reqBody,
    });

    // Decoy saw the same method, path+query, and body bytes (Req 2.2).
    expect(decoy.received).toHaveLength(1);
    const seen = decoy.received[0];
    expect(seen.method).toBe("POST");
    expect(seen.url).toBe("/some/path?x=1");
    expect(seen.body.equals(reqBody)).toBe(true);

    // Session header added with the gateway-derived id (Req 2.3).
    const expectedId = deriveSessionId(LOOPBACK, ua);
    expect(seen.headers["x-siren-session"]).toBe(expectedId);
    expect(expectedId).toMatch(/^[0-9a-f]{16}$/);

    // Client got the decoy's status, headers, and exact bytes (Req 2.4).
    expect(res.status).toBe(DECOY_STATUS);
    expect(res.headers["x-decoy-test"]).toBe("1");
    expect(res.headers["server"]).toBe("Apache/2.4.62 (Debian)");
    expect(res.headers["content-type"]).toBe("application/octet-stream");
    expect(res.body.equals(DECOY_BODY)).toBe(true);

    // Exactly one event, routed to the decoy, carrying the decoy's status.
    expect(events).toHaveLength(1);
    expect(events[0].route).toBe("decoy");
    expect(events[0].status).toBe(DECOY_STATUS);
    expect(events[0].session_id).toBe(expectedId);
    expect(events[0].flagged).toBe(false);
  });

  it("replaces a forged inbound x-siren-session with the gateway-derived id (Req 1.2)", async () => {
    const ua = uniqueBrowserUA();

    const res = await rawRequest(gateway.url, {
      method: "POST",
      path: "/some/path?x=1",
      headers: { "user-agent": ua, "x-siren-session": "deadbeefdeadbeef" },
      body: Buffer.from("héllo ✓", "utf8"),
    });

    expect(res.status).toBe(DECOY_STATUS);
    expect(decoy.received).toHaveLength(1);
    const forwarded = decoy.received[0].headers["x-siren-session"];
    const expectedId = deriveSessionId(LOOPBACK, ua);
    expect(forwarded).toBe(expectedId);
    expect(forwarded).not.toBe("deadbeefdeadbeef");

    expect(events).toHaveLength(1);
    expect(events[0].session_id).toBe(expectedId);
    expect(events[0].route).toBe("decoy");
  });
});
