import type { Signal } from "../types";
import { SIGNAL_WEIGHTS } from "./signals";

/**
 * Pure scoring and flag latching (Requirement 5, Requirement 10.1/10.2).
 * No I/O and no module state: equal arguments always yield equal results.
 */

const MAX_SCORE = 100;
const FLAG_THRESHOLD = 50;

/**
 * Req 5.2. min(100, sum of weights of the recorded signals). Duplicates in
 * the iterable are counted once (Req 4.6), so the result depends only on
 * the set of signals. Does not mutate its argument.
 */
export function scoreSignals(signals: Iterable<Signal>): number {
  const unique = new Set<Signal>(signals);
  let sum = 0;
  for (const s of unique) sum += SIGNAL_WEIGHTS[s];
  return Math.min(MAX_SCORE, sum);
}

/** Req 5.3. A session is flagged once its score reaches 50. */
export function hasFlagged(aiScore: number): boolean {
  return aiScore >= FLAG_THRESHOLD;
}

/** Req 5.4. Latch: once flagged, stays flagged. */
export function latchFlag(previouslyFlagged: boolean, aiScore: number): boolean {
  return previouslyFlagged || hasFlagged(aiScore);
}
