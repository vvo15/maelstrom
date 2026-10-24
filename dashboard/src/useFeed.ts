import { useCallback, useEffect, useReducer, useRef, useState, type Dispatch } from "react";
import type { Notice, Status } from "./copy";
import type { SirenEvent } from "./model";
import { initialSessions, sessionsReducer, type SessionsAction } from "./sessions";
import { connectLive, LIVE_URL } from "./sources/live";
import { buildMockEvents } from "./sources/mock";
import { createPlayer, type Player, type PlayerProgress, type Speed } from "./sources/player";
import { loadReplayFile, loadReplayIndex, type ReplayEntry } from "./sources/replays";
import { parseJsonl } from "./sources/validate";

export type SourceKind = "mock" | "live" | "replay";

/** On first load, give the live gateway this long before falling back to a replay. */
export const LIVE_TIMEOUT_MS = 2000;
const FLUSH_MS = 50;

type ReplayChoice =
  | { kind: "bundled"; file: string }
  | { kind: "dropped"; name: string; events: SirenEvent[] };

/**
 * Collects events, drops duplicates (the gateway replays its last 500 events
 * on every connect) and hands them to the reducer in small batches.
 */
function createSink(dispatch: Dispatch<SessionsAction>) {
  const seen = new Set<string>();
  let pending: SirenEvent[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = () => {
    timer = undefined;
    if (pending.length === 0) return;
    const events = pending;
    pending = [];
    dispatch({ type: "events", events });
  };

  return {
    push(e: SirenEvent) {
      const key = `${e.session_id}|${e.ts}|${e.method}|${e.path}`;
      if (seen.has(key)) return;
      seen.add(key);
      pending.push(e);
      timer ??= setTimeout(flush, FLUSH_MS);
    },
    dispose() {
      clearTimeout(timer);
      pending = [];
    },
  };
}

export function useFeed() {
  const [sessions, dispatch] = useReducer(sessionsReducer, initialSessions);
  const [kind, setKind] = useState<SourceKind>("live");
  const [choice, setChoice] = useState<ReplayChoice>();
  const [replays, setReplays] = useState<ReplayEntry[] | null>(null);
  const [speed, setSpeedState] = useState<Speed>(1);
  const [runId, setRunId] = useState(0);
  const [status, setStatus] = useState<Status>({ code: "live-connecting" });
  const [notice, setNotice] = useState<Notice>();
  const [playback, setPlayback] = useState<PlayerProgress>();

  const playerRef = useRef<Player | undefined>(undefined);
  const speedRef = useRef<Speed>(1);
  // Only the very first live attempt may fall back automatically.
  const firstAttempt = useRef(true);

  // The list of bundled recordings.
  useEffect(() => {
    const ac = new AbortController();
    void loadReplayIndex(ac.signal).then((list) => {
      if (!ac.signal.aborted) setReplays(list);
    });
    return () => ac.abort();
  }, []);

  // Live source.
  useEffect(() => {
    if (kind !== "live") return;
    const sink = createSink(dispatch);
    dispatch({ type: "reset" });
    setPlayback(undefined);
    setStatus({ code: "live-connecting" });

    let opened = false;
    let fallbackTimer: ReturnType<typeof setTimeout> | undefined;

    const stop = connectLive(LIVE_URL, {
      onEvent: sink.push,
      onOpen: () => {
        opened = true;
        firstAttempt.current = false;
        clearTimeout(fallbackTimer);
        setStatus({ code: "live-open" });
      },
      onDown: () => setStatus({ code: "live-down" }),
    });

    if (firstAttempt.current) {
      fallbackTimer = setTimeout(() => {
        if (opened) return;
        firstAttempt.current = false;
        setNotice({ code: "fell-back" });
        setKind("replay");
      }, LIVE_TIMEOUT_MS);
    }

    return () => {
      clearTimeout(fallbackTimer);
      stop();
      sink.dispose();
    };
  }, [kind, runId]);

  // Mock and replay sources: both play a list of events through the same player.
  useEffect(() => {
    if (kind === "live") return;
    const ac = new AbortController();
    const sink = createSink(dispatch);
    let player: Player | undefined;

    const start = (events: SirenEvent[]) => {
      player = createPlayer(events, {
        speed: speedRef.current,
        onEvent: sink.push,
        onProgress: setPlayback,
      });
      playerRef.current = player;
    };

    dispatch({ type: "reset" });
    setPlayback(undefined);

    if (kind === "mock") {
      setStatus({ code: "mock" });
      start(buildMockEvents(Date.now()));
    } else if (choice?.kind === "dropped") {
      setStatus({ code: "replay", title: choice.name });
      start(choice.events);
    } else if (replays === null) {
      setStatus({ code: "replay-loading" });
    } else {
      const entry = choice ? replays.find((r) => r.file === choice.file) : replays[0];
      if (!entry) {
        setNotice({ code: "no-replays" });
        setKind("mock");
      } else {
        setStatus({ code: "replay-loading" });
        void loadReplayFile(entry.file, ac.signal).then((parsed) => {
          if (ac.signal.aborted) return;
          if (!parsed) {
            setNotice({ code: "load-failed" });
            setKind("mock");
            return;
          }
          setStatus({ code: "replay", title: entry.title });
          start(parsed.events);
        });
      }
    }

    return () => {
      ac.abort();
      player?.dispose();
      if (playerRef.current === player) playerRef.current = undefined;
      sink.dispose();
    };
  }, [kind, choice, replays, runId]);

  const selectKind = useCallback((next: SourceKind) => {
    firstAttempt.current = false;
    setNotice(undefined);
    setKind(next);
  }, []);

  const selectBundled = useCallback((file: string) => {
    firstAttempt.current = false;
    setNotice(undefined);
    setChoice({ kind: "bundled", file });
    setKind("replay");
  }, []);

  const loadDropped = useCallback(async (file: File) => {
    const parsed = parseJsonl(await file.text());
    if (parsed.events.length === 0) {
      setNotice({ code: "drop-empty", name: file.name });
      return;
    }
    firstAttempt.current = false;
    setNotice({ code: "dropped", name: file.name, count: parsed.events.length, skipped: parsed.skipped });
    setChoice({ kind: "dropped", name: file.name, events: parsed.events });
    setKind("replay");
  }, []);

  const setSpeed = useCallback((next: Speed) => {
    speedRef.current = next;
    setSpeedState(next);
    playerRef.current?.setSpeed(next);
  }, []);

  const togglePause = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    if (playback?.paused) player.resume();
    else player.pause();
  }, [playback?.paused]);

  const restart = useCallback(() => setRunId((n) => n + 1), []);

  const selectedReplay =
    choice?.kind === "bundled" ? choice.file : choice?.kind === "dropped" ? undefined : replays?.[0]?.file;

  return {
    sessions,
    kind,
    status,
    notice,
    playback,
    speed,
    replays: replays ?? [],
    selectedReplay,
    selectKind,
    selectBundled,
    loadDropped,
    setSpeed,
    togglePause,
    restart,
  };
}
