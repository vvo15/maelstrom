import { TECHNIQUES } from "../attack";
import type { Copy } from "../copy";
import type { SessionView, ViewMode } from "../model";
import { Icon } from "./Icon";

interface Props {
  copy: Copy["attack"];
  mode: ViewMode;
  session?: SessionView;
}

export function AttackChips({ copy, mode, session }: Props) {
  const hits = (session?.techniques ?? []).filter((h) => TECHNIQUES[h.id]);
  const plain = mode === "plain";

  return (
    <section className="panel" aria-labelledby="attack-h">
      <h2 id="attack-h">{copy.heading}</h2>
      {hits.length === 0 ? (
        <p className="empty">{copy.empty}</p>
      ) : (
        <ul className="chips">
          {hits.map((h) => {
            const t = TECHNIQUES[h.id];
            return (
              <li key={h.id} className="chip">
                <a href={t.url} target="_blank" rel="noopener noreferrer">
                  {plain ? (
                    <span className="chip-main">{t.plain}</span>
                  ) : (
                    <span className="chip-main">
                      <span className="mono chip-id">{t.id}</span> {t.name}
                    </span>
                  )}
                  <Icon name="external" />
                  <span className="sr-only">
                    {plain ? ` (${t.id}, ${t.name}; ` : " ("}
                    {copy.open})
                  </span>
                </a>
                <span className="chip-meta">
                  {plain && <span className="mono">{t.id}. </span>}
                  {t.tactics.join(", ")}. {copy.hits(h.hits)}
                </span>
                {!plain && <span className="chip-meta">{copy.evidence(h.lastEvidence)}</span>}
              </li>
            );
          })}
        </ul>
      )}
      <p className="hint">{copy.note}</p>
    </section>
  );
}
