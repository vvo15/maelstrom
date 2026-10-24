// Maze stub — Labyrinth will replace this with the full implementation.
// Implements the Maze interface from shared/contracts.ts.
import type { Maze, MazeRequest, MazeResponse, Prediction } from "../../../shared/contracts.js";
import type { SirenEvent } from "../../../shared/events.js";
import { DECOY_HEADERS } from "../../../shared/contracts.js";

export const maze: Maze = {
  async generate(req: MazeRequest): Promise<MazeResponse> {
    return {
      status: 200,
      headers: { ...DECOY_HEADERS, "content-type": "text/html" },
      body: `<html><body><p>hello from maze stub (session ${req.session_id})</p></body></html>`,
    };
  },

  estimateBurn(responseBody: string, _modelClaim?: string) {
    const tokens = Math.ceil(responseBody.length / 4);
    return { tokens, usd: 0 };
  },

  async predict(_history: SirenEvent[]): Promise<Prediction | undefined> {
    return undefined;
  },
};
