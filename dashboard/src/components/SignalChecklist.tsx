import type { Copy } from "../copy";
import type { SessionView } from "../model";
import { Icon } from "./Icon";

/** Signals the gateway can emit, in the order they are shown. */
const KNOWN_SIGNALS = ["bait_followed", "canary_reused", "think_pauses", "enumeration", "scripted_ua"];

export function SignalChecklist({ copy, session }: { copy: Copy["signals"]; session?: SessionView }) {
  const seen = session?.signalSeenAtCount ?? {};
  // Show any signal the gateway sends that this dashboard does not know yet.
  const extra = (session?.signals ?? []).filter((s) => !KNOWN_SIGNALS.includes(s));

  return (
    <section className="panel" aria-labelledby="signals-h">
      <h2 id="signals-h">{copy.heading}</h2>
      <ul className="signals">
        {[...KNOWN_SIGNALS, ...extra].map((name) => {
          const at = seen[name];
          const on = at !== undefined;
          const text = copy.known[name];
          return (
            <li key={name} className={`signal ${on ? "is-on" : "is-off"}`}>
              <Icon name={on ? "check" : "circle"} />
              <span className="signal-body">
                <span className="signal-title">{text?.title ?? name}</span>
                {text && <span className="signal-desc">{text.description}</span>}
                <span className="signal-state">{on ? copy.seen(at) : copy.notSeen}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
