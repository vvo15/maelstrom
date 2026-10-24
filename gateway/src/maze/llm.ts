// Thin wrapper over the Anthropic Messages API using plain fetch (no deps).
// Every call is bounded by a timeout; on any error or timeout the caller falls
// back to deterministic mock mode. We never send or expect real secrets here.

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

export const LLM_TIMEOUT_MS = 8000;

export function llmMode(): "anthropic" | "mock" {
  const mode = process.env.SIREN_LLM;
  // Mock is the default and the only mode that works with no API key.
  if (mode === "anthropic" && process.env.ANTHROPIC_API_KEY) return "anthropic";
  return "mock";
}

export function mazeModel(): string {
  // A cheap, fast model by default. Override with MAZE_MODEL to match whatever
  // the deployment has access to.
  return process.env.MAZE_MODEL || "claude-haiku-4-5";
}

/**
 * Call the Anthropic Messages API and return the first text block, or throw.
 * Bounded by LLM_TIMEOUT_MS via AbortController.
 */
export async function callAnthropic(
  system: string,
  userText: string,
  maxTokens = 1024
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("no ANTHROPIC_API_KEY");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: mazeModel(),
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: userText }],
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`anthropic ${res.status}`);
    const data: any = await res.json();
    const text = data?.content?.[0]?.text;
    if (typeof text !== "string" || text.length === 0) {
      throw new Error("empty anthropic response");
    }
    return text;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Best-effort JSON extraction from a model response that may wrap JSON in
 * prose or code fences. Returns undefined if nothing parses.
 */
export function extractJson<T = any>(text: string): T | undefined {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return undefined;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as T;
  } catch {
    return undefined;
  }
}
