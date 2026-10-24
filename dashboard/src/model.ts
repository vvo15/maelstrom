import type { SirenEvent } from "../../shared/events";

export type { SirenEvent };

export type Prediction = NonNullable<SirenEvent["prediction"]>;

export type ViewMode = "technical" | "plain";

/** One ATT&CK technique seen in a session, with the evidence that triggered it. */
export interface TechniqueHit {
  id: string;
  hits: number;
  /** Request number (1-based) at which the technique first appeared. */
  firstAtCount: number;
  /** Short human-readable reason for the most recent hit. */
  lastEvidence: string;
}

/** Everything the UI needs about one session, derived from its events. */
export interface SessionView {
  id: string;
  /** 1-based order in which the session first appeared. */
  ordinal: number;
  userAgent: string;
  firstTs: number;
  lastTs: number;
  count: number;
  score: number;
  flagged: boolean;
  /** ts of the first flagged event. */
  flaggedTs?: number;
  /** Request number (1-based) of the first flagged event. */
  flaggedAtCount?: number;
  modelClaim?: string;
  statedGoal?: string;
  /** Signals in the order they first appeared. */
  signals: string[];
  /** Request number at which each signal first appeared. */
  signalSeenAtCount: Record<string, number>;
  usd: number;
  tokens: number;
  prediction?: Prediction;
  techniques: TechniqueHit[];
  /** Oldest first, capped at MAX_EVENTS_PER_SESSION. */
  events: SirenEvent[];
}

export const MAX_EVENTS_PER_SESSION = 400;
export const MAX_SESSIONS = 60;
