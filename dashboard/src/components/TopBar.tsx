import type { Copy } from "../copy";
import { formatDuration, formatUsd } from "../format";
import type { Totals } from "../sessions";
import { Icon } from "./Icon";

export function TopBar({ copy, totals }: { copy: Copy["metrics"]; totals: Totals }) {
  const { detected } = totals;
  return (
    <section className="topbar" aria-label="Key numbers">
      <dl className="metrics">
        <div className="metric">
          <dt>{copy.ttdLabel}</dt>
          <dd>
            <span className="metric-value">{detected ? formatDuration(detected.ms) : copy.ttdNone}</span>
            <span className="metric-sub">
              {detected ? copy.ttdSub(detected.requests) : copy.ttdNoneSub}
            </span>
          </dd>
        </div>
        <div className="metric">
          <dt>{copy.usdLabel}</dt>
          <dd>
            <span className="metric-value">{formatUsd(totals.usd)}</span>
            <span className="metric-sub">{copy.usdSub(totals.flaggedCount)}</span>
          </dd>
        </div>
        <div className="metric metric-safe">
          <dt>{copy.residentLabel}</dt>
          <dd>
            <span className="metric-value">
              <Icon name="shield" /> 0
            </span>
            <span className="metric-sub">{copy.residentSub}</span>
          </dd>
        </div>
      </dl>
    </section>
  );
}
