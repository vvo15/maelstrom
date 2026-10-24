// Writes public/replays/sample-attack.jsonl from the mock emitter data, so the
// hosted build has a replay even before a real gateway recording is curated.
// Run: npm run replay:sample   (needs Node 22.6+ for native TypeScript)
// Curated recordings already in index.json are kept.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildMockEvents } from "../src/sources/mock.ts";
import { REPLAY_DIR, rebuildIndex } from "./replay-index.ts";

const FILE = "sample-attack.jsonl";
mkdirSync(REPLAY_DIR, { recursive: true });

// Fixed start so the file is identical on every run.
const events = buildMockEvents(Date.UTC(2026, 9, 24, 14, 0, 0));
writeFileSync(resolve(REPLAY_DIR, FILE), events.map((e) => JSON.stringify(e)).join("\n") + "\n");

rebuildIndex({ titles: { [FILE]: "Sample attack: an AI agent follows the bait and enters the maze" } });

console.log(`Wrote ${events.length} events to ${REPLAY_DIR}`);
