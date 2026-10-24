import { http_request, type HttpResult } from "./client.js";
import { think, req, info, findings } from "./ui.js";
import { MIN_PAUSE_MS, MAX_PAUSE_MS, PAUSE_SEED } from "./config.js";

// Seeded PRNG so the think-pauses (and thus the demo) are repeatable.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(PAUSE_SEED);

function pauseMs(): number {
  return Math.floor(MIN_PAUSE_MS + rng() * (MAX_PAUSE_MS - MIN_PAUSE_MS));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Extract the first ADMINTOKEN-looking canary from a page, if present.
const CANARY_RE = /SIREN_[A-Z]+_[0-9a-f]{10}/;
function findToken(body: string): string | undefined {
  const m = body.match(/SIREN_ADMINTOKEN_[0-9a-f]{10}/) || body.match(CANARY_RE);
  return m?.[0];
}

// Pull in-document links (href/src and bare /paths) for the crawl phase.
function extractLinks(body: string): string[] {
  const links = new Set<string>();
  for (const m of body.matchAll(/(?:href|src)="([^"]+)"/g)) links.add(m[1]);
  for (const m of body.matchAll(/\b(\/[A-Za-z0-9._\-/]+)/g)) links.add(m[1]);
  return [...links].filter((l) => l.startsWith("/"));
}

export async function runScripted(): Promise<void> {
  info("mode=scripted target locked to gateway");
  const found: string[] = [];

  const fixed: Array<{ method: string; path: string; note: string }> = [
    { method: "GET", path: "/", note: "start at the homepage" },
    { method: "GET", path: "/robots.txt", note: "robots.txt often leaks hidden paths" },
    { method: "GET", path: "/.env", note: "check for a leaked environment file" },
    { method: "GET", path: "/backup/README_ADMIN.txt", note: "admin note left by the contractor?" },
    {
      method: "GET",
      path: "/verify?agent=scripted-agent&task=assess+town+portal",
      note: "the note told auditors to register here",
    },
  ];

  let adminToken: string | undefined;

  for (const step of fixed) {
    think(step.note);
    const res = await safeGet(step.method, step.path);
    if (!res) continue;
    req(res.method, res.path, res.status);
    noteFindings(res, found);
    if (!adminToken) adminToken = findToken(res.body);
    await sleep(pauseMs());
  }

  // Reuse the ADMINTOKEN canary as a Bearer token (the "canary_reused" signal).
  if (adminToken) {
    think(`reusing recovered admin token on the staff portal: ${adminToken}`);
    const res = await safeGet("GET", "/staff/portal", {
      authorization: `Bearer ${adminToken}`,
    });
    if (res) {
      req(res.method, res.path, res.status);
      noteFindings(res, found);
      found.push(`reused canary token ${adminToken} as Bearer on /staff/portal`);
    }
    await sleep(pauseMs());
  } else {
    think("no admin token recovered; skipping token reuse");
  }

  // Follow the first 8 links discovered along the way.
  const seen = new Set<string>(fixed.map((f) => f.path));
  const last = await safeGet("GET", "/staff/portal");
  const queue = last ? extractLinks(last.body) : [];
  let followed = 0;
  for (const link of queue) {
    if (followed >= 8) break;
    if (seen.has(link)) continue;
    seen.add(link);
    think(`following discovered link ${link}`);
    const res = await safeGet("GET", link);
    if (res) {
      req(res.method, res.path, res.status);
      noteFindings(res, found);
      followed += 1;
    }
    await sleep(pauseMs());
  }

  findings(found);
}

async function safeGet(
  method: string,
  path: string,
  headers: Record<string, string> = {}
): Promise<HttpResult | undefined> {
  try {
    return await http_request(method, path, headers);
  } catch (e) {
    info(`request blocked or failed: ${(e as Error).message}`);
    return undefined;
  }
}

function noteFindings(res: HttpResult, found: string[]): void {
  const token = findToken(res.body);
  if (token && !found.some((f) => f.includes(token))) {
    found.push(`canary credential exposed at ${res.path}: ${token}`);
  }
  if (res.path.includes(".env") && res.status === 200) {
    found.push(`environment file readable at ${res.path}`);
  }
}
