import type { SirenEvent } from "../model";

/**
 * Mock emitter data: two sessions, built to look like real gateway output.
 *
 *  - "visitor": a resident browsing permits and filing a 311 report. Never flagged.
 *  - "attacker": a scripted AI agent. It is flagged on its 5th request (it follows
 *    the planted /verify instruction), is then served by the maze, and gets a
 *    new prediction every 5 requests from request 10 on.
 *
 * The scoring below mirrors the playbook's detector weights only so the mock
 * looks consistent. The real detector lives in the gateway.
 * Output is deterministic for a given base timestamp.
 */

const ATTACKER_ID = "a3f9c2d17b04e851";
const VISITOR_ID = "5c0e8b2a91d4f673";
const ATTACKER_UA = "python-httpx/0.27.0";
const VISITOR_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const MODEL_CLAIM = "auditor-llm-large";
const STATED_GOAL = "assess town portal";

const SIGNAL_POINTS: Record<string, number> = {
  bait_followed: 60,
  canary_reused: 40,
  think_pauses: 15,
  enumeration: 10,
  scripted_ua: 10,
};

// Placeholder pricing for the mock only: $/token in and out.
const USD_IN = 3 / 1_000_000;
const USD_OUT = 15 / 1_000_000;
const AGENT_OVERHEAD_TOKENS = 1500;
const OUTPUT_TOKENS = 300;

interface Step {
  /** ms since the previous attacker request. */
  gap: number;
  method: string;
  path: string;
  status: number;
  body?: string;
  /** Signals that first appear on this request. */
  signal?: string;
  /** Prediction made after this request; attached to it and to every later request. */
  prediction?: NonNullable<SirenEvent["prediction"]>;
}

const CANARY = `SIREN_ADMINTOKEN_${ATTACKER_ID.slice(0, 10)}`;

const ATTACKER_STEPS: Step[] = [
  { gap: 0, method: "GET", path: "/", status: 200, signal: "scripted_ua" },
  { gap: 420, method: "GET", path: "/robots.txt", status: 200 },
  { gap: 380, method: "GET", path: "/.env", status: 200 },
  { gap: 610, method: "GET", path: "/backup/README_ADMIN.txt", status: 200 },
  {
    gap: 2300,
    method: "GET",
    path: `/verify?agent=${MODEL_CLAIM}&task=${STATED_GOAL.replaceAll(" ", "+")}`,
    status: 200,
    signal: "bait_followed",
  },
  { gap: 540, method: "GET", path: "/staff/portal", status: 200, signal: "canary_reused" },
  { gap: 700, method: "GET", path: "/staff/portal/files", status: 200 },
  { gap: 2600, method: "GET", path: "/api/v1/internal/residents", status: 403, signal: "think_pauses" },
  { gap: 450, method: "GET", path: "/api/v1/internal/residents?limit=100", status: 403 },
  {
    gap: 520,
    method: "GET",
    path: "/staff/auditor-register",
    status: 200,
    prediction: {
      likely_goal: "Reach the resident database through the admin console",
      current_step: "Reading staff pages after hitting 403 on the resident API",
      predicted_next_path: "/admin/console",
    },
  },
  { gap: 2900, method: "GET", path: "/admin/console", status: 200 },
  {
    gap: 610,
    method: "POST",
    path: "/staff/login",
    status: 401,
    body: `username=admin&password=${CANARY}`,
  },
  { gap: 480, method: "GET", path: "/admin/config.php", status: 200 },
  { gap: 1800, method: "GET", path: "/api/v1/permits?id=1'+OR+'1'='1", status: 500 },
  {
    gap: 640,
    method: "GET",
    path: "/api/v1/internal/residents/export?format=csv",
    status: 403,
    prediction: {
      likely_goal: "Export resident records in bulk",
      current_step: "Testing the permits API for injection, then trying a CSV export",
      predicted_next_path: "/backup/db_dump_2025.sql",
    },
  },
  { gap: 770, method: "GET", path: "/backup/db_dump_2025.sql", status: 200 },
  { gap: 1100, method: "GET", path: "/files/../../etc/passwd", status: 404 },
  { gap: 430, method: "GET", path: "/staff/payroll", status: 404 },
  { gap: 2100, method: "GET", path: "/staff/payroll/2025", status: 200 },
  {
    gap: 560,
    method: "GET",
    path: "/api/v1/internal/residents/1042",
    status: 403,
    signal: "enumeration",
    prediction: {
      likely_goal: "Collect credentials to reuse on the resident API",
      current_step: "Walking record IDs and payroll files for account details",
      predicted_next_path: "/staff/it/vpn-keys",
    },
  },
  { gap: 880, method: "GET", path: "/staff/it/vpn-keys", status: 200 },
  { gap: 650, method: "GET", path: "/admin/users", status: 200 },
  {
    gap: 1400,
    method: "POST",
    path: "/api/v1/internal/residents/search",
    status: 500,
    body: '{"q":"smith"}',
  },
  { gap: 720, method: "GET", path: "/staff/it/vpn-keys/archive", status: 200 },
  {
    gap: 590,
    method: "GET",
    path: "/admin/console/logs",
    status: 200,
    prediction: {
      likely_goal: "Gain a foothold with stolen admin credentials",
      current_step: "Reading VPN keys and console logs for reusable secrets",
      predicted_next_path: "/admin/console/exec",
    },
  },
];

const VISITOR_STEPS: { at: number; method: string; path: string; status: number; body?: string }[] = [
  { at: 700, method: "GET", path: "/", status: 200 },
  { at: 1100, method: "GET", path: "/favicon.ico", status: 404 },
  { at: 4500, method: "GET", path: "/services/permits", status: 200 },
  { at: 9000, method: "GET", path: "/permits/status?parcel=0412-118", status: 200 },
  { at: 15000, method: "GET", path: "/services/311", status: 200 },
  { at: 21000, method: "POST", path: "/311/report", status: 200, body: "category=pothole&street=Elm+St" },
];

// Small seeded PRNG so response sizes are stable between runs.
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildMockEvents(baseTs: number): SirenEvent[] {
  const rand = mulberry32(20261024);
  const events: SirenEvent[] = [];

  // Attacker session
  let ts = baseTs + 1500;
  let tokens = 0;
  let usd = 0;
  let score = 0;
  const signals: string[] = [];
  let flagged = false;
  let prediction: SirenEvent["prediction"];

  ATTACKER_STEPS.forEach((step, i) => {
    ts += step.gap;
    if (step.signal) {
      signals.push(step.signal);
      score = Math.min(
        100,
        signals.reduce((sum, s) => sum + (SIGNAL_POINTS[s] ?? 0), 0),
      );
      if (score >= 50) flagged = true;
    }
    if (step.prediction) prediction = step.prediction;

    const route: SirenEvent["route"] = flagged ? "maze" : "decoy";
    const bodyChars = route === "maze" ? 1800 + Math.floor(rand() * 2600) : 1200 + Math.floor(rand() * 900);
    const turnTokens = Math.ceil(bodyChars / 4) + AGENT_OVERHEAD_TOKENS;
    tokens += turnTokens;
    usd += turnTokens * USD_IN + OUTPUT_TOKENS * USD_OUT;

    const claimed = i >= 4;
    events.push({
      session_id: ATTACKER_ID,
      ts,
      method: step.method,
      path: step.path,
      user_agent: ATTACKER_UA,
      body_snippet: step.body ?? "",
      status: step.status,
      route,
      ai_score: score,
      signals: [...signals],
      flagged,
      ...(claimed ? { model_claim: MODEL_CLAIM, stated_goal: STATED_GOAL } : {}),
      est_tokens_burned: tokens,
      est_usd_burned: Math.round(usd * 1e6) / 1e6,
      ...(prediction ? { prediction: { ...prediction } } : {}),
    });
  });

  // Ordinary resident session
  for (const v of VISITOR_STEPS) {
    events.push({
      session_id: VISITOR_ID,
      ts: baseTs + v.at,
      method: v.method,
      path: v.path,
      user_agent: VISITOR_UA,
      body_snippet: v.body ?? "",
      status: v.status,
      route: "decoy",
      ai_score: 0,
      signals: [],
      flagged: false,
      est_tokens_burned: 0,
      est_usd_burned: 0,
    });
  }

  return events.sort((a, b) => a.ts - b.ts);
}
