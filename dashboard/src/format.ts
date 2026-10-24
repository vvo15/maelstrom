export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  const m = Math.floor(s / 60);
  return `${m} min ${Math.round(s - m * 60)} s`;
}

/** Small dollar amounts keep 3 decimals so a first request does not read as $0.00. */
export function formatUsd(usd: number): string {
  if (usd <= 0) return "$0.00";
  if (usd < 1) return `$${usd.toFixed(usd < 0.1 ? 3 : 2)}`;
  return `$${usd.toFixed(2)}`;
}

export function formatClock(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

export function formatOffset(ts: number, startTs: number): string {
  return `+${((ts - startTs) / 1000).toFixed(1)} s`;
}

export type StatusClass = "ok" | "redirect" | "denied" | "missing" | "error";

export function statusClass(status: number): StatusClass {
  if (status >= 500) return "error";
  if (status === 401 || status === 403) return "denied";
  if (status >= 400) return "missing";
  if (status >= 300) return "redirect";
  return "ok";
}
