import pricesData from "./prices.json";

type Price = { input: number; output: number };
const PRICES = pricesData.prices as Record<string, Price>;

// Assumed agent context overhead per request (the attacker re-feeds history,
// system prompt, tool schemas, etc. on every step). This is an ESTIMATE and is
// labeled as such on the dashboard.
export const ASSUMED_AGENT_OVERHEAD_TOKENS = 1500;

// Assumed output tokens the agent generates to decide its next move.
export const ASSUMED_OUTPUT_TOKENS = 300;

/**
 * Pick a price row by matching modelClaim as a substring of a known key, or a
 * known key as a substring of modelClaim (so "claude-3-5-haiku-20241022" still
 * matches "claude-3-5-haiku"). Falls back to "default".
 *
 * modelClaim is self-reported by the attacker and may be wrong or absent; the
 * dashboard labels the resulting burn figure as an estimate.
 */
export function priceFor(modelClaim?: string): Price {
  if (modelClaim) {
    const claim = modelClaim.toLowerCase();
    // Prefer the longest matching key so "gpt-4o" wins over "gpt".
    const keys = Object.keys(PRICES)
      .filter((k) => k !== "default")
      .sort((a, b) => b.length - a.length);
    for (const key of keys) {
      if (claim.includes(key) || key.includes(claim)) {
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
