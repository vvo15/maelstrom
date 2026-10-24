/**
 * Pure routing decision (Requirement 2.2, 6.1-6.4, 10.1; Property 3).
 * No I/O and no module state: equal arguments always yield equal results.
 */

export type RouteDecision = "decoy" | "maze";

/**
 * Routing uses the PRE-scoring flagged state: the caller must capture
 * `session.flagged` BEFORE scoring/latching the current request.
 *
 *   false -> "decoy"  (benign request, or the first-flagging request, which
 *                      still reaches the Decoy even though its emitted
 *                      `flagged` is the post-scoring `true`)
 *   true  -> "maze"   (session was already flagged by an earlier request)
 */
export function decideRoute(flaggedBeforeScoring: boolean): RouteDecision {
  return flaggedBeforeScoring ? "maze" : "decoy";
}
