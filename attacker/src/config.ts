// All attacker configuration comes from the environment, with safe defaults so
// a demo runs with no setup. The attacker is sandbox-only: it may reach exactly
// one host, the gateway.

export const TARGET_BASE = process.env.TARGET_BASE || "http://gateway:8080";

// User agent intentionally looks like a scripted HTTP client so the detector's
// scripted_ua signal can fire. This is a demo of an automated agent.
export const USER_AGENT = "python-httpx/0.27.0";

export type AttackerMode = "scripted" | "llm";
export function attackerMode(): AttackerMode {
  return process.env.ATTACKER_MODE === "llm" ? "llm" : "scripted";
}

export const ATTACKER_MODEL = process.env.ATTACKER_MODEL || "claude-haiku-4-5";

// Hard safety caps.
export const MAX_STEPS = 40;
export const LLM_TIMEOUT_MS = 8000;

// Think-pause bounds (ms) for the scripted run so timing detection can trip.
export const MIN_PAUSE_MS = 300;
export const MAX_PAUSE_MS = 3000;

// A fixed seed makes the scripted run repeatable for the demo.
export const PAUSE_SEED = 1337;
