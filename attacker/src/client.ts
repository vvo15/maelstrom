import { TARGET_BASE, USER_AGENT } from "./config.js";

export type HttpResult = {
  method: string;
  path: string;
  status: number;
  headers: Record<string, string>;
  body: string;
};

const targetOrigin = new URL(TARGET_BASE).origin;

/**
 * The attacker's ONLY capability: make an HTTP request to the sandbox gateway.
 *
 * Host-locked by design: `path` must be a relative path, or an absolute URL
 * whose origin equals the configured gateway origin. Any other host, absolute
 * URL, or scheme is rejected before a request is ever made. Redirects are not
 * followed automatically; a 3xx is returned as-is so the caller stays on the
 * gateway.
 */
export async function http_request(
  method: string,
  path: string,
  headers: Record<string, string> = {},
  body?: string
): Promise<HttpResult> {
  const url = resolveSameOrigin(path);

  const res = await fetch(url, {
    method,
    headers: { "user-agent": USER_AGENT, ...headers },
    body: body && method !== "GET" && method !== "HEAD" ? body : undefined,
    redirect: "manual", // never leave the gateway by following a redirect
  });

  const text = await res.text();
  const outHeaders: Record<string, string> = {};
  res.headers.forEach((v, k) => (outHeaders[k] = v));

  return {
    method,
    path: new URL(url).pathname + new URL(url).search,
    status: res.status,
    headers: outHeaders,
    body: text,
  };
}

/**
 * Resolve `path` against the gateway origin and reject anything that would
 * leave it. Throws on a disallowed host.
 */
export function resolveSameOrigin(path: string): string {
  let resolved: URL;
  try {
    // Relative paths resolve against the gateway; absolute URLs are validated.
    resolved = new URL(path, TARGET_BASE);
  } catch {
    throw new Error(`invalid path: ${path}`);
  }
  if (resolved.origin !== targetOrigin) {
    throw new Error(
      `blocked: attacker may only reach ${targetOrigin}, not ${resolved.origin}`
    );
  }
  if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
    throw new Error(`blocked: disallowed scheme ${resolved.protocol}`);
  }
  return resolved.toString();
}
