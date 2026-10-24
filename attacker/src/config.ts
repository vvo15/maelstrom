// All attacker configuration uses safe defaults so a demo runs with no setup.
// The HTTP tool is sandbox-only: its target is always the Compose gateway.

const GATEWAY_TARGET = "http://gateway:8080";
const configuredTarget = process.env.TARGET_URL ?? process.env.TARGET_BASE ?? GATEWAY_TARGET;

// Accept the Compose variable and the former TARGET_BASE name only when they
// preserve the fixed sandbox target. Configuration must never expand egress.
if (configuredTarget !== GATEWAY_TARGET) {
  throw new Error(
    `blocked: attacker target is fixed at ${GATEWAY_TARGET}; received ${configuredTarget}`
  );
}

export const TARGET_BASE = GATEWAY_TARGET;

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
