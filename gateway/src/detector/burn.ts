/**
 * Pure burn accounting helpers (Requirement 7.2-7.4, Property 6, Requirement 10).
 * No I/O and no module state: equal arguments always yield equal results.
 */

/**
 * Req 7.3, 7.4. A value returned by `maze.estimateBurn` that is negative,
 * NaN, Infinity, or -Infinity contributes 0; any other value is returned
 * unchanged. -0 is not negative under Req 7.3/7.4, but it is normalised
 * to +0 so it can never introduce a signed zero into a running total.
 */
export function clampBurnValue(raw: number): number {
  if (!Number.isFinite(raw) || raw < 0) return 0;
  if (raw === 0) return 0; // collapses -0 to +0
  return raw;
}

/**
 * Req 7.2, 7.5. Fold helper with a saturating add:
 * newTotal = min(Number.MAX_VALUE, total + clampBurnValue(raw)).
 * The clamped addend is finite and >= 0, but adding two large finite
 * values can still overflow to Infinity, so the sum is capped at
 * Number.MAX_VALUE (Req 7.5). For any finite `total` >= 0 the result is
 * finite and never less than `total` (Property 6).
 */
export function applyBurn(total: number, raw: number): number {
  return Math.min(Number.MAX_VALUE, total + clampBurnValue(raw));
}
