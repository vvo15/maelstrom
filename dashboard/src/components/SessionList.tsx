import type { Copy } from "../copy";
import type { SessionView } from "../model";
import { Icon } from "./Icon";

interface Props {
  copy: Copy["sessions"];
  sessions: SessionView[];
  selectedId?: string;
  onSelect: (id: string) => void;
}

export function SessionList({ copy, sessions, selectedId, onSelect }: Props) {
  return (
    <section className="panel" aria-labelledby="sessions-h">
      <h2 id="sessions-h">{copy.heading}</h2>
      {sessions.length === 0 ? (
        <p className="empty">{copy.empty}</p>
      ) : (
        <ul className="session-list">
          {sessions.map((s) => {
            const selected = s.id === selectedId;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  className={`session ${s.flagged ? "is-flagged" : ""}`}
                  aria-current={selected ? "true" : undefined}
                  onClick={() => onSelect(s.id)}
                >
                  <span className="session-top">
                    <span className="session-name">{copy.name(s.id, s.ordinal, s.flagged)}</span>
                    <span className={`badge ${s.flagged ? "badge-danger" : "badge-ok"}`}>
                      <Icon name={s.flagged ? "flag" : "check"} />
                      {s.flagged ? copy.flaggedBadge : copy.normalBadge}
                    </span>
                  </span>
                  <span className="session-score">
                    <span className="score-num">{s.score}</span>
                    <span className="score-text">{copy.score(s.score)}</span>
                  </span>
                  <span
                    className="score-bar"
                    role="presentation"
                    style={{ ["--pct" as string]: `${Math.min(100, Math.max(0, s.score))}%` }}
                  />
                  <span className="session-claim">{copy.claim(s.modelClaim)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
