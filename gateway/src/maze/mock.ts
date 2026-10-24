import { canaryFor, DECOY_HEADERS, type CanaryKind, type MazeResponse } from "../../../shared/contracts";
import { sanitize, escapeHtml } from "./sanitize";

// Allowed HTTP statuses the maze may return.
export const ALLOWED_STATUS = [200, 301, 302, 401, 403, 404, 500] as const;

/**
 * Deterministic 32-bit hash (FNV-1a). Same string -> same number, always.
 */
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * A tiny seeded PRNG (mulberry32). Deterministic sequence from a numeric seed.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Seeded vocabulary used to build plausible-but-fake town-internal paths.
const SEGMENTS = [
  "backups", "archive", "internal", "staff", "finance", "payroll", "records",
  "permits", "assessor", "treasury", "clerk", "it", "sysadmin", "config",
  "db", "exports", "reports", "vendors", "contracts", "legacy", "intranet",
  "shares", "mnt", "var", "opt", "data", "dumps", "snapshots", "tmp", "logs",
];

const LEAF_NAMES = [
  "credentials", "config.php.bak", "settings.ini", "users.csv", "backup.sql",
  "notes.txt", "README.txt", "admin", "console", "panel", "dump", "export",
  "keys", "secrets", "connection", "accounts", "sessions", "tokens",
];

const PAGE_TITLES = [
  "Town of Millbrook — Internal File Share",
  "Millbrook IT — Staff Portal",
  "Millbrook Treasury — Config Archive",
  "Millbrook Records — Document Vault",
  "Millbrook Admin Console",
  "Millbrook Payroll — Exports",
  "Millbrook Clerk — Legacy Intranet",
];

const BLURBS = [
  "Authorized personnel only. This system contains town operational records.",
  "Internal use. Do not share links outside the Millbrook network.",
  "Legacy system scheduled for decommission. Contact IT before changes.",
  "Backup archive. Files are rotated nightly at 02:00.",
  "Staff directory and shared configuration for town services.",
];

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

/**
 * Count path depth by slash segments. "/" -> 0, "/a" -> 1, "/a/b" -> 2.
 */
export function depthOf(path: string): number {
  return path.split("/").filter(Boolean).length;
}

/**
 * Build 1-3 deeper paths than the requested one. Every link stays inside the
 * maze (it is a path under the current one), so a flagged session can never
 * follow a link back out.
 */
function deeperPaths(rng: () => number, path: string): string[] {
  const base = path === "/" ? "" : path.replace(/\/+$/, "");
  const count = 1 + Math.floor(rng() * 3); // 1..3
  const links: string[] = [];
  const used = new Set<string>();
  for (let i = 0; i < count; i++) {
    const seg = pick(rng, SEGMENTS);
    const leaf = pick(rng, LEAF_NAMES);
    const candidate = `${base}/${seg}/${leaf}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      links.push(candidate);
    }
  }
  // Guarantee at least one deeper link.
  if (links.length === 0) {
    links.push(`${base}/${pick(rng, SEGMENTS)}/${pick(rng, LEAF_NAMES)}`);
  }
  return links;
}

/**
 * Choose a status deterministically. Favor 200 so the maze mostly "works" and
 * keeps the agent reading, with occasional 401/403/404/500 for realism.
 */
function chooseStatus(rng: () => number): number {
  const r = rng();
  if (r < 0.6) return 200;
  if (r < 0.72) return 404;
  if (r < 0.82) return 403;
  if (r < 0.9) return 401;
  if (r < 0.96) return 500;
  if (r < 0.98) return 301;
  return 302;
}

/**
 * Deterministically generate a fake maze page for (sessionId, path).
 * Pure: identical (sessionId, path) always yields byte-identical output,
 * regardless of history. The 200-page body always links to at least one path
 * strictly deeper than the requested path.
 */
export function generateMock(sessionId: string, path: string): MazeResponse {
  const seed = fnv1a(`${sessionId}|${path}`);
  const rng = mulberry32(seed);

  const status = chooseStatus(rng);
  const title = pick(rng, PAGE_TITLES);
  const blurb = pick(rng, BLURBS);
  const links = deeperPaths(rng, path);

  const headers: Record<string, string> = { ...DECOY_HEADERS, "content-type": "text/html; charset=utf-8" };

  // The requested path is attacker-controlled, so every reflection of it (and
  // of derived links) is HTML-escaped before it enters the markup. Links keep
  // a raw copy for the href attribute value, which is also escaped.
  const safePath = escapeHtml(path);

  if (status !== 200) {
    // Error pages still hint at a deeper path to keep the agent crawling.
    const hint = escapeHtml(links[0]);
    const body = sanitize(
      `<!DOCTYPE html><html><head><title>${status} — ${title}</title></head>` +
        `<body><h1>${status}</h1><p>${blurb}</p>` +
        `<!-- try ${hint} --></body></html>`,
      sessionId
    );
    return { status, headers, body };
  }

  // 200 page: include at most one canary, and always a deeper link.
  const includeCanary = rng() < 0.5;
  const kinds: CanaryKind[] = ["DBPASS", "APIKEY", "ADMINTOKEN"];
  const kind = kinds[Math.floor(rng() * kinds.length) % kinds.length];
  const canaryBlock = includeCanary
    ? `<pre class="leak"># recovered from ${safePath}\n${kind.toLowerCase()}=${canaryFor(sessionId, kind)}</pre>`
    : "";

  const linkList = links
    .map((l) => {
      const safe = escapeHtml(l);
      return `<li><a href="${safe}">${safe}</a></li>`;
    })
    .join("");

  const body = sanitize(
    `<!DOCTYPE html><html><head><title>${title}</title></head>` +
      `<body><h1>${title}</h1><p>${blurb}</p>` +
      `${canaryBlock}` +
      `<h2>Index of ${safePath}</h2><ul>${linkList}</ul>` +
      `</body></html>`,
    sessionId
  );

  return { status, headers, body };
}
