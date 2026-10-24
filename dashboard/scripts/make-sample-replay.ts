// Writes public/replays/sample-attack.jsonl from the mock emitter data, so the
// hosted build has a replay even before a real gateway recording is curated.
// Run: npm run replay:sample   (needs Node 22.6+ for native TypeScript)
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildMockEvents } from "../src/sources/mock.ts";

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), "../public/replays");
mkdirSync(outDir, { recursive: true });

// Fixed start so the file is identical on every run.
const events = buildMockEvents(Date.UTC(2026, 9, 24, 14, 0, 0));
writeFileSync(resolve(outDir, "sample-attack.jsonl"), events.map((e) => JSON.stringify(e)).join("\n") + "\n");

const index = [
  {
    file: "sample-attack.jsonl",
    title: "Sample attack: an AI agent follows the bait and enters the maze",
  },
];
writeFileSync(resolve(outDir, "index.json"), JSON.stringify(index, null, 2) + "\n");

console.log(`Wrote ${events.length} events to ${outDir}`);
