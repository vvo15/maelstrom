/**
 * HTTP request handler and request-lifecycle orchestration (Requirement 2, 9, 11.1).
 *
 * This is the PHASE-1 (proxy + stream) version of the handler, with the
 * Detector stubbed to "no signals": every request is forwarded transparently
 * to the Decoy, and exactly one `SirenEvent` is emitted per request with
 * `ai_score` 0, `signals` [], `flagged` false, and `route` "decoy". These
 * values come from the freshly-created session state (which initializes
 * aiScore=0, an empty signals set, flagged=false), so the stubbed behavior is
 * satisfied without any detector code.
 *
 * The session id comes from the pure `detector/sessionId.ts#deriveSessionId`
 * (Req 1.1). Later tasks wire in detection, routing to the Maze, burn
 * accounting, and prediction (tasks 6.x).
 *
 * Ordering guarantees honored here:
 * - De-header FIRST (Req 1.2): the inbound `x-siren-session` is stripped from
 *   `req.headers` before any further processing, so a client cannot inject or
 *   forge a session through that header.
 * - Decoy failure -> 502 (Req 11.1): the try/catch wraps ONLY the
 *   `forwardToDecoy` call. A connection error or the 10s AbortController
 *   timeout is mapped to a 502 outcome (empty body, no decoy headers).
 * - Exactly one event per request (Req 9.1, 11.1): success and 502 outcomes
 *   both funnel into a single build-and-emit point that runs once. Failures
 *   after that point (emit or response write) are logged and never cause a
 *   second emit.
 * - Client aborts mid-upload: if reading the request body fails, the request
 *   never completed (Req 9.1 is "WHEN a request completes"), nothing was
 *   forwarded, and there is no client left to answer. The failure is logged,
 *   the response is destroyed, and NO event is emitted.
 * - Byte-accurate forwarding (Req 2.4): the Decoy response is written to the
 *   client as raw `bodyBytes` with the already-de-headered `headers`.
 */
import http from "node:http";

import { readConfig } from "../config";
import { deriveSessionId } from "../detector/sessionId";
import { getOrCreateSession } from "../session/sessionStore";
import { forwardToDecoy } from "./decoy";
import { buildSirenEvent, emit } from "./emitter";

/** Inbound header a client might send to try to forge a session (Req 1.2). */
const SESSION_HEADER = "x-siren-session";

/** Status returned to the client when the Decoy fails or times out (Req 11.1). */
const DECOY_FAILURE_STATUS = 502;

/**
 * Configuration the server factory needs. Accepts the full `Config` shape so
 * `index.ts` (task 2.8) can pass `readConfig()` directly, but only `decoyUrl`
 * is read in this phase.
 */
export type GatewayServerConfig = {
  decoyUrl: string;
};

/** Terminal outcome of the forwarding step, success or mapped failure. */
type Outcome = {
  status: number;
  headers: Record<string, string>;
  bodyBytes: Buffer;
};

/** Collect the full request body into a Buffer, then decode as UTF-8. */
function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
    // A client that disconnects mid-upload may emit "aborted"/"close" without
    // "end"; reject so the lifecycle can't hang on a never-settling promise.
    req.on("aborted", () => reject(new Error("request aborted by client")));
  });
}

/** True when the error came from the AbortController timeout in decoy.ts. */
function isAbortError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "name" in err &&
    ((err as { name: unknown }).name === "AbortError" ||
      (err as { name: unknown }).name === "TimeoutError")
  );
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

    // Step 2: derive the session id via the pure `deriveSessionId` (step 3,
    // Req 1.1) and get/create its state (step 4). These don't depend on the body.
    const sessionId = deriveSessionId(sourceIp, userAgent);
    const session = getOrCreateSession(sessionId);

    void (async () => {
      // Read the body. A failure here means the client aborted the upload:
      // log, destroy the response, and emit nothing (see header comment).
      let body: string;
      try {
        body = await readBody(req);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[gateway] failed to read request body, dropping request:", err);
        res.destroy();
        return;
      }

      // Step 5: forward to the Decoy. The try/catch wraps ONLY this call so
      // a throw from emit or the response write can never reach it (Req 11.1).
      let outcome: Outcome;
      try {
        const result = await forwardToDecoy(
          config.decoyUrl,
          method,
          path,
          body,
          sessionId,
        );
        outcome = {
          status: result.status,
          headers: result.headers,
          bodyBytes: result.bodyBytes,
        };
      } catch (err) {
        const kind = isAbortError(err) ? "timeout (AbortError)" : "connection error";
        // eslint-disable-next-line no-console
        console.error(
          `[gateway] decoy request failed: ${kind}; responding ${DECOY_FAILURE_STATUS}:`,
          err,
        );
        // 502 outcome: empty body, no decoy headers.
        outcome = {
          status: DECOY_FAILURE_STATUS,
          headers: {},
          bodyBytes: Buffer.alloc(0),
        };
      }

      // Steps 6-7: the single build-and-emit point, reached exactly once for
      // both success and 502. In this stubbed phase ai_score=0, signals=[],
      // flagged=false come from the fresh session state; route is "decoy".
      try {
        const ev = buildSirenEvent({
          session,
          current: { method, path, body, userAgent },
          status: outcome.status,
          route: "decoy",
          flaggedAfterScoring: false,
          tsEmit: Date.now(),
        });
        emit(ev);
      } catch (err) {
        // Never retry: a partial emit may already have reached a sink.
        // eslint-disable-next-line no-console
        console.error("[gateway] failed to emit event:", err);
      }

      // Step 8: write the response. Failures here are logged only; the event
      // has already been emitted and must not be emitted again.
      try {
        res.writeHead(outcome.status, outcome.headers);
        res.end(outcome.bodyBytes);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[gateway] failed to write response:", err);
        res.destroy();
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
