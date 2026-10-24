/**
 * Integration test (task 9.4): decoy failure returns 502 with exactly one event.
 * _Requirements: 11.1_
 *
 * Drives the real `createGatewayServer`. Each case uses a unique browser UA so
 * the session is unflagged and the request routes to the Decoy.
 *
 * - Case A (connection error): the gateway points at a port that is known to
 *   be closed (bound ephemerally, then released before the request).
 * - Case B (timeout): a stub Decoy accepts the request and never responds.
 *   Only `setTimeout`/`clearTimeout` are faked, so the 10 s AbortController
 *   timer in `io/decoy.ts` can be advanced without freezing Node's
 *   http/undici internals (which rely on setImmediate/nextTick/microtasks).
 */
import http from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SirenEvent } from "../../../shared/events";
import { DECOY_TIMEOUT_MS } from "./decoy";
import {
  closeAll,
  collectEvents,
  listenEphemeral,
  rawRequest,
  startGateway,
  startStubDecoy,
  uniqueBrowserUA,
  type RawResponse,
  type Started,
} from "./testHarness";

/** Bind an ephemeral port, then release it so it is closed for the test. */
async function closedPortUrl(): Promise<string> {
  const probe = await listenEphemeral(http.createServer());
  await closeAll([probe.server]);
  return probe.url;
}

/** Yield to real I/O (setImmediate is NOT faked). */
function tick(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function expectSingle502Event(events: SirenEvent[]): void {
  expect(events).toHaveLength(1);
  expect(events[0].status).toBe(502);
  expect(events[0].route).toBe("decoy");
}

describe("gateway decoy failure -> 502 + exactly one event (Req 11.1)", () => {
  let servers: http.Server[] = [];

  afterEach(async () => {
    vi.useRealTimers();
    // closeAll destroys every open connection, including the hanging stub's.
    await closeAll(servers);
    servers = [];
  });

  it("Case A: connection error returns 502, empty body, one event", async () => {
    const deadUrl = await closedPortUrl();
    const gateway = await startGateway(deadUrl);
    servers.push(gateway.server);
    const events = collectEvents();

    const res = await rawRequest(gateway.url, {
      method: "GET",
      path: "/property-tax",
      headers: { "user-agent": uniqueBrowserUA() },
    });

    expect(res.status).toBe(502);
    expect(res.body.length).toBe(0);
    expectSingle502Event(events);

    // Gateway is still alive and answers the next request the same way.
    const again = await rawRequest(gateway.url, {
      method: "GET",
      path: "/",
      headers: { "user-agent": uniqueBrowserUA() },
    });
    expect(again.status).toBe(502);
    expect(events).toHaveLength(2);
    expect(gateway.server.listening).toBe(true);
  });

  it("Case B: decoy that never responds times out at 10 s -> 502, one event", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    // First request hangs forever; later requests get a normal 200.
    let arrived!: () => void;
    const firstArrived = new Promise<void>((resolve) => {
      arrived = resolve;
    });
    let count = 0;
    const decoy: Started = await startStubDecoy((_req, res) => {
      count += 1;
      if (count === 1) {
        arrived();
        return; // never respond
      }
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("ok");
    });
    const gateway = await startGateway(decoy.url);
    servers.push(gateway.server, decoy.server);
    const events = collectEvents();

    let settled: RawResponse | undefined;
    const pending = rawRequest(gateway.url, {
      method: "GET",
      path: "/permit-status",
      headers: { "user-agent": uniqueBrowserUA() },
    }).then((r) => {
      settled = r;
      return r;
    });

    // Wait until the stub Decoy really has the request (real I/O).
    await firstArrived;

    // Just before the deadline: nothing has happened yet.
    await vi.advanceTimersByTimeAsync(DECOY_TIMEOUT_MS - 1);
    await tick();
    expect(settled).toBeUndefined();
    expect(events).toHaveLength(0);

    // Cross the deadline: the AbortController fires.
    await vi.advanceTimersByTimeAsync(1);
    const res = await pending;
    expect(res.status).toBe(502);
    expect(res.body.length).toBe(0);
    expectSingle502Event(events);

    // A normal request afterwards still works.
    const ok = await rawRequest(gateway.url, {
      method: "GET",
      path: "/",
      headers: { "user-agent": uniqueBrowserUA() },
    });
    expect(ok.status).toBe(200);
    expect(ok.body.toString("utf8")).toBe("ok");
    expect(events).toHaveLength(2);
    expect(events[1].status).toBe(200);
  });
});
