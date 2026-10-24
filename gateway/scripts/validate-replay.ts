import fs from "node:fs";
import type { SirenEvent } from "../../shared/events";

/**
 * validate-replay
 *
 * Reads a replays/*.jsonl file and checks every line against the SirenEvent
 * type from shared/events.ts:
 *   - all required fields present with the right runtime types
 *   - route is "decoy" or "maze"
 *   - ai_score is between 0 and 100
 *
 * Prints a per-session summary (number of requests, time to flag, signals hit,
 * model_claim, final est_usd_burned) and exits with code 1 if any line is
 * invalid.
 *
 * Usage: npm run validate-replay -- path/to/file.jsonl
 */

type ValidationError = {
  line: number;
  reason: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Runtime validation of a parsed JSON value against the SirenEvent shape.
 * TypeScript types are erased at runtime, so every required field and its
 * type must be checked explicitly. Returns the list of problems found
 * (empty when the value is a valid SirenEvent).
 */
function validateEvent(value: unknown): string[] {
  const errors: string[] = [];

  if (!isPlainObject(value)) {
    return ["not a JSON object"];
  }

  const requireString = (key: string): void => {
    if (typeof value[key] !== "string") {
      errors.push(`field "${key}" must be a string`);
    }
  };
  const requireNumber = (key: string): void => {
    if (typeof value[key] !== "number" || Number.isNaN(value[key] as number)) {
      errors.push(`field "${key}" must be a number`);
    }
  };
  const requireBoolean = (key: string): void => {
    if (typeof value[key] !== "boolean") {
      errors.push(`field "${key}" must be a boolean`);
    }
  };

  // Required string fields.
  requireString("session_id");
  requireString("method");
  requireString("path");
  requireString("user_agent");
  requireString("body_snippet");

  // Required number fields.
  requireNumber("ts");
  requireNumber("status");
  requireNumber("ai_score");
  requireNumber("est_tokens_burned");
  requireNumber("est_usd_burned");

  // Required boolean field.
  requireBoolean("flagged");

  // route must be one of the two literals.
  if (value.route !== "decoy" && value.route !== "maze") {
    errors.push(`field "route" must be "decoy" or "maze"`);
  }

  // ai_score must be within 0..100 (only check the range if it is a number).
  if (typeof value.ai_score === "number" && !Number.isNaN(value.ai_score)) {
    if (value.ai_score < 0 || value.ai_score > 100) {
      errors.push(`field "ai_score" must be between 0 and 100`);
    }
  }

  // signals must be an array of strings.
  if (!Array.isArray(value.signals)) {
    errors.push(`field "signals" must be an array of strings`);
  } else if (!value.signals.every((s) => typeof s === "string")) {
    errors.push(`field "signals" must contain only strings`);
  }

  // Optional fields: validate only when present.
  if (value.model_claim !== undefined && typeof value.model_claim !== "string") {
    errors.push(`field "model_claim" must be a string when present`);
  }
  if (value.stated_goal !== undefined && typeof value.stated_goal !== "string") {
    errors.push(`field "stated_goal" must be a string when present`);
  }
  if (value.prediction !== undefined) {
    if (!isPlainObject(value.prediction)) {
      errors.push(`field "prediction" must be an object when present`);
    } else {
      const p = value.prediction;
      if (typeof p.likely_goal !== "string") {
        errors.push(`field "prediction.likely_goal" must be a string`);
      }
      if (typeof p.current_step !== "string") {
        errors.push(`field "prediction.current_step" must be a string`);
      }
      if (typeof p.predicted_next_path !== "string") {
        errors.push(`field "prediction.predicted_next_path" must be a string`);
      }
    }
  }

  return errors;
}

type SessionSummary = {
  sessionId: string;
  requests: number;
  firstTs: number;
  firstFlaggedTs: number | null;
  signals: Set<string>;
  modelClaim: string | undefined;
  finalUsdBurned: number;
};

function summarize(events: SirenEvent[]): SessionSummary[] {
  const bySession = new Map<string, SessionSummary>();

  for (const ev of events) {
    let summary = bySession.get(ev.session_id);
    if (!summary) {
      summary = {
        sessionId: ev.session_id,
        requests: 0,
        firstTs: ev.ts,
        firstFlaggedTs: null,
        signals: new Set<string>(),
        modelClaim: undefined,
        finalUsdBurned: 0,
      };
      bySession.set(ev.session_id, summary);
    }

    summary.requests += 1;
    if (ev.ts < summary.firstTs) {
      summary.firstTs = ev.ts;
    }
    if (ev.flagged && summary.firstFlaggedTs === null) {
      summary.firstFlaggedTs = ev.ts;
    }
    for (const signal of ev.signals) {
      summary.signals.add(signal);
    }
    if (ev.model_claim !== undefined) {
      summary.modelClaim = ev.model_claim;
    }
    // Final est_usd_burned is the value on the last event of the session.
    summary.finalUsdBurned = ev.est_usd_burned;
  }

  return [...bySession.values()];
}

function printSummary(summary: SessionSummary): void {
  const timeToFlag =
    summary.firstFlaggedTs === null
      ? "never flagged"
      : `${summary.firstFlaggedTs - summary.firstTs} ms`;
  const signals =
    summary.signals.size === 0 ? "(none)" : [...summary.signals].join(", ");
  const modelClaim =
    summary.modelClaim === undefined ? "(none)" : summary.modelClaim;

  console.log(`session ${summary.sessionId}`);
  console.log(`  requests: ${summary.requests}`);
  console.log(`  time to flag: ${timeToFlag}`);
  console.log(`  signals hit: ${signals}`);
  console.log(`  model_claim: ${modelClaim}`);
  console.log(`  final est_usd_burned: ${summary.finalUsdBurned}`);
}

function main(): void {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("usage: npm run validate-replay -- <path/to/file.jsonl>");
    process.exit(1);
  }

  let contents: string;
  try {
    contents = fs.readFileSync(filePath, "utf8");
  } catch (err) {
    console.error(`cannot read file "${filePath}": ${(err as Error).message}`);
    process.exit(1);
  }

  const lines = contents.split("\n");
  const errors: ValidationError[] = [];
  const events: SirenEvent[] = [];

  lines.forEach((raw, index) => {
    const lineNumber = index + 1;
    // Skip blank lines (e.g. a trailing newline at the end of the file).
    if (raw.trim() === "") {
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      errors.push({ line: lineNumber, reason: `invalid JSON: ${(err as Error).message}` });
      return;
    }

    const fieldErrors = validateEvent(parsed);
    if (fieldErrors.length > 0) {
      errors.push({ line: lineNumber, reason: fieldErrors.join("; ") });
      return;
    }

    events.push(parsed as SirenEvent);
  });

  if (errors.length > 0) {
    console.error(`found ${errors.length} invalid line(s) in "${filePath}":`);
    for (const e of errors) {
      console.error(`  line ${e.line}: ${e.reason}`);
    }
    process.exit(1);
  }

  const summaries = summarize(events);
  console.log(
    `validated ${events.length} event(s) across ${summaries.length} session(s) in "${filePath}"`,
  );
  console.log("");
  for (const summary of summaries) {
    printSummary(summary);
    console.log("");
  }
}

main();
