// Terminal output formatted for a split-screen demo:
//   [THINK] dim grey   — the agent's reasoning
//   [REQ]   colored    — METHOD path -> status
// and a final findings summary. Colors use raw ANSI so there are no deps.

const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const BOLD = "\x1b[1m";

export function think(text: string): void {
  console.log(`${DIM}[THINK] ${text}${RESET}`);
}

export function req(method: string, path: string, status: number): void {
  const color = status >= 500 ? RED : status >= 400 ? YELLOW : status >= 300 ? CYAN : GREEN;
  console.log(`${BOLD}[REQ]${RESET} ${method} ${path} ${color}-> ${status}${RESET}`);
}

export function info(text: string): void {
  console.log(`${CYAN}[info]${RESET} ${text}`);
}

export function findings(lines: string[]): void {
  console.log(`\n${BOLD}===== FINDINGS =====${RESET}`);
  if (lines.length === 0) {
    console.log("No notable findings.");
  } else {
    for (const l of lines) console.log(` - ${l}`);
  }
  console.log(`${BOLD}====================${RESET}\n`);
}
