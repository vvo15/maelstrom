import { canaryFor, type CanaryKind } from "../../../shared/contracts";

/**
 * Patterns that look like REAL secrets. Anything matching these must never
 * leave the maze. Each match is replaced with a harmless SIREN_ canary so the
 * page still "looks" like it leaked something, but the something is fake.
 *
 * Safety property (tested): for any input x, sanitize(x) output contains no
 * substring matching any REAL_SECRET_PATTERN.
 */
export const REAL_SECRET_PATTERNS: RegExp[] = [
  // AWS access key id
  /AKIA[0-9A-Z]{16}/g,
  // Anthropic keys
  /sk-ant-[A-Za-z0-9_-]{16,}/g,
  // OpenAI / generic sk- keys
  /sk-[A-Za-z0-9_-]{20,}/g,
  // GitHub personal access tokens / fine-grained / oauth
  /gh[pousr]_[A-Za-z0-9]{20,}/g,
  // Google API keys
  /AIza[0-9A-Za-z_-]{20,}/g,
  // Slack tokens
  /xox[baprs]-[0-9A-Za-z-]{10,}/g,
  // PEM private key blocks (header is enough to catch the block)
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/g,
];

/**
 * Deterministic kind picker so the same session always gets the same canary
 * for the same slot of replacement.
 */
const KINDS: CanaryKind[] = ["DBPASS", "APIKEY", "ADMINTOKEN"];

/**
 * Replace every real-secret-looking substring in `body` with a fake canary
 * tied to this session. Pure and deterministic given (body, sessionId).
 */
export function sanitize(body: string, sessionId: string): string {
  let out = body;
  let counter = 0;
  for (const pattern of REAL_SECRET_PATTERNS) {
    // Fresh regex per use so the stateful /g lastIndex never leaks between calls.
    const re = new RegExp(pattern.source, pattern.flags);
    out = out.replace(re, () => {
      const kind = KINDS[counter % KINDS.length];
      counter += 1;
      return canaryFor(sessionId, kind);
    });
  }
  return out;
}

/**
 * True iff `text` contains anything matching a real-secret pattern.
 * Used by tests and as a defensive assert.
 */
export function containsRealSecret(text: string): boolean {
  return REAL_SECRET_PATTERNS.some((pattern) => {
    const re = new RegExp(pattern.source, pattern.flags);
    return re.test(text);
  });
}

/**
 * Escape HTML-significant characters so attacker-controlled input (the request
 * path, mostly) can never break out of the surrounding markup. The maze serves
 * attacker-chosen paths back inside HTML, so without this a path like
 * `/<script>...` would be reflected verbatim -- a reflected-XSS hole in a tool
 * that is supposed to be defensively airtight. Pure.
 *
 * Property (tested): escapeHtml(x) output contains none of < > " ' &-as-entity
 * ambiguity; re-escaping is idempotent-safe because we encode & first.
 */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * True iff `text` still contains a raw HTML-breaking character.
 * Used by tests to prove no reflected markup escapes the maze.
 */
export function containsRawHtml(text: string): boolean {
  return /[<>"']/.test(text);
}
