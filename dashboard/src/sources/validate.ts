import type { SirenEvent } from "../model";

const isStr = (v: unknown): v is string => typeof v === "string";
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Runtime check for data from the network or a dropped file. Extra fields are
 * ignored; the dashboard never adds or rewrites fields.
 */
export function isSirenEvent(v: unknown): v is SirenEvent {
  if (typeof v !== "object" || v === null) return false;
  const e = v as Record<string, unknown>;
  if (
    !isStr(e.session_id) ||
    !isNum(e.ts) ||
    !isStr(e.method) ||
    !isStr(e.path) ||
    !isStr(e.user_agent) ||
    !isStr(e.body_snippet) ||
    !isNum(e.status) ||
    (e.route !== "decoy" && e.route !== "maze") ||
    !isNum(e.ai_score) ||
    !Array.isArray(e.signals) ||
    !e.signals.every(isStr) ||
    typeof e.flagged !== "boolean" ||
    !isNum(e.est_tokens_burned) ||
    !isNum(e.est_usd_burned)
  ) {
    return false;
  }
  if (e.model_claim !== undefined && !isStr(e.model_claim)) return false;
  if (e.stated_goal !== undefined && !isStr(e.stated_goal)) return false;
  if (e.prediction !== undefined) {
    const p = e.prediction as Record<string, unknown> | null;
    if (
      typeof p !== "object" ||
      p === null ||
      !isStr(p.likely_goal) ||
      !isStr(p.current_step) ||
      !isStr(p.predicted_next_path)
    ) {
      return false;
    }
  }
  return true;
}

export interface ParsedReplay {
  events: SirenEvent[];
  /** Non-empty lines that were not valid SirenEvent JSON. */
  skipped: number;
}

/** Parse .jsonl text: one SirenEvent per line. Bad lines are counted, not fatal. */
export function parseJsonl(text: string): ParsedReplay {
  const events: SirenEvent[] = [];
  let skipped = 0;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (isSirenEvent(parsed)) events.push(parsed);
      else skipped += 1;
    } catch {
      skipped += 1;
    }
  }
  return { events, skipped };
}
