import type { SirenEvent } from "./model";

/**
 * MITRE ATT&CK mapping, computed in the dashboard so the SirenEvent schema
 * stays unchanged.
 *
 * Every ID, name and tactic below was checked against attack.mitre.org on
 * 2026-10-24. Re-check before adding or changing an entry:
 *   https://attack.mitre.org/techniques/<ID>/   (sub-techniques: T1234/001/)
 */
export interface Technique {
  id: string;
  name: string;
  tactics: string[];
  url: string;
  /** One sentence for the Town IT view. */
  plain: string;
}

export const TECHNIQUES: Record<string, Technique> = {
  "T1595.003": {
    id: "T1595.003",
    name: "Active Scanning: Wordlist Scanning",
    tactics: ["Reconnaissance"],
    url: "https://attack.mitre.org/techniques/T1595/003/",
    plain: "Guessing page names in bulk to find hidden pages.",
  },
  "T1594": {
    id: "T1594",
    name: "Search Victim-Owned Websites",
    tactics: ["Reconnaissance"],
    url: "https://attack.mitre.org/techniques/T1594/",
    plain: "Reading the town website's public files for clues.",
  },
  "T1552.001": {
    id: "T1552.001",
    name: "Unsecured Credentials: Credentials In Files",
    tactics: ["Credential Access"],
    url: "https://attack.mitre.org/techniques/T1552/001/",
    plain: "Opening files to look for passwords left inside them.",
  },
  "T1078": {
    id: "T1078",
    name: "Valid Accounts",
    tactics: ["Stealth", "Persistence", "Privilege Escalation", "Initial Access"],
    url: "https://attack.mitre.org/techniques/T1078/",
    plain: "Signing in with a password it found.",
  },
  "T1190": {
    id: "T1190",
    name: "Exploit Public-Facing Application",
    tactics: ["Initial Access"],
    url: "https://attack.mitre.org/techniques/T1190/",
    plain: "Trying to exploit a flaw in a public web page.",
  },
};

export interface TechniqueMatch {
  id: string;
  evidence: string;
}

/** Signal name -> technique. Signals are counted the first time they appear. */
const SIGNAL_RULES: Record<string, string> = {
  enumeration: "T1595.003",
  canary_reused: "T1078",
};

const RECON_FILES = /^\/(robots\.txt|sitemap\.xml)(\?|$)/i;
// Credential-bearing files: dotenv, READMEs and admin notes, backups, config files.
const CREDENTIAL_FILES =
  /(^|\/)\.env(\.|\?|$|\/)|readme|\/backup\/|config\.(php|json|ya?ml|ini)|\.(bak|sql|ini|conf)(\?|$)/i;
// Typical injection and traversal probes. Matched on path and request body.
const EXPLOIT_PATTERNS =
  /\.\.(\/|%2f)|%2e%2e|\/etc\/passwd|union(\s|\+|%20)+select|('|%27)(\s|\+|%20)*or(\s|\+|%20)+('|%27)?1|<script|\$\(|;\s*(cat|ls|id|wget|curl)\b|[?&](cmd|exec)=/i;

/**
 * Techniques implied by one event. `newSignals` are the signals that appear
 * for the first time in this event (so signal-based techniques fire once).
 */
export function techniquesFor(e: SirenEvent, newSignals: string[]): TechniqueMatch[] {
  const out: TechniqueMatch[] = [];
  const request = `${e.method} ${e.path}`;

  for (const s of newSignals) {
    const id = SIGNAL_RULES[s];
    if (id) out.push({ id, evidence: `signal ${s}` });
  }
  if (RECON_FILES.test(e.path)) {
    out.push({ id: "T1594", evidence: request });
  }
  // Reading a credential file counts only when it was actually served.
  if (e.status < 400 && CREDENTIAL_FILES.test(e.path)) {
    out.push({ id: "T1552.001", evidence: request });
  }
  // Exploit attempts are only attributed once the session is in the maze.
  if (e.route === "maze" && (EXPLOIT_PATTERNS.test(e.path) || EXPLOIT_PATTERNS.test(e.body_snippet))) {
    out.push({ id: "T1190", evidence: request });
  }
  return out;
}
