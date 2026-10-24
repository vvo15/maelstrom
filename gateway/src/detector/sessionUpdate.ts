/**
 * Pure per-request session update (Requirement 2.2, 4.6, 5.2-5.4, 6.1-6.4,
 * 9.4, 10.1; Properties 2 and 3).
 *
 * The single place where one request's detect -> union -> score -> latch ->
 * route decisions are made. `io/server.ts` and the detector tests all call
 * this function, so production and the properties exercise identical logic.
 *
 * Pure: it never mutates `prev`, `prev.signals`, `history` or `current`,
 * performs no I/O and reads no clock. Callers write the returned values back
 * into the session store.
 */
import type { SirenEvent } from "../../../shared/events";
import type { Signal } from "../types";
import { detectSignals, type RequestMeta } from "./signals";
import { latchFlag, scoreSignals } from "./score";
import { decideRoute, type RouteDecision } from "./route";

/** The parts of session state the update reads. */
export type SessionSnapshot = { signals: ReadonlySet<Signal>; flagged: boolean };

export type SessionUpdate = {
  /** `prev.flagged`, captured before this request is scored. */
  flaggedBeforeScoring: boolean;
  /** Decided from the PRE-scoring flag (Req 2.2, 6.4). */
  route: RouteDecision;
  /** Signals this request detected (may repeat already-recorded ones). */
  newSignals: Signal[];
  /** Fresh Set: previous signals unioned with `newSignals` (Req 4.6). */
  signals: Set<Signal>;
  /** min(100, sum of weights) over `signals` (Req 5.2). */
  aiScore: number;
  /** Post-scoring, latched flag (Req 5.3, 5.4); emitted as `flagged` (Req 9.4). */
  flagged: boolean;
};

export function updateSession(
  prev: SessionSnapshot,
  history: readonly SirenEvent[],
  current: RequestMeta,
): SessionUpdate {
  const flaggedBeforeScoring = prev.flagged;
  const route = decideRoute(flaggedBeforeScoring);
  const newSignals = detectSignals(history, current);
  const signals = new Set<Signal>(prev.signals);
  for (const s of newSignals) signals.add(s);
  const aiScore = scoreSignals(signals);
  const flagged = latchFlag(flaggedBeforeScoring, aiScore);
  return { flaggedBeforeScoring, route, newSignals, signals, aiScore, flagged };
}
