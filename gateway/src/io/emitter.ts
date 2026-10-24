import type { SirenEvent } from "../../../shared/events";
import type { SessionState } from "../types";

/**
 * Minimal structural view of the current request that `buildSirenEvent`
 * needs. The richer `RequestMeta` type lives in `detector/signals.ts`
 * (built in a later task); this local type captures only the fields the
 * emitter reads so the module has no dependency on an unbuilt file.
 */
type CurrentRequest = {
  method: string;
  path: string;
  body: string;
  userAgent: string;
};

/**
 * Pure: assemble the single SirenEvent for a handled request from
 * already-computed state. Performs no I/O; `ts` comes from `tsEmit`.
 * Requirement 9.1-9.4.
 */
export function buildSirenEvent(args: {
  session: SessionState;
  current: CurrentRequest;
  status: number;
  route: "decoy" | "maze";
  flaggedAfterScoring: boolean;
  tsEmit: number;
}): SirenEvent {
  const { session, current, status, route, flaggedAfterScoring, tsEmit } = args;

  const ev: SirenEvent = {
    session_id: session.sessionId,
    ts: tsEmit,
    method: current.method,
    path: current.path,
    user_agent: current.userAgent,
    body_snippet: current.body.slice(0, 500),
    status,
    route,
    ai_score: session.aiScore,
    signals: Array.from(session.signals),
    flagged: flaggedAfterScoring,
    est_tokens_burned: session.estTokensBurned,
    est_usd_burned: session.estUsdBurned,
  };

  if (session.modelClaim !== undefined) {
    ev.model_claim = session.modelClaim;
  }
  if (session.statedGoal !== undefined) {
    ev.stated_goal = session.statedGoal;
  }
  if (session.latestPrediction !== undefined) {
    ev.prediction = session.latestPrediction;
  }

  return ev;
}

/**
 * The sink the impure `emit` broadcasts/persists through. Injected by
 * `index.ts` (task 2.8), which wires the WS server's `broadcast` /
 * `recordForReplay` plus the ReplayWriter's `append`. Keeping the sink
 * out of this module lets `emit` stay testable and avoids owning the
 * singletons here.
 */
export type EmitterSink = {
  broadcast(ev: SirenEvent): void;
  recordForReplay(ev: SirenEvent): void;
  append(ev: SirenEvent): void;
};

let sink: EmitterSink | undefined;

/** Inject the broadcast/record/append dependencies. */
export function configureEmitter(s: EmitterSink): void {
  sink = s;
}

/**
 * Impure: broadcast the event over WS, record it in the replay ring
 * buffer, and append it to the Replay_File. Called exactly once per
 * request. Requirement 9 (9.6/9.7).
 */
export function emit(ev: SirenEvent): void {
  if (!sink) {
    throw new Error("emitter not configured");
  }
  sink.recordForReplay(ev);
  sink.broadcast(ev);
  sink.append(ev);
}
