import { parseJsonl, type ParsedReplay } from "./validate";

export interface ReplayEntry {
  file: string;
  title: string;
}

const baseUrl = (path: string) => `${import.meta.env.BASE_URL}${path}`;

function titleFromFile(file: string): string {
  return file.replace(/\.jsonl$/i, "").replace(/[-_]+/g, " ");
}

/**
 * Reads public/replays/index.json. Accepts either an array or { replays: [] }
 * whose items are file names or { file, title } objects. Returns [] on any
 * problem, so the caller can fall back instead of showing an error.
 */
export async function loadReplayIndex(signal?: AbortSignal): Promise<ReplayEntry[]> {
  try {
    const res = await fetch(baseUrl("replays/index.json"), { signal });
    if (!res.ok) return [];
    const data: unknown = await res.json();
    const list = Array.isArray(data)
      ? data
      : data && typeof data === "object" && Array.isArray((data as { replays?: unknown }).replays)
        ? (data as { replays: unknown[] }).replays
        : [];
    const entries: ReplayEntry[] = [];
    for (const item of list) {
      if (typeof item === "string") {
        entries.push({ file: item, title: titleFromFile(item) });
      } else if (item && typeof item === "object" && typeof (item as { file?: unknown }).file === "string") {
        const o = item as { file: string; title?: unknown };
        entries.push({ file: o.file, title: typeof o.title === "string" ? o.title : titleFromFile(o.file) });
      }
    }
    // Only plain file names inside public/replays/ are allowed.
    return entries.filter((e) => /^[\w.-]+\.jsonl$/i.test(e.file));
  } catch {
    return [];
  }
}

export async function loadReplayFile(file: string, signal?: AbortSignal): Promise<ParsedReplay | undefined> {
  try {
    const res = await fetch(baseUrl(`replays/${encodeURIComponent(file)}`), { signal });
    if (!res.ok) return undefined;
    const parsed = parseJsonl(await res.text());
    return parsed.events.length ? parsed : undefined;
  } catch {
    return undefined;
  }
}
