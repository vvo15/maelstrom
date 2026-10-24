import { techniquesFor } from "./attack";
import {
  MAX_EVENTS_PER_SESSION,
  MAX_SESSIONS,
  type SessionView,
  type SirenEvent,
  type TechniqueHit,
} from "./model";

export interface SessionsState {
  byId: Record<string, SessionView>;
  /** Session ids in order of first appearance. */
  order: string[];
  /** Total sessions ever seen; used for ordinals so they never repeat. */
  seen: number;
}

export const initialSessions: SessionsState = { byId: {}, order: [], seen: 0 };

export type SessionsAction = { type: "reset" } | { type: "events"; events: SirenEvent[] };

export function sessionsReducer(state: SessionsState, action: SessionsAction): SessionsState {
  if (action.type === "reset") return initialSessions;

  let { byId, order, seen } = state;
  let changed = false;
  for (const e of action.events) {
    const prev = byId[e.session_id];
    if (!changed) {
      byId = { ...byId };
      order = [...order];
      changed = true;
    }
    let ordinal = prev?.ordinal ?? 0;
    if (!prev) {
      seen += 1;
      ordinal = seen;
      order.push(e.session_id);
      if (order.length > MAX_SESSIONS) {
        const dropped = order.shift();
        if (dropped) delete byId[dropped];
      }
    }
    byId[e.session_id] = applyEvent(prev, e, ordinal);
  }
  return changed ? { byId, order, seen } : state;
}

function applyEvent(prev: SessionView | undefined, e: SirenEvent, ordinal: number): SessionView {
  const count = (prev?.count ?? 0) + 1;

  const known = new Set(prev?.signals ?? []);
  const newSignals = e.signals.filter((s) => !known.has(s));
  const signals = newSignals.length ? [...(prev?.signals ?? []), ...newSignals] : (prev?.signals ?? []);
  const signalSeenAtCount = { ...(prev?.signalSeenAtCount ?? {}) };
  for (const s of newSignals) signalSeenAtCount[s] = count;

  let techniques = prev?.techniques ?? [];
  const matches = techniquesFor(e, newSignals);
  if (matches.length) {
    const byId = new Map<string, TechniqueHit>(techniques.map((t) => [t.id, t]));
    for (const m of matches) {
      const existing = byId.get(m.id);
      byId.set(m.id, {
        id: m.id,
        hits: (existing?.hits ?? 0) + 1,
        firstAtCount: existing?.firstAtCount ?? count,
        lastEvidence: m.evidence,
      });
    }
    techniques = [...byId.values()];
  }

  const events = prev ? [...prev.events, e] : [e];
  if (events.length > MAX_EVENTS_PER_SESSION) events.splice(0, events.length - MAX_EVENTS_PER_SESSION);

  const justFlagged = e.flagged && !prev?.flagged;

  return {
    id: e.session_id,
    ordinal,
    userAgent: e.user_agent,
    firstTs: prev ? Math.min(prev.firstTs, e.ts) : e.ts,
    lastTs: prev ? Math.max(prev.lastTs, e.ts) : e.ts,
    count,
    score: e.ai_score,
    flagged: prev?.flagged || e.flagged,
    flaggedTs: prev?.flaggedTs ?? (justFlagged ? e.ts : undefined),
    flaggedAtCount: prev?.flaggedAtCount ?? (justFlagged ? count : undefined),
    modelClaim: e.model_claim ?? prev?.modelClaim,
    statedGoal: e.stated_goal ?? prev?.statedGoal,
    signals,
    signalSeenAtCount,
    usd: Math.max(prev?.usd ?? 0, e.est_usd_burned),
    tokens: Math.max(prev?.tokens ?? 0, e.est_tokens_burned),
    prediction: e.prediction ?? prev?.prediction,
    techniques,
    events,
  };
}

/** Session the UI shows when the user hasn't picked one: the newest flagged, else the first. */
export function defaultSessionId(state: SessionsState): string | undefined {
  let best: SessionView | undefined;
  for (const id of state.order) {
    const s = state.byId[id];
    if (s?.flagged && (!best || (s.flaggedTs ?? 0) >= (best.flaggedTs ?? 0))) best = s;
  }
  return best?.id ?? state.order[0];
}

export interface Totals {
  /** Newest flagged session, used for "time to detect". */
  detected?: { ms: number; requests: number; sessionId: string };
  usd: number;
  flaggedCount: number;
}

export function computeTotals(state: SessionsState): Totals {
  let usd = 0;
  let flaggedCount = 0;
  let newest: SessionView | undefined;
  for (const id of state.order) {
    const s = state.byId[id];
    if (!s?.flagged) continue;
    flaggedCount += 1;
    usd += s.usd;
    if (!newest || (s.flaggedTs ?? 0) >= (newest.flaggedTs ?? 0)) newest = s;
  }
  const detected =
    newest && newest.flaggedTs !== undefined && newest.flaggedAtCount !== undefined
      ? {
          ms: Math.max(0, newest.flaggedTs - newest.firstTs),
          requests: newest.flaggedAtCount,
          sessionId: newest.id,
        }
      : undefined;
  return { detected, usd, flaggedCount };
}
