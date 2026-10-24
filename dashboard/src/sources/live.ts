import type { SirenEvent } from "../model";
import { isSirenEvent } from "./validate";

export const LIVE_URL: string = import.meta.env.VITE_LIVE_WS_URL ?? "ws://localhost:8090";

const RETRY_MS = 3000;

export interface LiveHandlers {
  onEvent: (e: SirenEvent) => void;
  onOpen: () => void;
  /** Connection failed or dropped. A retry is already scheduled. */
  onDown: () => void;
}

/**
 * Connects to the gateway stream and keeps reconnecting until disposed.
 * Each message may be one SirenEvent or an array of them.
 * Returns a dispose function.
 */
export function connectLive(url: string, h: LiveHandlers): () => void {
  let socket: WebSocket | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;

  const open = () => {
    if (disposed) return;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      // e.g. blocked as mixed content when the page is served over https
      h.onDown();
      retry = setTimeout(open, RETRY_MS);
      return;
    }
    socket = ws;
    ws.onopen = () => {
      if (!disposed) h.onOpen();
    };
    ws.onmessage = (msg) => {
      if (disposed || typeof msg.data !== "string") return;
      try {
        const data: unknown = JSON.parse(msg.data);
        for (const item of Array.isArray(data) ? data : [data]) {
          if (isSirenEvent(item)) h.onEvent(item);
        }
      } catch {
        // Ignore a malformed frame; keep the stream alive.
      }
    };
    ws.onclose = () => {
      if (disposed || socket !== ws) return;
      h.onDown();
      retry = setTimeout(open, RETRY_MS);
    };
    // onerror is always followed by onclose, which handles retry.
    ws.onerror = () => {};
  };

  open();

  return () => {
    disposed = true;
    clearTimeout(retry);
    if (socket) {
      socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
      socket.close();
    }
  };
}
