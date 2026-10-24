import type { Copy } from "../copy";
import type { SessionView } from "../model";

export function AttackerMind({ copy, session }: { copy: Copy["mind"]; session?: SessionView }) {
  const p = session?.prediction;
  return (
    <section className="panel" aria-labelledby="mind-h">
      <h2 id="mind-h">{copy.heading}</h2>
      {p ? (
        <dl className="mind">
          <div>
            <dt>{copy.goal}</dt>
            <dd>{p.likely_goal}</dd>
          </div>
          <div>
            <dt>{copy.step}</dt>
            <dd>{p.current_step}</dd>
          </div>
          <div>
            <dt>{copy.next}</dt>
            <dd className="mono">{p.predicted_next_path}</dd>
          </div>
        </dl>
      ) : (
        <p className="empty">{session?.flagged ? copy.waiting : copy.notFlagged}</p>
      )}
    </section>
  );
}
