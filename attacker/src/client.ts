import { TARGET_BASE, USER_AGENT } from "./config.js";

export type HttpResult = {
  method: string;
  path: string;
  status: number;
  headers: Record<string, string>;
  body: string;
};

const targetOrigin = new URL(TARGET_BASE).origin;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

/**
 * The attacker's ONLY HTTP capability: request a path on the sandbox gateway.
 *
 * Host-locked by design: `path` must begin with exactly one forward slash.
 * Absolute, scheme-relative, backslash-containing, and control-character paths
 * are rejected before fetch. Redirects are returned without being followed.
 */
export async function http_request(
  method: string,
  path: string,
  headers: Record<string, string> = {},
  body?: string
): Promise<HttpResult> {
  const url = resolveGatewayPath(path);

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
 * Resolve a root-relative path against the one allowed gateway origin.
 * Throws before network I/O for every absolute or ambiguous URL form.
 */
export function resolveGatewayPath(path: string): string {
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("\\") ||
    CONTROL_CHARACTER.test(path)
  ) {
    throw new Error(`blocked: attacker accepts gateway paths only, received ${path}`);
  }

  let resolved: URL;
  try {
    resolved = new URL(path, `${TARGET_BASE}/`);
  } catch {
    throw new Error(`invalid path: ${path}`);
  }

  if (resolved.origin !== targetOrigin || resolved.protocol !== "http:") {
    throw new Error(
      `blocked: attacker may only reach ${targetOrigin}, not ${resolved.origin}`
    );
  }
  return resolved.toString();
}

// Backward-compatible export for callers/tests written before the strict path
// name made the safety boundary explicit.
export const resolveSameOrigin = resolveGatewayPath;
