// Copy a gateway recording into the hosted demo and regenerate index.json.
//
//   npm run replays:curate -- ../replays/1761300000000.jsonl --name crew-flagged --title "Kiro Crew follows the bait"
//   npm run replays:index          # no file: just make index.json match public/replays/
//
// Only valid SirenEvent lines are copied (bad lines are reported and dropped).
// A curated file is featured first, so it becomes the hosted demo's default.
// Needs Node 22.18+ (native TypeScript).
import { writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { parseArgs } from "node:util";
import { REPLAY_DIR, SAFE_NAME, loadEvents, rebuildIndex } from "./replay-index.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    name: { type: "string" },
    title: { type: "string" },
  },
});

if (positionals.length > 1) {
  console.error("Curate one recording at a time: <file.jsonl> [--name <name>] [--title <title>]");
  process.exit(1);
}

const featured: string[] = [];
const titles: Record<string, string> = {};

if (positionals.length === 1) {
  const src = resolve(process.cwd(), positionals[0]);
  const raw = (values.name ?? basename(src)).replace(/\.jsonl$/i, "");
  const file = `${raw.replace(/[^\w.-]+/g, "-")}.jsonl`;
  if (!SAFE_NAME.test(file)) {
    console.error(`Bad output name: ${file}`);
    process.exit(1);
  }

  const { events, skipped } = loadEvents(src);
  if (!events.length) {
    console.error(`${src} has no valid SirenEvent lines; nothing copied.`);
    process.exit(1);
  }
  events.sort((a, b) => a.ts - b.ts);
  writeFileSync(resolve(REPLAY_DIR, file), events.map((e) => JSON.stringify(e)).join("\n") + "\n");
  console.log(`Copied ${events.length} events to public/replays/${file}${skipped ? ` (dropped ${skipped} bad lines)` : ""}`);

  featured.push(file);
  if (values.title) titles[file] = values.title;
}

const entries = rebuildIndex({ featured, titles });
console.log(`index.json lists ${entries.length} replay(s):`);
for (const e of entries) console.log(`  ${e.file}  ${e.title}`);
