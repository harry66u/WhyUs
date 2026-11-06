/**
 * Replay timing and state for the landing demo. Pure and isomorphic.
 *
 * The demo replays research events through the live research view's own
 * reducer (src/components/research/state.ts), so stages, counters, the log,
 * and announcements behave exactly as they do while a real run streams.
 */
import { initResearchState, researchReducer, type ResearchViewState, type RunMeta } from "@/components/research/state";
import type { ResearchEvent, StoredResearchEvent } from "@/lib/types";

export const DEMO_RUN_ID = "landing-demo";

/** Fixed origin for event timestamps (offsets are never shown, so any constant works). */
const ORIGIN = Date.UTC(2026, 0, 1);

/** How long the final state stays on screen before the replay starts over. */
export const HOLD_MS = 9000;

/** Cross-fade between the end of one replay and the start of the next. */
export const FADE_MS = 450;

/**
 * Pause before each event appears, in milliseconds. Reading-heavy lines (fit
 * sentences, angles) get longer; verification ticks are quick. A full replay
 * runs about half a minute; a live run takes up to about two.
 */
export function replayDelay(event: ResearchEvent): number {
  switch (event.type) {
    case "stage":
      return event.status === "start" ? 560 : 360;
    case "log":
      return 620;
    case "page":
      return event.status === "reading" ? 240 : 480;
    case "fact":
      return 280;
    case "match":
      return 820;
    case "swap":
      return 440;
    case "angle":
      return 900;
    case "done":
      return 620;
    case "error":
      return 400;
  }
}

/** A pass never runs longer than this; longer runs are replayed proportionally faster. */
export const REPLAY_BUDGET_MS = 27_000;

/** No event follows the previous one faster than this. */
const MIN_DELAY_MS = 140;

/** The pause before each event, scaled to fit the replay budget. */
export function replaySchedule(events: ResearchEvent[]): number[] {
  const raw = events.map(replayDelay);
  const sum = raw.reduce((a, b) => a + b, 0);
  const k = sum > REPLAY_BUDGET_MS ? REPLAY_BUDGET_MS / sum : 1;
  return raw.map((ms) => Math.max(MIN_DELAY_MS, Math.round(ms * k)));
}

/** Events with the sequence numbers and timestamps the live view's reducer expects. */
export function toStoredEvents(events: ResearchEvent[]): StoredResearchEvent[] {
  const schedule = replaySchedule(events);
  let t = ORIGIN;
  return events.map((event, i) => {
    t += schedule[i];
    return { seq: i + 1, runId: DEMO_RUN_ID, ts: new Date(t).toISOString(), event };
  });
}

/** Total replay length, from the first event to the last. */
export function replayDuration(events: ResearchEvent[]): number {
  return replaySchedule(events).reduce((a, b) => a + b, 0);
}

const RUN: RunMeta = { id: DEMO_RUN_ID, status: "running", startedAt: new Date(ORIGIN).toISOString(), finishedAt: null, error: null };

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(Number.isFinite(n) ? n : 0)));
}

/**
 * The live view's state after the first `count` events. Events before
 * `liveFrom` are applied as an instant replay (no entrance animation, no
 * announcements); later ones as live events.
 */
export function replayState(stored: StoredResearchEvent[], count: number, liveFrom: number): ResearchViewState {
  const n = clamp(count, 0, stored.length);
  const live = clamp(liveFrom, 0, n);
  let state = initResearchState(RUN);
  if (live > 0) state = researchReducer(state, { type: "events", events: stored.slice(0, live) });
  state = researchReducer(state, { type: "replayed" });
  if (n > live) state = researchReducer(state, { type: "events", events: stored.slice(live, n) });
  return state;
}

/**
 * How many events the page shows before the replay starts (the server render
 * and first paint): the first stage, finished, and the second one starting.
 */
export function initialCount(events: ResearchEvent[]): number {
  const scoped = events.findIndex((e) => e.type === "stage" && e.stage === "scope" && e.status === "done");
  if (scoped === -1) return 0;
  const next = events[scoped + 1];
  return next && next.type === "stage" && next.status === "start" ? scoped + 2 : scoped + 1;
}
