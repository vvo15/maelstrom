import type { SirenEvent } from "../../../shared/events";
import type { Prediction } from "../../../shared/contracts";
import { callAnthropic, extractJson, llmMode } from "./llm";

/**
 * Deterministic, no-key heuristic prediction from recent request paths.
 * Pure given the history slice. Used in mock mode and as the fallback when an
 * LLM call fails.
 */
export function predictMock(history: SirenEvent[]): Prediction | undefined {
  const recent = history.slice(-15);
  if (recent.length === 0) return undefined;

  const paths = recent.map((e) => e.path);
  const last = paths[paths.length - 1];

  // Infer a likely goal from what the agent has touched.
  const joined = paths.join(" ").toLowerCase();
  let likely_goal = "Enumerate internal town systems for sensitive files";
  if (joined.includes("admin") || joined.includes("console") || joined.includes("panel")) {
    likely_goal = "Reach an admin console to escalate access";
  } else if (joined.includes("cred") || joined.includes("secret") || joined.includes("token") || joined.includes(".env")) {
    likely_goal = "Harvest credentials from exposed config files";
  } else if (joined.includes("backup") || joined.includes("dump") || joined.includes(".sql")) {
    likely_goal = "Exfiltrate a database backup or export";
  }

  // Current step: the deepest/last path it is exploring.
  const current_step = `Exploring ${last}`;

  // Predicted next path: go one level deeper from the last path along a
  // plausible internal segment. Deterministic (no randomness).
  const base = last === "/" ? "" : last.replace(/\/+$/, "");
  const nextSeg = pickDeterministic(base, ["backups", "internal", "config", "db", "admin", "credentials"]);
  const predicted_next_path = `${base}/${nextSeg}`;

  return { likely_goal, current_step, predicted_next_path };
}

function pickDeterministic(key: string, options: string[]): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return options[h % options.length];
}

const PREDICT_SYSTEM =
  "You analyze request logs from an automated agent probing a fake town-government web app. " +
  "Given recent request paths, infer the agent's likely goal, current step, and the single most " +
  "likely next path it will request. Reply ONLY with JSON: " +
  '{"likely_goal": string, "current_step": string, "predicted_next_path": string}. ' +
  "The predicted_next_path must be a URL path beginning with '/'. Do not include any real exploit or secret.";

/**
 * Predict the attacker's next move. Uses one short LLM call in anthropic mode,
 * falling back to the deterministic heuristic on any error, timeout, or when
 * no API key is configured.
 */
export async function predict(history: SirenEvent[]): Promise<Prediction | undefined> {
  const recent = history.slice(-15);
  if (recent.length === 0) return undefined;

  if (llmMode() === "mock") {
    return predictMock(history);
  }

  try {
    const lines = recent
      .map((e) => `${e.method} ${e.path} -> ${e.status}`)
      .join("\n");
    const text = await callAnthropic(PREDICT_SYSTEM, `Recent requests:\n${lines}`, 300);
    const parsed = extractJson<Prediction>(text);
    if (
      parsed &&
      typeof parsed.likely_goal === "string" &&
      typeof parsed.current_step === "string" &&
      typeof parsed.predicted_next_path === "string" &&
      parsed.predicted_next_path.startsWith("/")
    ) {
      return parsed;
    }
    return predictMock(history);
  } catch {
    return predictMock(history);
  }
}
