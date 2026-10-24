/**
 * Unit tests for the pure per-request session update.
 *
 * **Validates: Requirements 2.2, 4.6, 5.2, 5.3, 5.4, 6.4, 10.1**
 */
import { describe, expect, it } from "vitest";
import type { SirenEvent } from "../../../shared/events";
import type { Signal } from "../types";
import type { RequestMeta } from "./signals";
import { updateSession } from "./sessionUpdate";

const UA = "python-httpx/0.27.0";
const req = (path: string, ts = 1_700_000_000_000): RequestMeta => ({
  method: "GET",
  path,
  url: path,
  body: "",
  userAgent: UA,
  headerValues: [UA],
  ts,
});

describe("updateSession", () => {
  it("first-flagging request: route decoy, post-scoring flagged true", () => {
    const u = updateSession(
      { signals: new Set<Signal>(["scripted_ua"]), flagged: false },
      [],
      req("/verify"),
    );
    expect(u).toEqual({
      flaggedBeforeScoring: false,
      route: "decoy",
      newSignals: ["bait_followed", "scripted_ua"],
      signals: new Set<Signal>(["bait_followed", "scripted_ua"]),
      aiScore: 70,
      flagged: true,
    });
  });

  it("already-flagged session routes to maze and stays flagged", () => {
    const u = updateSession({ signals: new Set(), flagged: true }, [], req("/pages/a"));
    expect(u.route).toBe("maze");
    expect(u.flaggedBeforeScoring).toBe(true);
    expect(u.flagged).toBe(true);
  });

  it("does not mutate its inputs and returns a fresh signals Set", () => {
    const prevSignals = new Set<Signal>(["scripted_ua"]);
    const prev = { signals: prevSignals, flagged: false };
    const history: SirenEvent[] = [];
    const current = req("/verify");
    const snapshot = JSON.stringify(current);
    const u = updateSession(prev, history, current);
    expect(u.signals).not.toBe(prevSignals);
    expect(prevSignals).toEqual(new Set<Signal>(["scripted_ua"]));
    expect(prev.flagged).toBe(false);
    expect(history).toEqual([]);
    expect(JSON.stringify(current)).toBe(snapshot);
  });
});
