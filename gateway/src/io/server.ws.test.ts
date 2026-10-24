/**
 * Integration test (task 9.5): WebSocket last-500 backlog.
 * Real `startWsServer` (ephemeral port) wired to the real emitter, with live
 * events driven through the real `createGatewayServer` + stub Decoy.
 * _Requirements: 9.5, 9.6, 9.7_
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { WebSocket } from "ws";

import type { SirenEvent } from "../../../shared/events";
import { configureEmitter } from "./emitter";
import {
  LOOPBACK,
  closeAll,
  rawRequest,
  startGateway,
  startStubDecoy,
  uniqueBrowserUA,
  type ReceivedRequest,
  type Started,
} from "./testHarness";
import { startWsServer } from "./wsServer";

const SEED_COUNT = 520;
const BACKLOG = 500;
const WAIT_MS = 5000;
const SETTLE_MS = 150;

/** A distinguishable seed event: index `i` is encoded in both `path` and `ts`. */
function seedEvent(i: number): SirenEvent {
  return {
    session_id: "seed",
    ts: 1_000_000 + i,
    method: "GET",
    path: `/seed/${i}`,
    user_agent: "seed",
    body_snippet: "",
    status: 200,
    route: "decoy",
    ai_score: 0,
    signals: [],
    flagged: false,
    est_tokens_burned: 0,
    est_usd_burned: 0,
  };
}

const expectedBacklogPaths = Array.from(
  { length: BACKLOG },
  (_, k) => `/seed/${SEED_COUNT - BACKLOG + k}`,
);

type Client = { socket: WebSocket; messages: SirenEvent[] };

/** Connect a client, recording every message from the very first frame. */
function connect(port: number): Promise<Client> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://${LOOPBACK}:${port}`);
    const messages: SirenEvent[] = [];
    // Listener attached before 'open' so no backlog frame can be missed.
    socket.on("message", (data) => messages.push(JSON.parse(data.toString()) as SirenEvent));
    socket.once("open", () => resolve({ socket, messages }));
    socket.once("error", reject);
  });
}

/** Poll until `cond()` holds; reject after `timeoutMs` so tests can't hang. */
async function waitFor(cond: () => boolean, what: string, timeoutMs = WAIT_MS): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("WebSocket event stream backlog (Req 9.5-9.7)", () => {
  let decoy: Started & { received: ReceivedRequest[] };
  let gateway: Started;
  let ws: ReturnType<typeof startWsServer>;
  let wsPort: number;
  const clients: WebSocket[] = [];

  beforeAll(async () => {
    ws = startWsServer(0);
    wsPort = await ws.ready;
    configureEmitter({
      broadcast: ws.broadcast,
      recordForReplay: ws.recordForReplay,
      append: () => {},
    });

    decoy = await startStubDecoy((_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("ok");
    });
    gateway = await startGateway(decoy.url);

    for (let i = 0; i < SEED_COUNT; i++) ws.recordForReplay(seedEvent(i));
  });

  afterEach(() => {
    for (const c of clients.splice(0)) c.terminate();
  });

  afterAll(async () => {
    await ws.close();
    await closeAll([gateway.server, decoy.server]);
  });

  async function track(): Promise<Client> {
    const c = await connect(wsPort);
    clients.push(c.socket);
    return c;
  }

  it("sends exactly the 500 most recent events, in order, on connect", async () => {
    expect(wsPort).toBeGreaterThan(0);
    expect(wsPort).not.toBe(8090);

    const c = await track();
    await waitFor(() => c.messages.length >= BACKLOG, "backlog");
    await sleep(SETTLE_MS); // nothing older (or extra) should trickle in

    expect(c.messages).toHaveLength(BACKLOG);
    expect(c.messages.map((m) => m.path)).toEqual(expectedBacklogPaths);
    expect(c.messages.map((m) => m.ts)).toEqual(
      expectedBacklogPaths.map((_, k) => 1_000_000 + SEED_COUNT - BACKLOG + k),
    );
  });

  it("delivers the backlog before a live event, and broadcasts the live event to every client", async () => {
    // An already-connected client that has drained its backlog.
    const other = await track();
    await waitFor(() => other.messages.length >= BACKLOG, "other client's backlog");

    const c = await track();
    const livePath = `/live/${Date.now()}`;
    const res = await rawRequest(gateway.url, {
      method: "GET",
      path: livePath,
      headers: { "user-agent": uniqueBrowserUA() },
    });
    expect(res.status).toBe(200);

    await waitFor(() => c.messages.length >= BACKLOG + 1, "live event on new client");
    await waitFor(() => other.messages.length >= BACKLOG + 1, "live event on other client");
    await sleep(SETTLE_MS);

    // New client: message 1..500 are the backlog, message 501 is the live event.
    expect(c.messages).toHaveLength(BACKLOG + 1);
    expect(c.messages.slice(0, BACKLOG).map((m) => m.path)).toEqual(expectedBacklogPaths);
    expect(c.messages[BACKLOG].path).toBe(livePath);
    expect(c.messages[BACKLOG].method).toBe("GET");
    expect(c.messages[BACKLOG].status).toBe(200);

    // Already-connected client also receives the live event exactly once.
    expect(other.messages).toHaveLength(BACKLOG + 1);
    expect(other.messages[BACKLOG].path).toBe(livePath);
  });
});
