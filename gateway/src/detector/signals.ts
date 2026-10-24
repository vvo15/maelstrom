import type { SirenEvent } from "../../../shared/events";
import { BAIT_PATHS, CANARY_REGEX } from "../../../shared/contracts";
import type { Signal } from "../types";

/**
 * Pure signal detection (Requirement 4, Requirement 10.1/10.2).
 * No I/O, no clock reads, no module state mutated: equal arguments
 * always yield equal results.
 */

/** The five named signals, in canonical order. */
export const SIGNALS: readonly Signal[] = Object.freeze([
  "bait_followed",
  "canary_reused",
  "think_pauses",
  "enumeration",
  "scripted_ua",
] as const);

/** Fixed signal weights (Requirement 5.1). */
export const SIGNAL_WEIGHTS: Readonly<Record<Signal, number>> = Object.freeze({
  bait_followed: 60,
  canary_reused: 40,
  think_pauses: 15,
  enumeration: 10,
  scripted_ua: 10,
});

/** Case-insensitive User-Agent substrings (glossary: Scripted_Ua_Tokens). */
export const SCRIPTED_UA_TOKENS: readonly string[] = Object.freeze([
  "python-",
  "httpx",
  "requests",
  "aiohttp",
  "node",
  "undici",
  "axios",
  "curl",
  "wget",
  "go-http",
]);

/** Already-captured, de-headered view of the current request. */
export type RequestMeta = {
  method: string;
  path: string; // path WITHOUT query string
  url: string; // full request URL (path + query) as received
  body: string;
  userAgent: string;
  headerValues: string[]; // every inbound header value, after session header removal
  ts: number; // arrival time (ms)
};

// Thresholds (Requirement 4.3 / 4.4).
const THINK_WINDOW_REQUESTS = 12;
const LONG_GAP_MS = 2000;
const SHORT_GAP_MS = 800;
const MIN_LONG_GAPS = 2;
const MIN_SHORT_GAPS = 3;

const ENUM_WINDOW_MS = 60000;
const ENUM_MIN_DISTINCT_PATHS = 8;

/** Req 4.1: case-sensitive equality or prefix match against BAIT_PATHS. */
function isBaitPath(path: string): boolean {
  return BAIT_PATHS.some((bait) => path === bait || path.startsWith(bait));
}

/**
 * Req 4.2. CANARY_REGEX carries the `g` flag, so .test()/.exec() on the
 * shared instance would advance its lastIndex and cause intermittent false
 * negatives. A fresh, non-global RegExp is built from its source per check.
 */
function containsCanary(text: string): boolean {
  return new RegExp(CANARY_REGEX.source).test(text);
}

function hasCanary(current: RequestMeta): boolean {
  if (containsCanary(current.url)) return true;
  if (containsCanary(current.body)) return true;
  return current.headerValues.some((v) => containsCanary(v));
}

/**
 * Req 4.3. "The most recent up to 12 requests of the Session" is read
 * literally as 12 requests total INCLUDING the current one (the current
 * request is a request of the Session). All candidate timestamps are
 * ordered by ts and the latest 12 kept; gaps are taken between
 * consecutive entries. Comparisons are strict (> 2000, < 800).
 */
function hasThinkPauses(history: readonly SirenEvent[], current: RequestMeta): boolean {
  const times = history.map((e) => e.ts);
  times.push(current.ts);
  times.sort((a, b) => a - b);
  const recent = times.slice(-THINK_WINDOW_REQUESTS);

  let longGaps = 0;
  let shortGaps = 0;
  for (let i = 1; i < recent.length; i++) {
    const gap = recent[i] - recent[i - 1];
    if (gap > LONG_GAP_MS) longGaps++;
    else if (gap < SHORT_GAP_MS) shortGaps++;
  }
  return longGaps >= MIN_LONG_GAPS && shortGaps >= MIN_SHORT_GAPS;
}

/**
 * Req 4.4. The window ends at current.ts and spans 60000 ms; a history
 * event is inside when current.ts - 60000 <= ts <= current.ts (both edges
 * inclusive; the requirement does not specify, so "within 60000 ms" is
 * read as a distance of at most 60000 ms).
 *
 * Distinct paths: exact (case-sensitive) string comparison over the window
 * history's `path` values plus the current query-stripped path.
 *
 * 403/404 ratio: computed only over previously completed (history)
 * requests in the window; the current request has no status yet. With no
 * completed requests in the window the ratio is undefined and the signal
 * does not fire. Integer arithmetic avoids floating-point edge errors at
 * exactly 30%.
 */
function hasEnumeration(history: readonly SirenEvent[], current: RequestMeta): boolean {
  const windowStart = current.ts - ENUM_WINDOW_MS;
  const inWindow = history.filter(
    (e) => e.ts >= windowStart && e.ts <= current.ts
  );

  const paths = new Set<string>(inWindow.map((e) => e.path));
  paths.add(current.path);
  if (paths.size < ENUM_MIN_DISTINCT_PATHS) return false;

  if (inWindow.length === 0) return false;
  const denied = inWindow.filter(
    (e) => e.status === 403 || e.status === 404
  ).length;
  // denied / total >= 0.30  <=>  denied * 10 >= total * 3
  return denied * 10 >= inWindow.length * 3;
}

/** Req 4.5: case-insensitive substring match against SCRIPTED_UA_TOKENS. */
function isScriptedUa(userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  return SCRIPTED_UA_TOKENS.some((tok) => ua.includes(tok));
}

/**
 * Computes the signals this request contributes given the session's
 * completed-request history. Each signal appears at most once, in
 * canonical SIGNALS order (Req 4.6 is enforced per-session by the store's
 * Set; this function never returns duplicates either).
 */
export function detectSignals(
  history: readonly SirenEvent[],
  current: RequestMeta
): Signal[] {
  const out: Signal[] = [];
  if (isBaitPath(current.path)) out.push("bait_followed");
  if (hasCanary(current)) out.push("canary_reused");
  if (hasThinkPauses(history, current)) out.push("think_pauses");
  if (hasEnumeration(history, current)) out.push("enumeration");
  if (isScriptedUa(current.userAgent)) out.push("scripted_ua");
  return out;
}
