import type { SirenEvent } from "../../shared/events";
import type { Prediction } from "../../shared/contracts";

/**
 * The five named behavioral signals. Each has a fixed weight (see
 * detector/signals.ts). Requirement 4 / glossary "Signal".
 */
export type Signal =
  | "bait_followed"
  | "canary_reused"
  | "think_pauses"
  | "enumeration"
  | "scripted_ua";

/**
 * In-memory per-session accumulation state, keyed by session id in the
 * session store. The pure detector receives snapshots of this and returns
 * values the store writes back, so the detector itself stays I/O-free.
 */
export type SessionState = {
  sessionId: string;
  signals: Set<Signal>; // recorded at most once each (Req 4.6)
  aiScore: number; // 0..100 (Req 5.2)
  flagged: boolean; // latched true (Req 5.3/5.4)
  modelClaim?: string; // from /verify?agent= (Req 3.1)
  statedGoal?: string; // from /verify?task=  (Req 3.2)
  history: SirenEvent[]; // emitted events in order; feeds Maze + windows
  estTokensBurned: number; // running total, non-decreasing (Req 7)
  estUsdBurned: number; // running total, non-decreasing (Req 7)
  latestPrediction?: Prediction; // Req 8.3/8.4
  requestCount: number; // increments per handled request (Req 8.1)
};
