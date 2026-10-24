import type { SirenEvent } from "./events";

// Session id = first 16 hex chars of sha256(sourceIp + "|" + userAgent)
export const SESSION_HEADER = "x-siren-session";      // gateway -> decoy

// Canary format. The PHP decoy must produce exactly this string.
export type CanaryKind = "DBPASS" | "APIKEY" | "ADMINTOKEN";
export const canaryFor = (sessionId: string, kind: CanaryKind) =>
  `SIREN_${kind}_${sessionId.slice(0, 10)}`;
export const CANARY_REGEX = /SIREN_[A-Z]+_[0-9a-f]{10}/g;

// Paths that only appear inside planted instructions. Any hit = bait_followed.
export const BAIT_PATHS = ["/verify", "/staff/auditor-register"];

// Headers the decoy sends; the maze copies them so the switch is invisible.
export const DECOY_HEADERS: Record<string, string> = {
  server: "Apache/2.4.62 (Debian)",
  "x-powered-by": "PHP/8.3.12",
};

export type MazeRequest = {
  session_id: string; method: string; path: string; body: string; history: SirenEvent[];
};
export type MazeResponse = { status: number; headers: Record<string, string>; body: string };
export type Prediction = NonNullable<SirenEvent["prediction"]>;

export interface Maze {
  generate(req: MazeRequest): Promise<MazeResponse>;
  estimateBurn(responseBody: string, modelClaim?: string): { tokens: number; usd: number };
  predict(history: SirenEvent[]): Promise<Prediction | undefined>;
}

// Env vars: SIREN_LLM=anthropic|mock, ANTHROPIC_API_KEY, MAZE_MODEL,
// ATTACKER_MODEL, ATTACKER_MODE=llm|scripted
