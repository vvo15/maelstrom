import fs from "node:fs";
import path from "node:path";
import type { SirenEvent } from "../../../shared/events";

/**
 * Serialize a SirenEvent to a single JSONL line (no embedded newline).
 * Pure: depends only on its argument and performs no I/O.
 */
export function serializeEvent(ev: SirenEvent): string {
  return JSON.stringify(ev);
}

/**
 * Parse a single JSONL line back into a SirenEvent.
 * Pure: depends only on its argument and performs no I/O.
 */
export function parseEvent(line: string): SirenEvent {
  return JSON.parse(line) as SirenEvent;
}

/**
 * Appends emitted SirenEvents to a per-run JSONL replay file.
 * The file is named `<replayDir>/<startTimeMs>.jsonl` and each event
 * is written as one line.
 */
export class ReplayWriter {
  private readonly filePath: string;

  constructor(replayDir: string, startTimeMs: number) {
    fs.mkdirSync(replayDir, { recursive: true });
    this.filePath = path.join(replayDir, `${startTimeMs}.jsonl`);
  }

  append(ev: SirenEvent): void {
    fs.appendFileSync(this.filePath, serializeEvent(ev) + "\n");
  }
}
