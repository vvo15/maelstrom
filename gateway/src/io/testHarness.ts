/**
 * Shared helpers for gateway integration tests (tasks 9.2-9.5).
 *
 * Not a test file (no `.test.ts` suffix), so vitest won't collect it.
 * Everything binds to 127.0.0.1 on an ephemeral port (`listen(0)`) so tests
 * never collide with a running dev gateway on 8080/8081/8090, and so the
 * gateway sees the client as `127.0.0.1` (deterministic session ids).
 */
import http from "node:http";
import type { AddressInfo } from "node:net";

import type { SirenEvent } from "../../../shared/events";
import { configureEmitter } from "./emitter";
import { createGatewayServer } from "./server";

export const LOOPBACK = "127.0.0.1";

/** A request as observed by the stub Decoy. */
export type ReceivedRequest = {
  method: string;
  url: string;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
};

export type Started = { server: http.Server; url: string; port: number };

/** Listen on an ephemeral loopback port and resolve with its base URL. */
export function listenEphemeral(server: http.Server): Promise<Started> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, LOOPBACK, () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, port, url: `http://${LOOPBACK}:${port}` });
    });
  });
}

/**
 * Start a stub Decoy. Every request's full body is buffered and recorded in
 * `received` before `respond` is called.
 */
export async function startStubDecoy(
  respond: (req: ReceivedRequest, res: http.ServerResponse) => void,
): Promise<Started & { received: ReceivedRequest[] }> {
  const received: ReceivedRequest[] = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const r: ReceivedRequest = {
        method: req.method ?? "",
        url: req.url ?? "",
        headers: req.headers,
        body: Buffer.concat(chunks),
      };
      received.push(r);
      respond(r, res);
    });
  });
  return { ...(await listenEphemeral(server)), received };
}

/** Start the real gateway server pointed at `decoyUrl`. */
export function startGateway(decoyUrl: string): Promise<Started> {
  return listenEphemeral(createGatewayServer({ decoyUrl }));
}

/** Configure the emitter with an in-memory sink; returns the event array. */
export function collectEvents(): SirenEvent[] {
  const events: SirenEvent[] = [];
  configureEmitter({
    broadcast: () => {},
    recordForReplay: () => {},
    append: (ev) => events.push(ev),
  });
  return events;
}

/** A raw client response with byte-exact body. */
export type RawResponse = {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
};

/** Send a request with `http.request` and collect the raw response bytes. */
export function rawRequest(
  baseUrl: string,
  opts: { method: string; path: string; headers?: http.OutgoingHttpHeaders; body?: Buffer },
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const u = new URL(baseUrl);
    const req = http.request(
      {
        host: u.hostname,
        port: u.port,
        method: opts.method,
        path: opts.path,
        headers: opts.headers,
        agent: false, // no keep-alive, so servers close promptly
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }),
        );
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    req.end(opts.body);
  });
}

/** Close servers (and their idle connections); ignores already-closed ones. */
export async function closeAll(servers: http.Server[]): Promise<void> {
  await Promise.all(
    servers.map(
      (s) =>
        new Promise<void>((resolve) => {
          s.closeAllConnections();
          s.close(() => resolve());
        }),
    ),
  );
}

/** A browser-like, unique-per-call User-Agent with no scripted tokens. */
let uaCounter = 0;
export function uniqueBrowserUA(): string {
  uaCounter += 1;
  return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.${Date.now()}.${uaCounter} Safari/537.36`;
}
