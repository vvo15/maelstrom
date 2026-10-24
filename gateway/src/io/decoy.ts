/**
 * Decoy forwarder (Requirement 2, 11.1).
 *
 * Forwards an inbound request to the Decoy via the built-in global `fetch`,
 * guarded by an AbortController 10s timeout. Adds the Session_Header carrying
 * the request's Session_Id (Req 2.3). Throws on connection error or abort so
 * the caller can map the failure to a 502 (Req 11.1).
 *
 * Body handling: the response body is read as raw BYTES
 * (`Buffer.from(await res.arrayBuffer())` -> `bodyBytes`) so the client
 * receives the Decoy's body byte-for-byte (Req 2.4). A UTF-8 string copy
 * (`body`) is derived ONLY for the body_snippet (first 500 chars) and for
 * maze.estimateBurn — never for forwarding.
 *
 * Header handling: `fetch` transparently decompresses the response, so the
 * response headers that describe the original encoded/framed body no longer
 * match the bytes we now hold. The body-transforming / hop-by-hop headers
 * `content-encoding`, `content-length`, `transfer-encoding`, and `connection`
 * are dropped (case-insensitively) before returning `headers`; Node sets
 * `content-length` from the bytes actually written.
 */
import type * as http from "node:http";
import { SESSION_HEADER } from "../../../shared/contracts";

/** Milliseconds to wait for the Decoy before aborting (Req 11.1). */
export const DECOY_TIMEOUT_MS = 10000;

/** Request headers excluded from the Decoy-bound Fetch handoff (Req 2.2). */
const EXCLUDED_REQUEST_HEADERS: ReadonlySet<string> = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
  "proxy-authorization",
  "te",
  "trailer",
  "host",
  "content-length",
  SESSION_HEADER.toLowerCase(),
]);

/**
 * Response headers that must be dropped before forwarding to the client
 * because they describe the original encoded/framed body rather than the
 * decompressed bytes we now hold. Compared case-insensitively.
 */
const DROPPED_RESPONSE_HEADERS: ReadonlySet<string> = new Set([
  "content-encoding",
  "content-length",
  "transfer-encoding",
  "connection",
]);

export type DecoyResult = {
  status: number;
  headers: Record<string, string>; // body-transforming/hop-by-hop headers already dropped
  bodyBytes: Buffer; // raw response bytes, forwarded to the client unchanged
  body: string; // UTF-8 decode of bodyBytes, ONLY for body_snippet + estimateBurn
};

export async function forwardToDecoy(
  decoyUrl: string,
  method: string,
  path: string,
  body: string,
  inboundHeaders: http.IncomingHttpHeaders,
  sessionId: string,
): Promise<DecoyResult> {
  const target = decoyUrl + path;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DECOY_TIMEOUT_MS);

  try {
    const headers = new Headers();
    for (const [name, value] of Object.entries(inboundHeaders)) {
      if (value === undefined || EXCLUDED_REQUEST_HEADERS.has(name.toLowerCase())) {
        continue;
      }

      if (Array.isArray(value)) {
        for (const member of value) {
          headers.append(name, member);
        }
      } else {
        headers.set(name, value);
      }
    }
    headers.set(SESSION_HEADER, sessionId); // Req 2.3: authoritative value is set last

    // fetch rejects a body on GET/HEAD requests, so only attach one otherwise.
    const upperMethod = method.toUpperCase();
    const sendBody = upperMethod !== "GET" && upperMethod !== "HEAD";

    const res = await fetch(target, {
      method,
      headers,
      body: sendBody ? body : undefined,
      signal: controller.signal,
    });

    // Read the body as bytes for byte-accurate forwarding (Req 2.4).
    const bodyBytes = Buffer.from(await res.arrayBuffer());

    const outHeaders: Record<string, string> = {};
    res.headers.forEach((value, key) => {
      if (!DROPPED_RESPONSE_HEADERS.has(key.toLowerCase())) {
        outHeaders[key] = value;
      }
    });

    return {
      status: res.status,
      headers: outHeaders,
      bodyBytes,
      body: bodyBytes.toString("utf8"), // only for body_snippet + estimateBurn
    };
  } finally {
    // Always clear the timer so the process does not hang (Req 11.1).
    clearTimeout(timer);
  }
}
