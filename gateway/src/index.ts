/**
 * Siren Gateway process entry point (task 2.8, extended by task 9.1).
 *
 * Wires the independently-built modules into a running process so the
 * transparent proxy and the event stream run end to end BEFORE the detector
 * exists:
 *
 *   config  -> readConfig()            (DECOY_URL / REPLAY_DIR, Req 2.5/2.6/9.9)
 *   WS       -> startWsServer(8090)     (dashboard event stream, Req 9.5)
 *   replay   -> new ReplayWriter(...)   (per-run JSONL log, Req 9.8/9.9)
 *   emitter  -> configureEmitter(sink)  (so emit() can fan out to WS + replay)
 *   HTTP     -> createGatewayServer()   (transparent proxy on 8080, Req 2.1)
 *
 * The session store is an in-memory singleton consumed inside `io/server.ts`
 * (via `getOrCreateSession`), so there is nothing to wire for it here — booting
 * the HTTP server is sufficient to make it live.
 *
 * Task 9.1 adds process-level `unhandledRejection` / `uncaughtException`
 * handlers (log and keep running, Req 11.5). They are registered BEFORE
 * `main()` runs so failures during startup wiring are also caught.
 */
import { readConfig } from "./config";
import { startWsServer } from "./io/wsServer";
import { ReplayWriter } from "./io/replay";
import { configureEmitter } from "./io/emitter";
import { createGatewayServer } from "./io/server";

const HTTP_PORT = 8080;
const WS_PORT = 8090;

/** Format an unknown thrown value / rejection reason, with stack if present. */
function describe(value: unknown): string {
  if (value instanceof Error) return value.stack ?? `${value.name}: ${value.message}`;
  try {
    return typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * A port-bind failure (EADDRINUSE, EACCES, ...) surfaces as an 'error' event
 * with `syscall === "listen"`. Swallowing it would leave a process that looks
 * alive but is not serving on 8080/8090, so these are treated as fatal.
 */
function isListenError(err: unknown): err is NodeJS.ErrnoException {
  return (
    err instanceof Error && (err as NodeJS.ErrnoException).syscall === "listen"
  );
}

function fatalListenError(what: string, port: number, err: NodeJS.ErrnoException): never {
  // eslint-disable-next-line no-console
  console.error(
    `[gateway] FATAL: ${what} failed to listen on :${port} (${err.code ?? "unknown"}): ${err.message}`,
  );
  process.exit(1);
}

/**
 * Process-level resilience handlers (task 9.1, Req 11.5).
 *
 * Both log and keep the process running, so one bad request path can never
 * take down the proxy. The single exception is a listen failure: `ws`'s
 * WebSocketServer re-emits its internal HTTP server's 'error' on itself, and
 * `startWsServer` does not expose the instance to attach a listener to. With
 * no listener that error becomes an uncaughtException, so we detect it here
 * (syscall === "listen") and exit non-zero instead of swallowing it.
 */
function registerProcessHandlers(): void {
  process.on("unhandledRejection", (reason) => {
    // eslint-disable-next-line no-console
    console.error(`[gateway] unhandledRejection (continuing): ${describe(reason)}`);
  });

  process.on("uncaughtException", (err) => {
    if (isListenError(err)) {
      // Node attaches the offending port to listen errors (e.g. 8090 for WS).
      const port = Number((err as { port?: unknown }).port) || 0;
      fatalListenError(port === WS_PORT ? "WebSocket server" : "server", port, err);
    }
    // eslint-disable-next-line no-console
    console.error(`[gateway] uncaughtException (continuing): ${describe(err)}`);
  });
}

function main(): void {
  // 1. Resolve configuration from the environment (pure read).
  const config = readConfig();

  // 2. Fix a single start time; it names the replay file and anchors the run.
  const startTime = Date.now();

  // 3. Start the WebSocket server that streams events to dashboards (Req 9.5).
  //    A bind failure on 8090 is handled by the uncaughtException handler
  //    above (exit 1), since the WebSocketServer instance isn't exposed.
  const ws = startWsServer(WS_PORT);

  // 4. Create the replay writer. The constructor creates the replay dir if
  //    absent and targets `<replayDir>/<startTime>.jsonl` (Req 9.8, 9.9).
  const replay = new ReplayWriter(config.replayDir, startTime);

  // 5. Configure the emitter sink so `emit()` inside the request handler can
  //    broadcast over WS, record into the replay ring buffer, and append to
  //    the replay file. The WS functions are returned as standalone closures,
  //    but we arrow-wrap them so correctness never depends on `this` binding.
  configureEmitter({
    broadcast: (ev) => ws.broadcast(ev),
    recordForReplay: (ev) => ws.recordForReplay(ev),
    append: (ev) => replay.append(ev),
  });

  // 6. Create and start the HTTP server (transparent proxy, Req 2.1). The
  //    factory does not call .listen(); binding the port is owned here.
  const server = createGatewayServer({ decoyUrl: config.decoyUrl });

  // A listen failure (e.g. EADDRINUSE on 8080) is emitted as 'error' on the
  // server. Without this listener it would become an uncaughtException; we
  // handle it explicitly so a gateway that can't bind exits non-zero rather
  // than lingering without serving. Non-listen server errors are logged only.
  server.on("error", (err: NodeJS.ErrnoException) => {
    if (isListenError(err)) fatalListenError("HTTP proxy", HTTP_PORT, err);
    // eslint-disable-next-line no-console
    console.error(`[gateway] HTTP server error (continuing): ${describe(err)}`);
  });

  server.listen(HTTP_PORT, () => {
    // 7. Announce both listeners so a boot check can confirm readiness.
    // eslint-disable-next-line no-console
    console.log(
      `[gateway] HTTP proxy listening on :${HTTP_PORT} -> decoy ${config.decoyUrl}`,
    );
    // eslint-disable-next-line no-console
    console.log(`[gateway] WebSocket event stream listening on :${WS_PORT}`);
    // eslint-disable-next-line no-console
    console.log(`[gateway] replay log: ${config.replayDir}/${startTime}.jsonl`);
  });
}

// Handlers first, so a throw/rejection during startup wiring is also caught.
registerProcessHandlers();
main();
