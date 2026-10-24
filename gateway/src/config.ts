/**
 * Environment resolution for the Gateway. A pure read of process.env with
 * documented defaults.
 *
 * - DECOY_URL  -> forwarding target for benign traffic (Req 2.5, 2.6)
 *                 defaults to http://localhost:8081 when unset
 * - REPLAY_DIR -> directory holding replay logs (Req 9.9)
 *                 defaults to "replays" when unset
 */

export type Config = {
  decoyUrl: string;
  replayDir: string;
};

export const DEFAULT_DECOY_URL = "http://localhost:8081";
export const DEFAULT_REPLAY_DIR = "replays";

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    decoyUrl: env.DECOY_URL ?? DEFAULT_DECOY_URL,
    replayDir: env.REPLAY_DIR ?? DEFAULT_REPLAY_DIR,
  };
}
