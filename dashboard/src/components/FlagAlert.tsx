import type { Copy } from "../copy";
import type { SessionView } from "../model";
import { Icon } from "./Icon";

export function FlagAlert({ copy, session }: { copy: Copy["alert"]; session?: SessionView }) {
  const flagged = session?.flagged ?? false;
  const ms =
    session && session.flaggedTs !== undefined ? Math.max(0, session.flaggedTs - session.firstTs) : 0;

  return (
    <section className={`panel alert ${flagged ? "alert-flagged" : "alert-clear"}`} aria-labelledby="alert-h">
      <h2 id="alert-h">{copy.heading}</h2>
      {/* Always mounted so the assertive announcement fires when a flag appears. */}
      <div aria-live="assertive" aria-atomic="true" className="alert-body">
        {!session ? (
          <p className="alert-line">
            <Icon name="info" />
            {copy.waiting}
          </p>
        ) : flagged ? (
          <>
            <p className="alert-title">
              <Icon name="flag" />
              {copy.flaggedTitle}
            </p>
            <p>{copy.flaggedBody}</p>
            <dl className="facts">
              <div>
                <dt>{copy.modelLabel}</dt>
                <dd>{session.modelClaim ?? copy.notStated}</dd>
              </div>
              <div>
                <dt>{copy.goalLabel}</dt>
                <dd>{session.statedGoal ?? copy.notStated}</dd>
              </div>
            </dl>
            {session.flaggedAtCount !== undefined && (
              <p className="hint">{copy.summary(session.flaggedAtCount, ms)}</p>
            )}
          </>
        ) : (
          <p className="alert-line">
            <Icon name="check" />
            {copy.clear(session.score)}
          </p>
        )}
      </div>
    </section>
  );
}
