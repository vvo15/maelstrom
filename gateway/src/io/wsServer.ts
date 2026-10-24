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
 */
export function startWsServer(port: number): {
  broadcast(ev: SirenEvent): void;
  recordForReplay(ev: SirenEvent): void;
} {
  const wss = new WebSocketServer({ port });
  const ringBuffer: SirenEvent[] = [];

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

  return { broadcast, recordForReplay };
}
