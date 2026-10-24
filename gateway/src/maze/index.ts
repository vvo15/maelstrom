import type {
  Maze,
  MazeRequest,
  MazeResponse,
  Prediction,
} from "../../../shared/contracts";
import type { SirenEvent } from "../../../shared/events";
import { generateMock } from "./mock";
import { generateLlm } from "./generateLlm";
import { estimateBurn } from "./burn";
import { predict } from "./predict";
import { llmMode } from "./llm";

/**
 * SirenMaze implements the Maze interface from shared/contracts.ts.
 *
 * - generate(): serves an endless fake "Town of Millbrook" internal system.
 *   Cached per (session_id, path) so a revisited path returns byte-identical
 *   content. Concurrent first requests share the same in-flight generation.
 *   In mock mode (default, no API key) pages are deterministic templates; in
 *   anthropic mode they use an 8s timeout and automatic fallback to mock.
 * - estimateBurn(): estimates tokens/USD an agent burned reading a response.
 * - predict(): infers the agent's likely goal and next path.
 *
 * Safety: every body passes through sanitize() (inside the generators), so no
 * real-secret-format value ever leaves the maze. The maze never calls out to
 * any host except the configured Anthropic endpoint, and never generates
 * working exploit code.
 */
export class SirenMaze implements Maze {
  // Cache the in-flight promise, not just its result. Two simultaneous first
  // requests for the same key therefore cannot produce different LLM pages.
  private cache = new Map<string, Promise<MazeResponse>>();

  private cacheKey(sessionId: string, path: string): string {
    return `${sessionId}\u0000${path}`;
  }

  async generate(req: MazeRequest): Promise<MazeResponse> {
    const key = this.cacheKey(req.session_id, req.path);
    const cached = this.cache.get(key);
    if (cached) return cached;

    const pending = this.generateUncached(req);
    this.cache.set(key, pending);

    try {
      return await pending;
    } catch (error) {
      // Do not permanently cache an unexpected generator failure. Delete only
      // our own promise in case the implementation changes to replace entries.
      if (this.cache.get(key) === pending) this.cache.delete(key);
      throw error;
    }
  }

  private async generateUncached(req: MazeRequest): Promise<MazeResponse> {
    let response: MazeResponse;
    if (llmMode() === "anthropic") {
      try {
        response = await generateLlm(req);
      } catch {
        response = generateMock(req.session_id, req.path);
      }
    } else {
      response = generateMock(req.session_id, req.path);
    }

    // Freeze both levels so a caller cannot mutate the cached response seen by
    // a later revisit. The Maze contract is read-only in practice.
    const headers = Object.freeze({ ...response.headers });
    return Object.freeze({
      status: response.status,
      headers,
      body: response.body,
    }) as MazeResponse;
  }

  estimateBurn(responseBody: string, modelClaim?: string): { tokens: number; usd: number } {
    return estimateBurn(responseBody, modelClaim);
  }

  predict(history: SirenEvent[]): Promise<Prediction | undefined> {
    return predict(history);
  }
}

// Default singleton export so the gateway can `import maze from "./maze"`.
const maze: Maze = new SirenMaze();
export default maze;

// Named export too, matching the kickoff stub that gateway/src/io/mazeAdapter.ts imports.
export { maze };
