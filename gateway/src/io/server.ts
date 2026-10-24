/**
 * HTTP request handler and request-lifecycle orchestration (Requirement 2, 5,
 * 6, 9, 11.1).
 *
 * Per request: derive the session (Req 1.1), run the pure per-request session
 * update `detector/sessionUpdate.ts#updateSession` (detect -> union -> score
 * -> latch -> route), then either forward transparently to the Decoy or hand
 * the request to the Maze, and emit exactly one `SirenEvent`.
 *
 * `/verify` capture (Req 3.1, 3.2) runs right after the session update and
 * before routing/emitting, so the `/verify` request's own event already
 * carries `model_claim`/`stated_goal`.
 *
 * Burn accounting (Req 7, task 6.7) runs after the response body is produced
 * and before the single emit, so the event carries the updated totals.
 *
 * Prediction enrichment (Req 8, task 6.8) runs right after the history push
 * and requestCount increment: while flagged, at every count that is a
 * multiple of 5, `maze.predict` is fired and forgotten (see `firePredict`).
 * The stored latest prediction rides on each subsequent event.
 *
 * Enrichment failures (Req 11.3, 11.4, task 8.3): a `predict` throw or
 * rejection is logged and the previous prediction is kept; an
 * `estimateBurn` throw, thenable/rejected return, or non-object return is
 * logged and both burn totals are kept. Neither affects the response or
 * the single emit.
 *
 * Ordering guarantees honored here:
 * - De-header FIRST (Req 1.2): the inbound `x-siren-session` is stripped from
 *   `req.headers` before any further processing, so a client cannot inject or
 *   forge a session through that header, and it never reaches signal
 *   detection's `headerValues`.
 * - Pre-scoring flag drives routing (Req 2.2, 6.4): `updateSession` decides
 *   the route from the flag as it was BEFORE this request was scored. The
 *   request that first flags still goes to the Decoy; its emitted `flagged`
 *   is the post-scoring `true` (Req 9.4).
 * - Maze only via `./mazeAdapter` (Req 6.5, 6.6); never `../maze` directly.
 * - Decoy failure -> 502 (Req 11.1): the try/catch wraps ONLY the
 *   `forwardToDecoy` call. A connection error or the 10s AbortController
 *   timeout is mapped to a 502 outcome (empty body, no decoy headers).
 * - Maze failure -> 500 (Req 11.2): the try/catch wraps ONLY the
 *   `await maze.generate(...)` call, so both a rejected promise and a
 *   synchronous throw from `generate` are caught. The failure is mapped to a
 *   500 outcome with a copy of `DECOY_HEADERS` (so the switch stays
 *   invisible) and an empty body; the event carries `route = "maze"`.
 * - Exactly one event per request (Req 9.1, 11.1, 11.2): decoy success, 502,
 *   maze success and maze 500 outcomes all funnel into a single build-and-emit point that runs
 *   once. Right after emitting, the event is appended to `session.history`
 *   and `session.requestCount` is incremented, once each. Failures after that
 *   point (emit or response write) are logged and never cause a second emit.
 * - Client aborts mid-upload: if reading the request body fails, the request
 *   never completed (Req 9.1 is "WHEN a request completes"), nothing was
 *   forwarded, and there is no client left to answer. The failure is logged,
 *   the response is destroyed, and NO event is emitted and the session is
 *   left untouched.
 * - Byte-accurate forwarding (Req 2.4): the Decoy response is written to the
 *   client as raw `bodyBytes` with the already-de-headered `headers`.
 */
import http from "node:http";

import { DECOY_HEADERS, type MazeRequest } from "../../../shared/contracts";
import type { SirenEvent } from "../../../shared/events";
import { readConfig } from "../config";
import { applyBurn } from "../detector/burn";
import { deriveSessionId } from "../detector/sessionId";
import { updateSession } from "../detector/sessionUpdate";
import type { RequestMeta } from "../detector/signals";
import { parseVerifyQuery } from "../detector/verify";
import { getOrCreateSession } from "../session/sessionStore";
import type { SessionState } from "../types";
import { forwardToDecoy } from "./decoy";
import { buildSirenEvent, emit } from "./emitter";
import { maze } from "./mazeAdapter";

/** Inbound header a client might send to try to forge a session (Req 1.2). */
const SESSION_HEADER = "x-siren-session";

/** Status returned to the client when the Decoy fails or times out (Req 11.1). */
const DECOY_FAILURE_STATUS = 502;

/** Status returned when `maze.generate` throws or rejects (Req 11.2). */
const MAZE_FAILURE_STATUS = 500;

/**
 * Configuration the server factory needs. Accepts the full `Config` shape so
 * `index.ts` (task 2.8) can pass `readConfig()` directly, but only `decoyUrl`
 * is read here.
 */
export type GatewayServerConfig = {
  decoyUrl: string;
};

/** Terminal outcome of the decoy/maze step, success or mapped failure. */
type Outcome = {
  status: number;
  headers: Record<string, string>;
  bodyBytes: Buffer;
  /** UTF-8 response body text, used only for `maze.estimateBurn` (Req 7.1). */
  bodyText: string;
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

/** Every inbound header value, with array-valued headers flattened. */
function flattenHeaderValues(headers: http.IncomingHttpHeaders): string[] {
  const out: string[] = [];
  for (const v of Object.values(headers)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) out.push(...v);
    else out.push(v);
  }
  return out;
}

/** True for any value with a callable `then` (Promise or Promise-like). */
function isThenable(v: unknown): v is PromiseLike<unknown> {
  return (
    (typeof v === "object" || typeof v === "function") &&
    v !== null &&
    typeof (v as { then?: unknown }).then === "function"
  );
}

let warnedAsyncEstimateBurn = false;

/** Warn once per process that `estimateBurn` returned a thenable (Req 11.4). */
function warnAsyncEstimateBurnOnce(): void {
  if (warnedAsyncEstimateBurn) return;
  warnedAsyncEstimateBurn = true;
  // eslint-disable-next-line no-console
  console.warn(
    "[gateway] maze.estimateBurn returned a Promise; the contract is synchronous. " +
      "Async estimates are not supported and are treated as failed (burn totals unchanged).",
  );
}

/**
 * Per-session predict sequencing. `issued` is the seq of the most recently
 * started call; `applied` is the seq of the call whose Prediction is stored.
 * Kept in a WeakMap so `SessionState` is unchanged and entries die with it.
 */
const predictSeq = new WeakMap<SessionState, { issued: number; applied: number }>();

/**
 * Fire-and-forget `maze.predict` (Req 8.1, 8.2). Never awaited by the caller.
 *
 * - The history is passed as a snapshot copy so later pushes don't mutate
 *   what the Maze holds.
 * - `Promise.resolve().then(...)` turns a synchronous throw from `predict`
 *   into a rejection, so it can't escape into the request path.
 * - A resolve with `undefined` is not a Prediction: the previous one is kept
 *   (Req 8.3 is "resolves with a Prediction").
 * - Out-of-order guard: calls can overlap (a slow call at count 5 may still
 *   be pending at count 10). A result is stored only if its seq is newer
 *   than the seq of the currently stored Prediction, so an older call that
 *   resolves late never overwrites a newer result.
 * - The stored Prediction is attached to each subsequent event by
 *   `buildSirenEvent` (Req 8.4).
 */
function firePredict(session: SessionState): void {
  const state = predictSeq.get(session) ?? { issued: 0, applied: 0 };
  predictSeq.set(session, state);
  const seq = ++state.issued;
  const snapshot = session.history.slice();
  void Promise.resolve()
    .then(() => maze.predict(snapshot))
    .then((p) => {
      if (p === undefined || seq <= state.applied) return;
      state.applied = seq;
      session.latestPrediction = p;
    })
    .catch((err: unknown) => {
      // Req 11.3: log and leave latestPrediction unchanged. The sequence
      // guard is untouched, so a failed call never blocks later results.
      // eslint-disable-next-line no-console
      console.error("[gateway] maze.predict failed; latest prediction unchanged:", err);
    });
}

/**
 * Build the request handler bound to the given config. Each invocation runs
 * the full lifecycle for one request.
 */
function createHandler(
  config: GatewayServerConfig,
): http.RequestListener {
  return (req, res) => {
    // Arrival time, used by the time-window signals (Req 4.3, 4.4).
    const ts = Date.now();

    // Step 1: strip the inbound session header before anything else (Req 1.2).
    delete req.headers[SESSION_HEADER];

    // Capture request shape now; the socket address is read before the body
    // is consumed to avoid any dependency on stream state.
    const method = req.method ?? "GET";
    const url = req.url ?? "/";
    const q = url.indexOf("?");
    const path = q === -1 ? url : url.slice(0, q);
    const sourceIp = req.socket.remoteAddress ?? "";
    const userAgent = (req.headers["user-agent"] as string | undefined) ?? "";
    // Read AFTER the session header was deleted (Req 1.2).
    const headerValues = flattenHeaderValues(req.headers);

    // Step 2: derive the session id via the pure `deriveSessionId` (Req 1.1)
    // and get/create its state. These don't depend on the body.
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

      // Step 3: pure session update (Req 4, 5.2-5.4, 2.2, 6.4), then write
      // the results back into the store.
      const meta: RequestMeta = { method, path, url, body, userAgent, headerValues, ts };
      const update = updateSession(
        { signals: session.signals, flagged: session.flagged },
        session.history,
        meta,
      );
      session.signals = update.signals;
      session.aiScore = update.aiScore;
      session.flagged = update.flagged;
      const route = update.route;

      // Step 3b: `/verify` capture (Req 3.1, 3.2). Exact path match; a field
      // is overwritten only when its parameter is present (empty value
      // stores ""), so a later `/verify` without `agent` keeps the earlier
      // claim. Done before routing/emit so this request's event carries it.
      const verify = parseVerifyQuery(path, url);
      if (verify.agent !== undefined) session.modelClaim = verify.agent;
      if (verify.task !== undefined) session.statedGoal = verify.task;

      // Step 4: decoy or maze.
      let outcome: Outcome;
      if (route === "decoy") {
        // The try/catch wraps ONLY this call so a throw from emit or the
        // response write can never reach it (Req 11.1).
        try {
          const result = await forwardToDecoy(
            config.decoyUrl,
            method,
            url,
            body,
            sessionId,
          );
          outcome = {
            status: result.status,
            headers: result.headers,
            bodyBytes: result.bodyBytes,
            bodyText: result.body,
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
            bodyText: "",
          };
        }
      } else {
        // Req 6.1, 6.2: hand the request and session history to the Maze.
        const mazeReq: MazeRequest = {
          session_id: sessionId,
          method,
          path,
          body,
          history: session.history,
        };
        // The try/catch wraps ONLY this call (Req 11.2). `await` inside the
        // try catches both a rejected promise and a synchronous throw.
        try {
          const r = await maze.generate(mazeReq);
          outcome = {
            status: r.status,
            headers: r.headers,
            bodyBytes: Buffer.from(r.body, "utf8"),
            bodyText: r.body,
          };
        } catch (err) {
          // 500 outcome with the decoy's headers so the switch stays
          // invisible; empty body (burned as "", task 6.7). The request
          // still reaches the single emit point below with route "maze".
          // eslint-disable-next-line no-console
          console.error(
            `[gateway] maze.generate failed; responding ${MAZE_FAILURE_STATUS}:`,
            err,
          );
          outcome = {
            status: MAZE_FAILURE_STATUS,
            // Copy so the shared constant is never mutated downstream.
            headers: { ...DECOY_HEADERS },
            bodyBytes: Buffer.alloc(0),
            bodyText: "",
          };
        }
      }

      // Step 4b: burn accounting (Req 7.1-7.5). Runs for EVERY outcome: the
      // 502/500 failure outcomes produce an empty body and are passed as ""
      // (a uniform rule; an empty body is expected to burn ~0). Uses the
      // session's model_claim as already updated by Step 3b, so a `/verify`
      // request is costed with its own new claim. `applyBurn` clamps
      // negative/NaN/Infinity to 0 and saturates at Number.MAX_VALUE, so both
      // totals stay finite and non-decreasing. Done before the emit so the
      // event carries the updated totals.
      //
      // Failure handling (Req 11.4): every failure logs and leaves BOTH
      // totals unchanged, and the single emit below is still reached.
      // - Synchronous throw: caught by the try/catch.
      // - Thenable return (contract says sync, but an implementation might
      //   be async at runtime): never awaited, so the response and this
      //   event aren't delayed or changed. A rejection handler is attached
      //   so it can't become an unhandled rejection; this request's
      //   estimate counts as failed.
      // - Non-object return (null/undefined): treated as a failure.
      // - Object with missing/non-number fields: `clampBurnValue` maps any
      //   non-finite value (including `undefined`) to 0.
      try {
        const burn = maze.estimateBurn(outcome.bodyText, session.modelClaim);
        const raw: unknown = burn; // runtime view; the contract type is not trusted
        if (isThenable(raw)) {
          warnAsyncEstimateBurnOnce();
          raw.then(undefined, (err: unknown) => {
            // eslint-disable-next-line no-console
            console.error("[gateway] maze.estimateBurn rejected; burn totals unchanged:", err);
          });
        } else if (typeof raw !== "object" || raw === null) {
          // eslint-disable-next-line no-console
          console.error("[gateway] maze.estimateBurn returned no estimate; burn totals unchanged:", raw);
        } else {
          session.estTokensBurned = applyBurn(session.estTokensBurned, burn.tokens);
          session.estUsdBurned = applyBurn(session.estUsdBurned, burn.usd);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[gateway] maze.estimateBurn failed; burn totals unchanged:", err);
      }

      // Step 5: the single build-and-emit point, reached exactly once for
      // every terminal outcome. ai_score/signals come from the updated
      // session; route is where the request actually went; flagged is the
      // post-scoring latched value (Req 9.4).
      let ev: SirenEvent | undefined;
      try {
        ev = buildSirenEvent({
          session,
          current: { method, path, body, userAgent },
          status: outcome.status,
          route,
          flaggedAfterScoring: update.flagged,
          tsEmit: Date.now(),
        });
        emit(ev);
      } catch (err) {
        // Never retry: a partial emit may already have reached a sink.
        // eslint-disable-next-line no-console
        console.error("[gateway] failed to emit event:", err);
      }
      // After emitting, exactly once per handled request: record the event
      // in the history the detection windows and the Maze read, and count
      // the request (task 6.8 depends on requestCount). Outside the try so a
      // sink failure can't skip them.
      if (ev !== undefined) session.history.push(ev);
      session.requestCount += 1;

      // Step 5b: non-blocking prediction enrichment (Req 8.1-8.4). Only
      // kicked off here, never awaited, so the response below is not delayed.
      if (session.flagged && session.requestCount % 5 === 0) {
        firePredict(session);
      }

      // Step 6: write the response. Failures here are logged only; the event
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
