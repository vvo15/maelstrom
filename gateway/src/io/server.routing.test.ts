/**
 * Integration test (task 9.3): routing to the Decoy, then the Maze.
 *
 * Feature: siren-gateway, Property 3: Latched flag implies maze routing
 * (end-to-end emission of `flagged`/`route`).
 * _Requirements: 6.1, 6.2, 6.3, 6.4, 9.4 (Property 3)_
 *
 * Drives the real `createGatewayServer` against a stub Decoy, with the Maze
 * stubbed at the `./mazeAdapter` seam (the real `gateway/src/maze` is never
 * loaded).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { Maze, MazeRequest, MazeResponse } from "../../../shared/contracts";
import type { SirenEvent } from "../../../shared/events";
import {
  closeAll,
  collectEvents,
  rawRequest,
  startGateway,
  startStubDecoy,
  uniqueBrowserUA,
  type RawResponse,
  type ReceivedRequest,
  type Started,
} from "./testHarness";

const MAZE_HEADERS: Record<string, string> = {
  server: "Apache/2.4.62 (Debian)",
  "x-powered-by": "PHP/8.3.12",
  "x-maze-stub": "1",
};

/**
 * Stub Maze. The gateway passes `generate` a snapshot of `session.history`,
 * so requests are read straight from `generate.mock.calls` with no copying.
 */
vi.mock("./mazeAdapter", () => {
  const maze: Maze = {
    generate: vi.fn(async (req: MazeRequest): Promise<MazeResponse> => {
      return {
        status: 200,
        headers: {
          server: "Apache/2.4.62 (Debian)",
          "x-powered-by": "PHP/8.3.12",
          "x-maze-stub": "1",
        },
        body: `MAZE:${req.path}`,
      };
    }),
    estimateBurn: vi.fn(() => ({ tokens: 1, usd: 0 })),
    predict: vi.fn(async () => undefined),
  };
  return { maze };
});

// Imported after the mock is registered (vi.mock is hoisted anyway).
import { maze } from "./mazeAdapter";

const DECOY_BODY = "DECOY-PAGE";

describe("gateway routing: decoy then maze (Property 3, Req 6.1-6.4, 9.4)", () => {
  let decoy: Started & { received: ReceivedRequest[] };
  let gateway: Started;

  beforeAll(async () => {
    decoy = await startStubDecoy((_req, res) => {
      res.writeHead(200, { "content-type": "text/html", "x-decoy-test": "1" });
      res.end(DECOY_BODY);
    });
    gateway = await startGateway(decoy.url);
  });

  afterAll(async () => {
    await closeAll([gateway.server, decoy.server]);
  });

  it("routes benign + first-flagging requests to the decoy, later flagged requests to the maze", async () => {
    const events: SirenEvent[] = collectEvents();
    const generate = vi.mocked(maze.generate);
    generate.mockClear();

    const ua = uniqueBrowserUA();
    const send = (method: string, path: string, body?: string): Promise<RawResponse> =>
      rawRequest(gateway.url, {
        method,
        path,
        headers: { "user-agent": ua, ...(body !== undefined ? { "content-type": "text/plain" } : {}) },
        body: body !== undefined ? Buffer.from(body, "utf8") : undefined,
      });

    // 1. Benign requests go to the decoy, unflagged.
    for (const [i, p] of ["/", "/about"].entries()) {
      const res = await send("GET", p);
      expect(decoy.received).toHaveLength(i + 1);
      expect(res.status).toBe(200);
      expect(res.body.toString("utf8")).toBe(DECOY_BODY);
      expect(events).toHaveLength(i + 1);
      expect(events[i].route).toBe("decoy");
      expect(events[i].flagged).toBe(false);
    }
    expect(generate).not.toHaveBeenCalled();

    // 2. First-flagging request (bait_followed = 60 >= 50) still hits the
    //    decoy (pre-scoring flag drives routing); its event says flagged.
    const flagRes = await send("GET", "/verify?agent=a&task=t");
    expect(decoy.received).toHaveLength(3);
    expect(decoy.received[2].url).toBe("/verify?agent=a&task=t");
    expect(flagRes.body.toString("utf8")).toBe(DECOY_BODY);
    expect(flagRes.headers["x-decoy-test"]).toBe("1");
    expect(generate).not.toHaveBeenCalled();
    expect(events).toHaveLength(3);
    expect(events[2].route).toBe("decoy");
    expect(events[2].flagged).toBe(true);

    // 3. Later requests are latched-flagged and go to the maze.
    const adminRes = await send("GET", "/admin");
    expect(decoy.received).toHaveLength(3);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(adminRes.status).toBe(200);
    for (const [k, v] of Object.entries(MAZE_HEADERS)) expect(adminRes.headers[k]).toBe(v);
    expect(adminRes.headers["x-decoy-test"]).toBeUndefined();
    expect(adminRes.body.toString("utf8")).toBe("MAZE:/admin");

    const loginBody = "user=admin&pass=hunter2";
    const loginRes = await send("POST", "/login?next=%2F", loginBody);
    expect(decoy.received).toHaveLength(3);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(loginRes.status).toBe(200);
    for (const [k, v] of Object.entries(MAZE_HEADERS)) expect(loginRes.headers[k]).toBe(v);
    expect(loginRes.body.toString("utf8")).toBe("MAZE:/login");

    for (const ev of events.slice(3)) {
      expect(ev.route).toBe("maze");
      expect(ev.flagged).toBe(true);
    }

    // 4. MazeRequest contents (Req 6.1, 6.2).
    const sessionId = events[0].session_id;
    expect(events.every((e) => e.session_id === sessionId)).toBe(true);

    const first = generate.mock.calls[0][0];
    expect(first.session_id).toBe(sessionId);
    expect(first.method).toBe("GET");
    expect(first.path).toBe("/admin");
    // Decoupling: this is the array the gateway handed to `generate`, not a
    // test-side copy. The session has since recorded two more events; a live
    // reference to `session.history` would have grown to length 5.
    expect(first.history).toHaveLength(3);
    expect(first.history).toEqual(events.slice(0, 3));

    const second = generate.mock.calls[1][0];
    expect(second.session_id).toBe(sessionId);
    expect(second.method).toBe("POST");
    expect(second.path).toBe("/login"); // query-stripped
    expect(second.body).toBe(loginBody);
    expect(second.history).toEqual(events.slice(0, 4));

    // 5. Exactly one event per request.
    expect(events).toHaveLength(5);
  });
});
