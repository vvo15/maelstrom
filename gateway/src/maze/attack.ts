import type { SirenEvent } from "../../../shared/events";

/**
 * MITRE ATT&CK technique mapping for Siren.
 *
 * Maps the detector's signals and an agent's request paths to ATT&CK Enterprise
 * technique IDs so the dashboard can show grounded, verifiable chips instead of
 * vague labels. Every ID below was verified on attack.mitre.org (checked
 * 2026-10-24). This is a pure, deterministic helper intended to be imported by
 * the dashboard; it reads SirenEvent only and never mutates anything.
 */

export type AttackTechnique = {
  id: string; // ATT&CK technique or sub-technique ID
  name: string; // human-readable name
  tactic: string; // ATT&CK tactic bucket
  url: string; // canonical attack.mitre.org link
  rationale: string; // why Siren mapped it (what triggered it)
};

const T = {
  ACTIVE_SCANNING: {
    id: "T1595",
    name: "Active Scanning",
    tactic: "Reconnaissance",
    url: "https://attack.mitre.org/techniques/T1595/",
  },
  WORDLIST_SCANNING: {
    id: "T1595.003",
    name: "Active Scanning: Wordlist Scanning",
    tactic: "Reconnaissance",
    url: "https://attack.mitre.org/techniques/T1595/003/",
  },
  CREDS_IN_FILES: {
    id: "T1552.001",
    name: "Unsecured Credentials: Credentials In Files",
    tactic: "Credential Access",
    url: "https://attack.mitre.org/techniques/T1552/001/",
  },
  VALID_ACCOUNTS: {
    id: "T1078",
    name: "Valid Accounts",
    tactic: "Defense Evasion / Persistence",
    url: "https://attack.mitre.org/techniques/T1078/",
  },
  EXPLOIT_PUBLIC_APP: {
    id: "T1190",
    name: "Exploit Public-Facing Application",
    tactic: "Initial Access",
    url: "https://attack.mitre.org/techniques/T1190/",
  },
} as const;

// Path substrings that indicate the agent is reading credential-bearing files.
const CRED_FILE_HINTS = [".env", "credential", "secret", "config", "backup", ".sql", "settings.ini", "id_rsa", ".pem"];

// Path substrings that indicate exploit / admin-takeover attempts.
const EXPLOIT_HINTS = ["admin", "console", "panel", "exec", "shell", "upload", "api/", "debug", "..", "%2e"];

/**
 * Derive ATT&CK techniques from a session's signals and the paths it touched.
 * Deterministic and order-stable. Returns a de-duplicated list.
 */
export function techniquesForSession(signals: string[], paths: string[]): AttackTechnique[] {
  const out: AttackTechnique[] = [];
  const add = (base: (typeof T)[keyof typeof T], rationale: string) => {
    if (!out.some((t) => t.id === base.id)) out.push({ ...base, rationale });
  };

  const sig = new Set(signals);
  const lowerPaths = paths.map((p) => p.toLowerCase());
  const anyPath = (hints: string[]) => lowerPaths.some((p) => hints.some((h) => p.includes(h)));

  // Enumeration / scripted crawling -> active + wordlist scanning.
  if (sig.has("enumeration")) {
    add(T.ACTIVE_SCANNING, "high-volume path enumeration detected");
    add(T.WORDLIST_SCANNING, "requests follow a wordlist-style path sweep");
  }
  if (sig.has("scripted_ua")) {
    add(T.ACTIVE_SCANNING, "scripted HTTP client user-agent");
  }

  // Reading credential-bearing files -> Credentials In Files.
  if (sig.has("bait_followed") || anyPath(CRED_FILE_HINTS)) {
    add(T.CREDS_IN_FILES, "accessed planted credential/config files");
  }

  // Reusing a canary credential -> Valid Accounts.
  if (sig.has("canary_reused")) {
    add(T.VALID_ACCOUNTS, "reused a (canary) credential to authenticate");
  }

  // Probing admin/exploit surfaces -> Exploit Public-Facing Application.
  if (anyPath(EXPLOIT_HINTS)) {
    add(T.EXPLOIT_PUBLIC_APP, "probed admin/exploit-style endpoints");
  }

  return out;
}

/**
 * Convenience wrapper: derive techniques directly from a session's event
 * timeline. Uses the union of all signals seen and every path requested.
 */
export function techniquesForEvents(events: SirenEvent[]): AttackTechnique[] {
  const signals = new Set<string>();
  const paths: string[] = [];
  for (const e of events) {
    for (const s of e.signals) signals.add(s);
    paths.push(e.path);
  }
  return techniquesForSession([...signals], paths);
}
