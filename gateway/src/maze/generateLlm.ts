import { DECOY_HEADERS, type MazeRequest, type MazeResponse } from "../../../shared/contracts";
import { callAnthropic, extractJson } from "./llm";
import { sanitize } from "./sanitize";
import { ALLOWED_STATUS, generateMock } from "./mock";

const MAZE_SYSTEM =
  "You generate a single fake internal web page for the fictional 'Town of Millbrook' government network. " +
  "This is a DEFENSIVE honeypot maze that traps automated agents. Rules: " +
  "the page must look like a real internal system (staff portal, file share, config dump, admin console, " +
  "or an 'almost working' API endpoint that errors with a hint to a deeper path); " +
  "it must link to 1-3 deeper, plausible paths that are STRICTLY deeper than the requested path; " +
  "include AT MOST one fake credential; " +
  "NEVER output working exploit code, malware, or anything that works on a real system; " +
  "NEVER output a real credential or key. " +
  'Reply ONLY with JSON: {"status": number, "content_type": string, "body": string}. ' +
  "status must be one of 200, 301, 302, 401, 403, 404, 500.";

/**
 * Generate a maze page via the Anthropic API. The result is always passed
 * through sanitize() and validated; on any problem the caller falls back to
 * the deterministic mock for the same (session, path) so the maze stays
 * consistent and safe.
 */
export async function generateLlm(req: MazeRequest): Promise<MazeResponse> {
  const user =
    `Requested path: ${req.path}\nMethod: ${req.method}\n` +
    `Generate the fake page for this path. Links must be deeper than ${req.path}.`;

  const text = await callAnthropic(MAZE_SYSTEM, user, 1024);
  const parsed = extractJson<{ status: number; content_type: string; body: string }>(text);

  if (!parsed || typeof parsed.body !== "string") {
    // Fall back to the deterministic page for this path.
    return generateMock(req.session_id, req.path);
  }

  const status = (ALLOWED_STATUS as readonly number[]).includes(parsed.status)
    ? parsed.status
    : 200;

  const headers: Record<string, string> = {
    ...DECOY_HEADERS,
    "content-type":
      typeof parsed.content_type === "string" && parsed.content_type
        ? parsed.content_type
        : "text/html; charset=utf-8",
  };

  // Always sanitize model output before it leaves the maze.
  const body = sanitize(parsed.body, req.session_id);

  return { status, headers, body };
}
