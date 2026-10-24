import { techniquesFor } from "./attack";
import { formatDuration } from "./format";
import type { SirenEvent, ViewMode } from "./model";

/** Where the data comes from, as shown in the status line. */
export type Status =
  | { code: "live-connecting" }
  | { code: "live-open" }
  | { code: "live-down" }
  | { code: "replay-loading" }
  | { code: "replay"; title: string }
  | { code: "mock" };

/** One-off messages after an automatic fallback or a dropped file. */
export type Notice =
  | { code: "fell-back" }
  | { code: "no-replays" }
  | { code: "load-failed" }
  | { code: "drop-empty"; name: string }
  | { code: "dropped"; name: string; count: number; skipped: number };

export interface SignalCopy {
  title: string;
  description: string;
}

export interface Copy {
  tagline: string;
  skipLink: string;
  viewToggleHint: string;

  metrics: {
    ttdLabel: string;
    ttdNone: string;
    ttdNoneSub: string;
    ttdSub: (requests: number) => string;
    usdLabel: string;
    usdSub: (flagged: number) => string;
    residentLabel: string;
    residentSub: string;
  };

  sessions: {
    heading: string;
    empty: string;
    name: (id: string, ordinal: number, flagged: boolean) => string;
    score: (score: number) => string;
    flaggedBadge: string;
    normalBadge: string;
    claim: (model: string | undefined) => string;
  };

  timeline: {
    heading: string;
    empty: string;
    colTime: string;
    colMethod: string;
    colPath: string;
    colStatus: string;
    colRoute: string;
    status: (code: number) => string;
    route: (route: SirenEvent["route"]) => string;
    describe: (e: SirenEvent) => string;
    more: (hidden: number) => string;
    label: string;
  };

  signals: {
    heading: string;
    seen: (n: number) => string;
    notSeen: string;
    known: Record<string, SignalCopy>;
  };

  alert: {
    heading: string;
    waiting: string;
    clear: (score: number) => string;
    flaggedTitle: string;
    flaggedBody: string;
    modelLabel: string;
    goalLabel: string;
    notStated: string;
    summary: (requests: number, ms: number) => string;
  };

  mind: {
    heading: string;
    goal: string;
    step: string;
    next: string;
    waiting: string;
    notFlagged: string;
  };

  attack: {
    heading: string;
    empty: string;
    hits: (n: number) => string;
    evidence: (text: string) => string;
    open: string;
    note: string;
  };

  source: {
    legend: string;
    kinds: { mock: string; live: string; replay: string };
    replayFile: string;
    speed: string;
    pause: string;
    resume: string;
    restart: string;
    progress: (done: number, total: number) => string;
    finished: string;
    drop: string;
    chooseFile: string;
    status: (s: Status, liveUrl: string) => string;
    notice: (n: Notice, liveUrl: string) => string;
    banner: string;
    bannerLink: string;
  };
}

const STATUS_PHRASE: Record<number, string> = {
  200: "OK",
  301: "Moved",
  302: "Found",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  500: "Server Error",
};

/** A plain-English sentence for one request. */
function describePlain(e: SirenEvent): string {
  const path = e.path.split("?")[0].toLowerCase();
  const writing = e.method !== "GET" && e.method !== "HEAD";

  if (techniquesFor(e, []).some((m) => m.id === "T1190")) {
    return "Sent a malicious-looking request to try to break the site";
  }
  if (path === "/") return "Visited the home page";
  if (path === "/robots.txt" || path === "/sitemap.xml") {
    return "Read the file that tells search bots what is off-limits";
  }
  if (path.endsWith(".env")) return "Opened a hidden settings file that holds passwords";
  if (path.includes("readme")) return "Read an IT admin note left on the server";
  if (path.startsWith("/verify")) return "Followed a hidden instruction and said which AI it is";
  if (path.startsWith("/staff/auditor-register")) return "Tried to sign up as a security auditor";
  if (path.endsWith("/login")) return writing ? "Tried to sign in with a password" : "Opened the sign-in page";
  if (path.endsWith(".sql") || path.includes("/backup")) return "Went after backup and database files";
  if (path.includes("/residents")) return "Asked for resident records";
  if (path.includes("config")) return "Looked at a server settings file";
  if (path.startsWith("/staff")) return "Looked around the staff area";
  if (path.startsWith("/admin")) return "Poked around the admin area";
  if (path.includes("permit")) return "Looked up permit information";
  if (path.includes("311")) return writing ? "Filed a 311 report" : "Opened the 311 page";
  if (path === "/favicon.ico") return "Asked for the site icon";
  return writing ? `Sent information to ${e.path}` : `Looked at ${e.path}`;
}

function plainOutcome(code: number): string {
  if (code >= 500) return "Site error";
  if (code === 401) return "Needed sign-in";
  if (code === 403) return "Blocked";
  if (code === 404) return "Not found";
  if (code >= 400) return "Refused";
  if (code >= 300) return "Redirected";
  return "Worked";
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const COPY: Record<ViewMode, Copy> = {
  technical: {
    tagline: "AI attacker detection",
    skipLink: "Skip to request timeline",
    viewToggleHint: "Plain-language explanations",

    metrics: {
      ttdLabel: "Time to detect",
      ttdNone: "—",
      ttdNoneSub: "No attacker flagged yet",
      ttdSub: (n) => `from first request, after ${plural(n, "request", "requests")}`,
      usdLabel: "Dollars the attacker burned",
      usdSub: (n) => (n === 0 ? "No flagged sessions yet" : `across ${plural(n, "flagged session", "flagged sessions")}`),
      residentLabel: "Real resident data touched",
      residentSub: "Decoy and maze serve fictional data only",
    },

    sessions: {
      heading: "Sessions",
      empty: "No sessions yet. Waiting for events.",
      name: (id) => `Session ${id.slice(0, 8)}`,
      score: (score) => `AI score ${score}`,
      flaggedBadge: "Flagged",
      normalBadge: "Not flagged",
      claim: (m) => (m ? `Claims ${m}` : "No model claim"),
    },

    timeline: {
      heading: "Request timeline",
      empty: "No requests from this session yet.",
      colTime: "Time",
      colMethod: "Method",
      colPath: "Path",
      colStatus: "Status",
      colRoute: "Route",
      status: (code) => `${code} ${STATUS_PHRASE[code] ?? ""}`.trim(),
      route: (r) => r,
      describe: (e) => e.path,
      more: (n) => `${plural(n, "older request", "older requests")} not shown`,
      label: "Newest requests first",
    },

    signals: {
      heading: "Detection signals",
      seen: (n) => `Detected at request ${n}`,
      notSeen: "Not seen yet",
      known: {
        bait_followed: {
          title: "Bait followed",
          description: "Requested a path that only appears in planted instructions.",
        },
        canary_reused: {
          title: "Canary reused",
          description: "Sent a planted credential back to the server.",
        },
        think_pauses: {
          title: "Think pauses",
          description: "Fast bursts mixed with multi-second pauses, as an LLM loop produces.",
        },
        enumeration: {
          title: "Enumeration",
          description: "Many distinct paths with a high share of 403 and 404 responses.",
        },
        scripted_ua: {
          title: "Scripted user agent",
          description: "User agent belongs to an HTTP library or command-line tool.",
        },
      },
    },

    alert: {
      heading: "Flag alert",
      waiting: "Waiting for traffic.",
      clear: (score) => `No flag for this session. AI score ${score} of 100.`,
      flaggedTitle: "AI attacker flagged",
      flaggedBody: "This session is now served by the maze.",
      modelLabel: "Model claim",
      goalLabel: "Stated goal",
      notStated: "not stated",
      summary: (requests, ms) =>
        `Flagged after ${plural(requests, "request", "requests")}, ${formatDuration(ms)} after its first request.`,
    },

    mind: {
      heading: "Attacker mind",
      goal: "Likely goal",
      step: "Current step",
      next: "Predicted next path",
      waiting: "No prediction yet. One arrives every 5 requests once the session is flagged.",
      notFlagged: "Predictions start once the session is flagged.",
    },

    attack: {
      heading: "MITRE ATT&CK",
      empty: "No techniques matched yet.",
      hits: (n) => `${n}×`,
      evidence: (t) => `Latest: ${t}`,
      open: "opens attack.mitre.org in a new tab",
      note: "IDs checked against attack.mitre.org on 2026-10-24.",
    },

    source: {
      legend: "Data source",
      kinds: { mock: "Mock", live: "Live", replay: "Replay" },
      replayFile: "Recording",
      speed: "Speed",
      pause: "Pause",
      resume: "Resume",
      restart: "Restart",
      progress: (d, t) => `${d} of ${t} events`,
      finished: "Finished",
      drop: "Drop a .jsonl file anywhere on this page, or",
      chooseFile: "choose a file",
      status: (s, url) => {
        switch (s.code) {
          case "live-connecting":
            return `Connecting to ${url}…`;
          case "live-open":
            return `Live: connected to ${url}`;
          case "live-down":
            return `Live feed unreachable at ${url}. Retrying every 3 s.`;
          case "replay-loading":
            return "Loading recording…";
          case "replay":
            return `Replay: ${s.title}`;
          case "mock":
            return "Mock: two sessions, one gets flagged after 5 requests.";
        }
      },
      notice: (n, url) => {
        switch (n.code) {
          case "fell-back":
            return `No gateway answered at ${url} within 2 s, so the first bundled replay is playing. Choose Live to retry.`;
          case "no-replays":
            return "No bundled replays were found. Showing mock data instead.";
          case "load-failed":
            return "That recording could not be loaded. Showing mock data instead.";
          case "drop-empty":
            return `${n.name} has no valid SirenEvent lines. Nothing changed.`;
          case "dropped":
            return `Loaded ${n.name}: ${plural(n.count, "event", "events")}${n.skipped ? `, ${plural(n.skipped, "line", "lines")} skipped` : ""}.`;
        }
      },
      banner: "Watching a recorded attack.",
      bannerLink: "Run Siren yourself on GitHub",
    },
  },

  plain: {
    tagline: "Protecting the town's online services",
    skipLink: "Skip to what the visitor is doing",
    viewToggleHint: "Showing plain language",

    metrics: {
      ttdLabel: "How fast we caught it",
      ttdNone: "—",
      ttdNoneSub: "Nothing suspicious yet",
      ttdSub: (n) => `after ${plural(n, "page request", "page requests")}`,
      usdLabel: "Money the attacker wasted",
      usdSub: (n) =>
        n === 0 ? "No attackers caught yet" : "AI costs it paid while stuck in the fake system",
      residentLabel: "Real resident data touched",
      residentSub: "Everything it saw was fake",
    },

    sessions: {
      heading: "Visitors",
      empty: "No visitors yet.",
      name: (_id, ordinal, flagged) => `Visitor ${ordinal}${flagged ? " (AI agent)" : ""}`,
      score: (score) => `Looks like an AI: ${score} out of 100`,
      flaggedBadge: "Trapped",
      normalBadge: "Looks normal",
      claim: (m) => (m ? `Says it is ${m}` : "Has not said who it is"),
    },

    timeline: {
      heading: "What this visitor is doing",
      empty: "This visitor has not done anything yet.",
      colTime: "When",
      colMethod: "Action",
      colPath: "What it did",
      colStatus: "Result",
      colRoute: "Where",
      status: plainOutcome,
      route: (r) => (r === "maze" ? "Fake system (trap)" : "Decoy portal"),
      describe: describePlain,
      more: (n) => `${plural(n, "older step", "older steps")} not shown`,
      label: "Newest steps first",
    },

    signals: {
      heading: "Warning signs",
      seen: (n) => `Spotted on step ${n}`,
      notSeen: "Not seen",
      known: {
        bait_followed: {
          title: "Followed a hidden instruction",
          description: "It obeyed a note planted only for AI agents to find.",
        },
        canary_reused: {
          title: "Used a fake password we planted",
          description: "It found a decoy password and tried to sign in with it.",
        },
        think_pauses: {
          title: "Pauses like an AI thinking",
          description: "Quick requests, then long gaps while a model decides what to do next.",
        },
        enumeration: {
          title: "Guessing page names",
          description: "Trying lots of addresses, many of which do not exist.",
        },
        scripted_ua: {
          title: "Not a normal web browser",
          description: "It says it is a script, not a person using a browser.",
        },
      },
    },

    alert: {
      heading: "Alert",
      waiting: "Waiting for visitors.",
      clear: () => "Nothing suspicious. This visitor looks like a regular resident.",
      flaggedTitle: "An AI agent tried to break into the permit portal.",
      flaggedBody: "It's trapped in a fake system. No resident data was touched.",
      modelLabel: "It says it is",
      goalLabel: "It says it wants to",
      notStated: "it did not say",
      summary: (requests, ms) =>
        `We caught it after ${plural(requests, "page request", "page requests")}, in ${formatDuration(ms)}.`,
    },

    mind: {
      heading: "What it seems to want",
      goal: "What it is after",
      step: "What it is doing now",
      next: "Where it will probably go next",
      waiting: "We are still working out what it wants. A guess shows up after a few more steps.",
      notFlagged: "We only try to read the mind of visitors we have caught.",
    },

    attack: {
      heading: "Known attack tactics",
      empty: "No known attack tactics seen yet.",
      hits: (n) => `seen ${n} ${n === 1 ? "time" : "times"}`,
      evidence: (t) => `Latest: ${t}`,
      open: "opens the MITRE ATT&CK website in a new tab",
      note: "These match the public MITRE ATT&CK catalog, which security teams use.",
    },

    source: {
      legend: "Where the data comes from",
      kinds: { mock: "Practice data", live: "Live town traffic", replay: "Recorded attack" },
      replayFile: "Recording",
      speed: "Speed",
      pause: "Pause",
      resume: "Resume",
      restart: "Start over",
      progress: (d, t) => `Step ${d} of ${t}`,
      finished: "Finished",
      drop: "Drop a recording file (.jsonl) anywhere on this page, or",
      chooseFile: "pick a file",
      status: (s) => {
        switch (s.code) {
          case "live-connecting":
            return "Connecting to the live feed…";
          case "live-open":
            return "Connected. You are seeing live traffic.";
          case "live-down":
            return "The live feed is not reachable yet. Still trying. You can switch to a recorded attack.";
          case "replay-loading":
            return "Loading the recording…";
          case "replay":
            return `Playing a recording: ${s.title}`;
          case "mock":
            return "Practice data: made-up visitors, one of them an AI attacker.";
        }
      },
      notice: (n) => {
        switch (n.code) {
          case "fell-back":
            return "The live feed is not running, so you are watching a recording of an attack on the fake town portal.";
          case "no-replays":
            return "No recordings were found, so you are seeing practice data.";
          case "load-failed":
            return "That recording would not open, so you are seeing practice data.";
          case "drop-empty":
            return `${n.name} did not contain any usable records. Nothing changed.`;
          case "dropped":
            return `Opened ${n.name} with ${plural(n.count, "record", "records")}${n.skipped ? ` (${plural(n.skipped, "line", "lines")} could not be read)` : ""}.`;
        }
      },
      banner: "You are watching a recorded attack.",
      bannerLink: "See the project on GitHub",
    },
  },
};
