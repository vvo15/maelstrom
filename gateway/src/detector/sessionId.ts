/**
 * Session id derivation (Requirements 1.1, 1.3, 10.1, 10.2; Property 4).
 *
 * Pure transform: no I/O, no clock, no randomness. Equal inputs always
 * produce equal outputs. sha256 via node:crypto is a deterministic function
 * of its input bytes, so using it keeps this module side-effect free.
 */
import { createHash } from "node:crypto";

/** Number of leading hex chars of the sha256 digest used as the session id. */
const SESSION_ID_LENGTH = 16;

/**
 * Derive a stable session id from the client's source IP and User-Agent.
 *
 * Returns the first 16 lowercase hex chars of
 * `sha256(sourceIp + "|" + userAgent)`, always matching `/^[0-9a-f]{16}$/`.
 */
export function deriveSessionId(sourceIp: string, userAgent: string): string {
  return createHash("sha256")
    .update(`${sourceIp}|${userAgent}`, "utf8")
    .digest("hex")
    .slice(0, SESSION_ID_LENGTH);
}
