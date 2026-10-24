/**
 * HTTP request handler and request-lifecycle orchestration (Requirement 2, 9).
 *
 * This is the PHASE-1 (proxy + stream) version of the handler, with the
 * Detector stubbed to "no signals": every request is forwarded transparently
 * to the Decoy, and exactly one `SirenEvent` is emitted per request with
 * `ai_score` 0, `signals` [], `flagged` false, and `route` "decoy". These
 * values come from the freshly-created session state (which initializes
 * aiScore=0, an empty signals set, flagged=false), so the stubbed behavior is
 * satisfied without any detector code.
 *
 * Later tasks replace the inline session-id placeholder with
 * `detector/sessionId.ts#deriveSessionId` (task 4.1) and wire in detection,
 * routing to the Maze, burn accounting, and prediction (tasks 6.x), plus the
 * full decoy-error -> 502 handling (task 8.1). This file deliberately keeps a
 * minimal try/catch so a thrown `forwardToDecoy` cannot crash the process.
 *
 * Ordering guarantees honored here:
 * - De-header FIRST (Req 1.2): the inbound `x-siren-session` is stripped from
 *   `req.headers` before any further processing, so a client cannot inject or
 *   forge a session through that header.
 * - Exactly one event per request (Req 9.1): the event is built and emitted
 *   from a single point, on both the success and the error path.
 * - Byte-accurate forwarding (Req 2.4): the Decoy response is written to the
 *   client as raw `bodyBytes` with the already-de-headered `headers`.
 */
import http from "node:http";

import { readConfig } from "../config";
import { getOrCreateSession } from "../session/sessionStore";
import { forwardToDecoy } from "./decoy";
import { buildSirenEvent, emit } from "./emitter";

/** Inbound header a client might send to try to forge a session (Req 1.2). */
const SESSION_HEADER = "x-siren-session";

/**
 * Configuration the server factory needs. Accepts the full `Config` shape so
 * `index.ts` (task 2.8) can pass `readConfig()` directly, but only `decoyUrl`
 * is read in this phase.
 */
export type GatewayServerConfig = {
  decoyUrl: string;
};

/**
 * Temporary, self-contained session-id derivation for the proxy-only phase.
 *
 * Task 4.1 replaces this with the pure `deriveSessionId(sourceIp, userAgent)`
 * from `detector/sessionId.ts` (first 16 hex chars of a sha256). For now we
 * need only a deterministic per-client string, so a trivial FNV-1a hash over
 * the remote address + user agent is enough and keeps the module free of any
 * dependency on the not-yet-built detector.
 */
function placeholderSessionId(sourceIp: string, userAgent: string): string {
  const input = `${sourceIp}|${userAgent}`;
  // 32-bit FNV-1a, rendered as zero-padded 8-char hex. Deterministic.
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // FNV prime multiply, kept in 32-bit range.
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** Collect the full request body into a Buffer, then decode as UTF-8. */
function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/**
 * Build the request handler bound to the given config. Each invocation runs
 * the full phase-1 lifecycle for one request.
 */
function createHandler(
  config: GatewayServerConfig,
): http.RequestListener {
  return (req, res) => {
    // Step 1: strip the inbound session header before anything else (Req 1.2).
    delete req.headers[SESSION_HEADER];

    // Capture request shape now; the socket address is read before the body
    // is consumed to avoid any dependency on stream state.
    const method = req.method ?? "GET";
    const path = req.url ?? "/";
    const sourceIp = req.socket.remoteAddress ?? "";
    const userAgent = (req.headers["user-agent"] as string | undefined) ?? "";

    // Step 2: derive the session id (placeholder for this phase, step 3) and
    // get/create its state (step 4). These don't depend on the body.
    const sessionId = placeholderSessionId(sourceIp, userAgent);
    const session = getOrCreateSession(sessionId);

    // Read the full body, then run the async lifecycle. Any error is caught so
    // a failure cannot crash the process; a single event is still emitted.
    void (async () => {
      let body = "";
      try {
        body = await readBody(req);

        // Step 5: forward to the Decoy (every request in this phase).
        const result = await forwardToDecoy(
          config.decoyUrl,
          method,
          path,
          body,
          sessionId,
        );

        // Step 6: build the single event. In this stubbed phase ai_score=0,
        // signals=[], flagged=false come from the fresh session state.
        const ev = buildSirenEvent({
          session,
          current: { method, path, body, userAgent },
          status: result.status,
          route: "decoy",
          flaggedAfterScoring: false,
          tsEmit: Date.now(),
        });

        // Step 7: emit exactly once.
        emit(ev);

        // Step 8: return the Decoy status, de-headered headers, raw bytes.
        res.writeHead(result.status, result.headers);
        res.end(result.bodyBytes);
      } catch (err) {
        // Placeholder error handling (task 8.1 refines this). Respond 502 and
        // still emit exactly one event so the "one event per request"
        // invariant holds on the error path too.
        // eslint-disable-next-line no-console
        console.error("[gateway] request handling failed:", err);

        const ev = buildSirenEvent({
          session,
          current: { method, path, body, userAgent },
          status: 502,
          route: "decoy",
          flaggedAfterScoring: false,
          tsEmit: Date.now(),
        });
        emit(ev);

        if (!res.headersSent) {
          res.writeHead(502);
        }
        res.end();
      }
    })();
  };
}

/**
 * Factory: build the `http.Server` wired to the request lifecycle. Does NOT
 * call `.listen()` — `index.ts` (task 2.8) owns binding to port 8080.
 */
export function createGatewayServer(
  config: GatewayServerConfig,
): http.Server {
  return http.createServer(createHandler(config));
}

/**
 * Convenience default export mirror of the config reader so a bare
 * `createGatewayServer(readConfig())` call site stays ergonomic.
 */
export { readConfig };
