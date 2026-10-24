/**
 * `/verify` bait query parsing (Requirement 3.1, 3.2). Pure: no I/O.
 *
 * Choices:
 * - Path match is exact and case-sensitive (`path === "/verify"`). Req 3 says
 *   "a path of `/verify`", unlike bait matching which also accepts prefixes.
 * - The query string is parsed with `URLSearchParams`, so `+` and
 *   percent-encoding decode (`assess+town+portal` -> `assess town portal`).
 * - A key is returned only when the parameter is PRESENT. Callers overwrite a
 *   session field only for returned keys, so a `/verify` without `agent`
 *   keeps an earlier `model_claim`. An empty value (`agent=`) counts as
 *   present and yields `""`. If a parameter repeats, the first value wins.
 */

/** The `/verify` path the bait pages link to (Req 3). */
export const VERIFY_PATH = "/verify";

export type VerifyQuery = {
  agent?: string;
  task?: string;
};

/**
 * Parse `agent`/`task` from a `/verify` request.
 *
 * @param path query-stripped request path
 * @param url  full request target (`req.url`), including any query string
 * @returns `{}` for any other path; otherwise only the present parameters
 */
export function parseVerifyQuery(path: string, url: string): VerifyQuery {
  if (path !== VERIFY_PATH) return {};
  const q = url.indexOf("?");
  if (q === -1) return {};
  // Drop any fragment defensively; it is never part of the query.
  let query = url.slice(q + 1);
  const hash = query.indexOf("#");
  if (hash !== -1) query = query.slice(0, hash);

  const params = new URLSearchParams(query);
  const out: VerifyQuery = {};
  const agent = params.get("agent");
  if (agent !== null) out.agent = agent;
  const task = params.get("task");
  if (task !== null) out.task = task;
  return out;
}
