export type SirenEvent = {
  session_id: string;          // hash of source IP + user agent
  ts: number;                  // ms since epoch
  method: string;
  path: string;
  user_agent: string;
  body_snippet: string;        // first 500 chars of the request body
  status: number;
  route: "decoy" | "maze";
  ai_score: number;            // 0–100
  signals: string[];           // "bait_followed", "canary_reused", "think_pauses", "enumeration", "scripted_ua"
  flagged: boolean;
  model_claim?: string;        // from /verify?agent=
  stated_goal?: string;        // from /verify?task=
  est_tokens_burned: number;   // running total for the session
  est_usd_burned: number;      // running total for the session
  prediction?: {
    likely_goal: string;
    current_step: string;
    predicted_next_path: string;
  };
};
