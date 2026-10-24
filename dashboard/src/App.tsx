import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { AttackChips } from "./components/AttackChips";
import { AttackerMind } from "./components/AttackerMind";
import { FlagAlert } from "./components/FlagAlert";
import { Icon } from "./components/Icon";
import { SessionList } from "./components/SessionList";
import { SignalChecklist } from "./components/SignalChecklist";
import { SourceControls } from "./components/SourceControls";
import { Timeline } from "./components/Timeline";
import { TopBar } from "./components/TopBar";
import { COPY } from "./copy";
import type { SessionView, ViewMode } from "./model";
import { computeTotals, defaultSessionId } from "./sessions";
import { LIVE_URL } from "./sources/live";
import { useFeed } from "./useFeed";

const REPO_URL: string = import.meta.env.VITE_REPO_URL ?? "https://github.com/vvo15/maestrom";
const MODE_KEY = "maelstrom.viewMode";

function readMode(): ViewMode {
  try {
    return localStorage.getItem(MODE_KEY) === "plain" ? "plain" : "technical";
  } catch {
    return "technical";
  }
}

export default function App() {
  const [mode, setMode] = useState<ViewMode>(readMode);
  const [picked, setPicked] = useState<string>();
  const [dragging, setDragging] = useState(false);
  const feed = useFeed();
  const { loadDropped } = feed;

  const copy = COPY[mode];
  const plain = mode === "plain";

  const sessionList = useMemo(
    () => feed.sessions.order.map((id) => feed.sessions.byId[id]).filter((s): s is SessionView => !!s),
    [feed.sessions],
  );
  const totals = useMemo(() => computeTotals(feed.sessions), [feed.sessions]);

  // Until the user picks a session, follow the newest flagged one.
  const selectedId =
    picked && feed.sessions.byId[picked] ? picked : defaultSessionId(feed.sessions);
  const selected = selectedId ? feed.sessions.byId[selectedId] : undefined;

  const toggleMode = () => {
    const next: ViewMode = plain ? "technical" : "plain";
    setMode(next);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      // Storage can be unavailable (private mode); the toggle still works.
    }
  };

  // Accept a dropped .jsonl file anywhere on the page.
  useEffect(() => {
    const over = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      e.preventDefault();
      setDragging(true);
    };
    const leave = (e: DragEvent) => {
      if (e.relatedTarget === null) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) void loadDropped(file);
    };
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, [loadDropped]);

  return (
    <>
      <a className="skip-link" href="#timeline">
        {copy.skipLink}
      </a>

      <header className="app-header">
        <div className="brand">
          <h1>Maelstrom</h1>
          <p>{copy.tagline}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={plain}
          className="toggle"
          onClick={toggleMode}
        >
          <span className="toggle-track" aria-hidden="true">
            <span className="toggle-thumb" />
          </span>
          <span>
            <span className="toggle-label">Town IT view: {plain ? "on" : "off"}</span>
            <span className="toggle-hint">{copy.viewToggleHint}</span>
          </span>
        </button>
      </header>

      <main className="app-main">
        <SourceControls
          copy={copy.source}
          liveUrl={LIVE_URL}
          kind={feed.kind}
          status={feed.status}
          notice={feed.notice}
          playback={feed.playback}
          speed={feed.speed}
          replays={feed.replays}
          selectedReplay={feed.selectedReplay}
          onKind={feed.selectKind}
          onBundled={feed.selectBundled}
          onFile={(f) => void feed.loadDropped(f)}
          onSpeed={feed.setSpeed}
          onTogglePause={feed.togglePause}
          onRestart={feed.restart}
        />

        {feed.kind === "replay" && (
          <p className="banner">
            <Icon name="info" />
            <span>
              {copy.source.banner}{" "}
              <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
                {copy.source.bannerLink}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </span>
          </p>
        )}

        <TopBar copy={copy.metrics} totals={totals} />

        <div className="grid">
          <div className="col col-sessions">
            <SessionList
              copy={copy.sessions}
              sessions={sessionList}
              selectedId={selectedId}
              onSelect={setPicked}
            />
          </div>
          <div className="col col-main">
            <FlagAlert copy={copy.alert} session={selected} />
            <Timeline copy={copy.timeline} mode={mode} session={selected} />
          </div>
          <div className="col col-side">
            <SignalChecklist copy={copy.signals} session={selected} />
            <AttackerMind copy={copy.mind} session={selected} />
            <AttackChips copy={copy.attack} mode={mode} session={selected} />
          </div>
        </div>
      </main>

      {dragging && (
        <div className="drop-overlay" aria-hidden="true">
          <Icon name="play" /> {copy.source.drop} {copy.source.chooseFile}
        </div>
      )}
    </>
  );
}
