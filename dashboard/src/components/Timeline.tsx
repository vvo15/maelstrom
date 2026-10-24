import type { Copy } from "../copy";
import { formatClock, formatOffset, statusClass, type StatusClass } from "../format";
import type { SessionView, ViewMode } from "../model";
import { Icon, type IconName } from "./Icon";

const MAX_ROWS = 100;

const STATUS_ICON: Record<StatusClass, IconName> = {
  ok: "check",
  redirect: "arrow",
  denied: "block",
  missing: "search",
  error: "alert",
};

interface Props {
  copy: Copy["timeline"];
  mode: ViewMode;
  session?: SessionView;
}

export function Timeline({ copy, mode, session }: Props) {
  const events = session?.events ?? [];
  const total = session?.count ?? 0;
  const shown = events.slice(-MAX_ROWS).reverse();
  const hidden = total - shown.length;
  const plain = mode === "plain";

  return (
    <section className="panel" aria-labelledby="timeline-h" id="timeline">
      <h2 id="timeline-h">{copy.heading}</h2>
      <p className="hint">{copy.label}</p>

      {shown.length === 0 && <p className="empty">{copy.empty}</p>}

      {/* Focusable so keyboard users can scroll it. */}
      <div className="scroll" tabIndex={0} role="region" aria-label={copy.label}>
        <div className={`row row-head ${plain ? "row-plain" : ""}`} aria-hidden="true">
          <span>{copy.colTime}</span>
          {!plain && <span>{copy.colMethod}</span>}
          <span>{copy.colPath}</span>
          <span>{copy.colStatus}</span>
          <span>{copy.colRoute}</span>
        </div>
        {/* The list stays mounted so screen readers announce each new row politely. */}
        <ol className="rows" aria-live="polite" aria-relevant="additions">
          {shown.map((e, i) => {
            const sc = statusClass(e.status);
            return (
              <li
                // Absolute position in the session: stable as new rows arrive.
                key={total - i}
                className={`row ${plain ? "row-plain" : ""} route-${e.route}`}
              >
                <span className="cell-time">
                  {plain ? formatClock(e.ts) : formatOffset(e.ts, session?.firstTs ?? e.ts)}
                </span>
                {!plain && <span className="cell-method">{e.method}</span>}
                <span className="cell-path">{plain ? copy.describe(e) : e.path}</span>
                <span className={`pill status-${sc}`}>
                  <Icon name={STATUS_ICON[sc]} />
                  <span>
                    <span className="sr-only">{copy.colStatus}: </span>
                    {copy.status(e.status)}
                  </span>
                </span>
                <span className={`pill route-pill route-pill-${e.route}`}>
                  <Icon name={e.route === "maze" ? "maze" : "decoy"} />
                  <span>
                    <span className="sr-only">{copy.colRoute}: </span>
                    {copy.route(e.route)}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
        {hidden > 0 && <p className="hint">{copy.more(hidden)}</p>}
      </div>
    </section>
  );
}
