import type { SirenEvent } from "../model";

export const SPEEDS = [1, 2, 4] as const;
export type Speed = (typeof SPEEDS)[number];

/** Idle stretches longer than this are shortened so a recording never stalls. */
export const MAX_GAP_MS = 2500;

export interface PlayerProgress {
  position: number;
  total: number;
  paused: boolean;
  finished: boolean;
}

export interface Player {
  pause(): void;
  resume(): void;
  setSpeed(speed: Speed): void;
  dispose(): void;
}

/**
 * Plays events in timestamp order, spacing them by their original ts gaps
 * divided by the speed. Used by both the mock emitter and replay files.
 */
export function createPlayer(
  source: SirenEvent[],
  opts: {
    speed: Speed;
    onEvent: (e: SirenEvent) => void;
    onProgress: (p: PlayerProgress) => void;
  },
): Player {
  // Stable sort: events with equal ts keep file order.
  const events = source
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.ts - b.e.ts || a.i - b.i)
    .map((x) => x.e);

  let speed = opts.speed;
  let index = 0;
  let paused = false;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const report = () =>
    opts.onProgress({
      position: index,
      total: events.length,
      paused,
      finished: index >= events.length,
    });

  const schedule = () => {
    clearTimeout(timer);
    if (disposed || paused || index >= events.length) return;
    const gap =
      index === 0 ? 0 : Math.min(Math.max(events[index].ts - events[index - 1].ts, 0), MAX_GAP_MS);
    timer = setTimeout(tick, gap / speed);
  };

  const tick = () => {
    if (disposed || paused || index >= events.length) return;
    opts.onEvent(events[index]);
    index += 1;
    report();
    schedule();
  };

  report();
  schedule();

  return {
    pause() {
      if (paused || index >= events.length) return;
      paused = true;
      clearTimeout(timer);
      report();
    },
    resume() {
      if (!paused) return;
      paused = false;
      report();
      schedule();
    },
    setSpeed(next) {
      speed = next;
      schedule();
    },
    dispose() {
      disposed = true;
      clearTimeout(timer);
    },
  };
}
