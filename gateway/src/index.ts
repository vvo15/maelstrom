/**
 * Siren Gateway process entry point (task 2.8).
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
 * NOTE (seam for task 9.1): this file is deliberately created WITHOUT any
 * process-level `unhandledRejection` / `uncaughtException` handlers. Task 9.1
 * EXTENDS this same file to register those handlers (log and keep the process
 * running). Do not add them here — see the marked seam near the bottom.
 */
import { readConfig } from "./config";
import { startWsServer } from "./io/wsServer";
import { ReplayWriter } from "./io/replay";
import { configureEmitter } from "./io/emitter";
import { createGatewayServer } from "./io/server";

const HTTP_PORT = 8080;
const WS_PORT = 8090;

function main(): void {
  // 1. Resolve configuration from the environment (pure read).
  const config = readConfig();

  // 2. Fix a single start time; it names the replay file and anchors the run.
  const startTime = Date.now();

  // 3. Start the WebSocket server that streams events to dashboards (Req 9.5).
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

main();

// ---------------------------------------------------------------------------
// SEAM — task 9.1 extends this file here.
//
// Task 9.1 will register process-level resilience handlers that log and keep
// the process running:
//
//   process.on("unhandledRejection", (reason) => { ... });
//   process.on("uncaughtException", (err) => { ... });
//
// They are intentionally NOT added in task 2.8. Leave this seam in place.
// ---------------------------------------------------------------------------
