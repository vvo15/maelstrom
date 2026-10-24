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
 *   content. In mock mode (default, no API key) pages are deterministic
 *   templates; in anthropic mode they come from a cheap model with an 8s
 *   timeout and automatic fallback to mock for that path.
 * - estimateBurn(): estimates tokens/USD an agent burned reading a response.
 * - predict(): infers the agent's likely goal and next path.
 *
 * Safety: every body passes through sanitize() (inside the generators), so no
 * real-secret-format value ever leaves the maze. The maze never calls out to
 * any host except the configured Anthropic endpoint, and never generates
 * working exploit code.
 */
export class SirenMaze implements Maze {
  // Cache key = `${session_id}\u0000${path}`. Value = frozen MazeResponse.
  private cache = new Map<string, MazeResponse>();

  private cacheKey(sessionId: string, path: string): string {
    return `${sessionId}\u0000${path}`;
  }

  async generate(req: MazeRequest): Promise<MazeResponse> {
    const key = this.cacheKey(req.session_id, req.path);
    const cached = this.cache.get(key);
    if (cached) return cached;

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

    // Freeze so callers cannot mutate the cached value.
    const frozen: MazeResponse = {
      status: response.status,
      headers: { ...response.headers },
      body: response.body,
    };
    this.cache.set(key, frozen);
    return frozen;
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
