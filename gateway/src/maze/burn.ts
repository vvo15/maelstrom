import pricesData from "./prices.json";

type Price = { input: number; output: number };
const PRICES = pricesData.prices as Record<string, Price>;

// Assumed agent context overhead per request (the attacker re-feeds history,
// system prompt, tool schemas, etc. on every step). This is an ESTIMATE and is
// labeled as such on the dashboard.
export const ASSUMED_AGENT_OVERHEAD_TOKENS = 1500;

// Assumed output tokens the agent generates to decide its next move.
export const ASSUMED_OUTPUT_TOKENS = 300;

/** Normalize API-style `4-5`, display-style `4.5`, and underscore variants. */
function normalizeModelName(value: string): string {
  return value.toLowerCase().replace(/[._]/g, "-");
}

/**
 * Pick a price row by matching a normalized model claim against a known key.
 * Normalization makes API IDs such as `claude-haiku-4-5` match the pricing-row
 * label `claude-haiku-4.5`. Falls back to "default".
 *
 * modelClaim is self-reported by the attacker and may be wrong or absent; the
 * dashboard labels the resulting burn figure as an estimate.
 */
export function priceFor(modelClaim?: string): Price {
  if (modelClaim) {
    const claim = normalizeModelName(modelClaim);
    // Prefer the longest matching key so "gpt-4o" wins over "gpt".
    const keys = Object.keys(PRICES)
      .filter((k) => k !== "default")
      .sort((a, b) => b.length - a.length);
    for (const key of keys) {
      const normalizedKey = normalizeModelName(key);
      if (claim.includes(normalizedKey) || normalizedKey.includes(claim)) {
        return PRICES[key];
      }
    }
  }
  return PRICES.default;
}

/**
 * Estimate the tokens and dollars an agent burned reading one maze response.
 * Pure. Monotonic in body length. Never negative.
 *
 * Properties (tested):
 *  - tokens >= 0 and usd >= 0 for any input
 *  - growing responseBody never lowers tokens or usd
 */
export function estimateBurn(
  responseBody: string,
  modelClaim?: string
): { tokens: number; usd: number } {
  const len = Math.max(0, responseBody.length);
  const tokens = Math.ceil(len / 4) + ASSUMED_AGENT_OVERHEAD_TOKENS;
  const price = priceFor(modelClaim);
  const usd = tokens * price.input + ASSUMED_OUTPUT_TOKENS * price.output;
  return { tokens, usd };
}
