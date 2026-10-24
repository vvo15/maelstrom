import { WebSocket, WebSocketServer } from "ws";
import type { SirenEvent } from "../../../shared/events";

const MAX_REPLAY = 500;

/**
 * Start the WebSocket server used to stream SirenEvents to connected
 * dashboards.
 *
 * - `broadcast(ev)` sends the JSON-serialized event to every client whose
 *   socket is currently open.
 * - `recordForReplay(ev)` pushes the event into a last-500 ring buffer,
 *   dropping the oldest entry once the buffer exceeds 500.
 *
 * On a new connection the current ring buffer (the <=500 most recent events)
 * is replayed to the new client before any live broadcast can reach it.
 *
 * Lifecycle helpers (additive; used by tests, ignored by `index.ts`):
 * - `ready` resolves with the actually-bound port once listening (useful
 *   with `port = 0`). It never rejects: no 'error' listener is attached
 *   here, so a bind failure still surfaces exactly as before.
 * - `close()` terminates open clients and closes the server.
 * - `onError(fn)` attaches an 'error' listener to the underlying server.
 *   Attaching one means listen errors no longer become uncaughtExceptions.
 */
export function startWsServer(port: number): {
  broadcast(ev: SirenEvent): void;
  recordForReplay(ev: SirenEvent): void;
  ready: Promise<number>;
  close(): Promise<void>;
  onError(listener: (err: Error) => void): void;
} {
  const wss = new WebSocketServer({ port });
  const ringBuffer: SirenEvent[] = [];

  const ready = new Promise<number>((resolve) => {
    wss.once("listening", () => {
      const addr = wss.address();
      resolve(addr !== null && typeof addr === "object" ? addr.port : port);
    });
  });

  wss.on("connection", (socket: WebSocket) => {
    // Replay the backlog to the newly connected client before any live
    // broadcast reaches it.
    for (const ev of ringBuffer) {
      socket.send(JSON.stringify(ev));
    }
  });

  function broadcast(ev: SirenEvent): void {
    const data = JSON.stringify(ev);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }

  function recordForReplay(ev: SirenEvent): void {
    ringBuffer.push(ev);
    if (ringBuffer.length > MAX_REPLAY) {
      ringBuffer.shift();
    }
  }

  function close(): Promise<void> {
    for (const client of wss.clients) client.terminate();
    return new Promise<void>((resolve) => wss.close(() => resolve()));
  }

  function onError(listener: (err: Error) => void): void {
    wss.on("error", listener);
  }

  return { broadcast, recordForReplay, ready, close, onError };
}
