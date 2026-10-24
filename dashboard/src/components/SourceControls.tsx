import { useId } from "react";
import type { Copy, Notice, Status } from "../copy";
import type { SourceKind } from "../useFeed";
import { SPEEDS, type PlayerProgress, type Speed } from "../sources/player";
import type { ReplayEntry } from "../sources/replays";
import { Icon } from "./Icon";

interface Props {
  copy: Copy["source"];
  liveUrl: string;
  kind: SourceKind;
  status: Status;
  notice?: Notice;
  playback?: PlayerProgress;
  speed: Speed;
  replays: ReplayEntry[];
  selectedReplay?: string;
  onKind: (k: SourceKind) => void;
  onBundled: (file: string) => void;
  onFile: (f: File) => void;
  onSpeed: (s: Speed) => void;
  onTogglePause: () => void;
  onRestart: () => void;
}

const KINDS: SourceKind[] = ["mock", "live", "replay"];

export function SourceControls(p: Props) {
  const uid = useId();
  const playable = p.kind !== "live";
  const finished = p.playback?.finished ?? false;

  return (
    <section className="source" aria-label={p.copy.legend}>
      <div className="source-row">
        <fieldset className="segmented">
          <legend>{p.copy.legend}</legend>
          {KINDS.map((k) => (
            <label key={k} className="segment">
              <input
                type="radio"
                name={`${uid}-kind`}
                value={k}
                checked={p.kind === k}
                onChange={() => p.onKind(k)}
              />
              <span>{p.copy.kinds[k]}</span>
            </label>
          ))}
        </fieldset>

        {p.kind === "replay" && p.replays.length > 0 && (
          <div className="field">
            <label htmlFor={`${uid}-file`}>{p.copy.replayFile}</label>
            <select
              id={`${uid}-file`}
              value={p.selectedReplay ?? ""}
              onChange={(e) => p.onBundled(e.target.value)}
            >
              {p.selectedReplay === undefined && <option value="">(dropped file)</option>}
              {p.replays.map((r) => (
                <option key={r.file} value={r.file}>
                  {r.title}
                </option>
              ))}
            </select>
          </div>
        )}

        {playable && (
          <>
            <fieldset className="segmented">
              <legend>{p.copy.speed}</legend>
              {SPEEDS.map((s) => (
                <label key={s} className="segment">
                  <input
                    type="radio"
                    name={`${uid}-speed`}
                    value={s}
                    checked={p.speed === s}
                    onChange={() => p.onSpeed(s)}
                  />
                  <span>{s}x</span>
                </label>
              ))}
            </fieldset>

            <div className="buttons">
              <button type="button" onClick={p.onTogglePause} disabled={!p.playback || finished}>
                <Icon name={p.playback?.paused ? "play" : "pause"} />
                {p.playback?.paused ? p.copy.resume : p.copy.pause}
              </button>
              <button type="button" onClick={p.onRestart}>
                <Icon name="restart" />
                {p.copy.restart}
              </button>
            </div>

            {p.playback && (
              <span className="progress">
                {p.copy.progress(p.playback.position, p.playback.total)}
                {finished ? `. ${p.copy.finished}` : ""}
              </span>
            )}
          </>
        )}
      </div>

      <p className="drop-hint">
        {p.copy.drop}{" "}
        <label className="link-button">
          {p.copy.chooseFile}
          <input
            type="file"
            className="sr-only"
            accept=".jsonl,.ndjson,.json,.txt,application/json,text/plain"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) p.onFile(f);
              e.target.value = "";
            }}
          />
        </label>
      </p>

      <div role="status" className="status-line">
        <Icon name={p.status.code === "live-down" ? "alert" : "info"} />
        <span>{p.copy.status(p.status, p.liveUrl)}</span>
      </div>
      {p.notice && (
        <p role="status" className="notice">
          <Icon name="info" />
          <span>{p.copy.notice(p.notice, p.liveUrl)}</span>
        </p>
      )}
    </section>
  );
}
