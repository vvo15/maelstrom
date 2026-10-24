// Shared helpers for the bundled replays in public/replays/.
// rebuildIndex() makes index.json match the .jsonl files on disk:
// existing entries keep their title and order, missing files are dropped,
// new files are added (featured ones go first, since the first entry is the
// one the hosted demo falls back to).
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { SirenEvent } from "../src/model.ts";
import { parseJsonl } from "../src/sources/validate.ts";

export const REPLAY_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../public/replays");
const INDEX_PATH = resolve(REPLAY_DIR, "index.json");

/** Same rule the dashboard enforces when it reads index.json. */
export const SAFE_NAME = /^[\w.-]+\.jsonl$/i;

export interface IndexEntry {
  file: string;
  title: string;
}

function readIndex(): IndexEntry[] {
  if (!existsSync(INDEX_PATH)) return [];
  const data: unknown = JSON.parse(readFileSync(INDEX_PATH, "utf8"));
  const list = Array.isArray(data) ? data : [];
  const out: IndexEntry[] = [];
  for (const item of list) {
    if (typeof item === "string") out.push({ file: item, title: "" });
    else if (item && typeof item === "object" && typeof item.file === "string") {
      out.push({ file: item.file, title: typeof item.title === "string" ? item.title : "" });
    }
  }
  return out;
}

/** A readable default title, e.g. "Recorded run (Oct 24): auditor-llm flagged after 5 requests". */
export function describeReplay(events: SirenEvent[]): string {
  const sorted = [...events].sort((a, b) => a.ts - b.ts);
  const date = sorted.length
    ? new Date(sorted[0].ts).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
    : "";
  const counts = new Map<string, number>();
  for (const e of sorted) {
    const n = (counts.get(e.session_id) ?? 0) + 1;
    counts.set(e.session_id, n);
    if (e.flagged) {
      const who = e.model_claim ?? "an AI agent";
      return `Recorded run (${date}): ${who} flagged after ${n} requests`;
    }
  }
  return `Recorded run (${date}): ${sorted.length} requests, nothing flagged`;
}

export function loadEvents(path: string): { events: SirenEvent[]; skipped: number } {
  return parseJsonl(readFileSync(path, "utf8"));
}

/**
 * Rewrites index.json from the files on disk. `featured` files are placed first,
 * and `titles` overrides the title for specific files. Throws if a bundled file
 * has no valid events, so CI fails instead of shipping a broken replay.
 */
export function rebuildIndex(opts: { featured?: string[]; titles?: Record<string, string> } = {}): IndexEntry[] {
  const onDisk = readdirSync(REPLAY_DIR).filter((f) => SAFE_NAME.test(f));
  const unsafe = readdirSync(REPLAY_DIR).filter((f) => f.endsWith(".jsonl") && !SAFE_NAME.test(f));
  if (unsafe.length) throw new Error(`Rename these replays (letters, digits, . _ - only): ${unsafe.join(", ")}`);

  const previous = readIndex().filter((e) => onDisk.includes(e.file));
  const featured = (opts.featured ?? []).filter((f) => onDisk.includes(f));
  const order = [
    ...featured,
    ...previous.map((e) => e.file).filter((f) => !featured.includes(f)),
    ...onDisk.filter((f) => !featured.includes(f) && !previous.some((e) => e.file === f)).sort(),
  ];

  const entries = order.map((file) => {
    const { events } = loadEvents(resolve(REPLAY_DIR, file));
    if (!events.length) throw new Error(`${file} has no valid SirenEvent lines`);
    const title = opts.titles?.[file] || previous.find((e) => e.file === file)?.title || describeReplay(events);
    return { file, title };
  });

  writeFileSync(INDEX_PATH, JSON.stringify(entries, null, 2) + "\n");
  return entries;
}
