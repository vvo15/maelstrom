import type { SessionState, Signal } from "../types";

/**
 * Module-level in-memory session store, keyed by session id. This is the
 * mutable accumulation point for per-session state (Req 10.1). The detector
 * stays pure by receiving snapshots of this state and returning values that
 * callers write back here.
 */
const sessions = new Map<string, SessionState>();

/**
 * Returns the existing session for `sessionId`, creating and registering a
 * fresh one with all accumulation fields initialized if none exists yet.
 */
export function getOrCreateSession(sessionId: string): SessionState {
  const existing = sessions.get(sessionId);
  if (existing !== undefined) {
    return existing;
  }
  const session: SessionState = {
    sessionId,
    signals: new Set<Signal>(),
    aiScore: 0,
    flagged: false,
    history: [],
    estTokensBurned: 0,
    estUsdBurned: 0,
    requestCount: 0,
  };
  sessions.set(sessionId, session);
  return session;
}

/**
 * Returns the existing session for `sessionId`, or undefined if none has been
 * created yet.
 */
export function getSession(sessionId: string): SessionState | undefined {
  return sessions.get(sessionId);
}
