import { describe, expect, it } from "vitest";
import type { ResearchEvent, StoredResearchEvent } from "@/lib/types";
import { formingItems, initResearchState, offsetLabel, provisionalUniqueness, researchReducer, swapSummary, type RunMeta } from "./state";

const RUN: RunMeta = { id: "run-1", status: "running", startedAt: "2026-11-05T15:00:00.000Z", finishedAt: null, error: null };
let seq = 0;
function ev(event: ResearchEvent, at = seq): StoredResearchEvent {
  seq++;
  return { seq, runId: "run-1", ts: new Date(Date.parse(RUN.startedAt) + at * 1000).toISOString(), event };
}

describe("live research state", () => {
  it("merges page events by URL, counts, and ignores replays of events already applied", () => {
    seq = 0;
    let state = initResearchState(RUN);
    const batch = [
      ev({ type: "stage", stage: "read", status: "start" }),
      ev({ type: "page", url: "https://lsa.example.edu/a", status: "reading" }),
      ev({ type: "page", url: "https://www.example.edu/b", status: "reading" }),
      ev({ type: "page", url: "https://lsa.example.edu/a", status: "blocked", reason: "answered with a bot challenge; skipped" }),
      ev({ type: "page", url: "https://www.example.edu/b", status: "read", title: "B", ms: 800 }),
      ev({ type: "fact", factId: "f1", title: "River Lab", kind: "lab", url: "https://www.example.edu/b", status: "verified", quote: "Q", commonness: "rare" }),
      ev({ type: "fact", factId: "f2", title: "Old Course", kind: "course", url: "https://www.example.edu/b", status: "rejected", reason: "the quoted text is no longer on the page" }),
    ];
    state = researchReducer(state, { type: "events", events: batch });
    // Replaying the same events (a reconnect) changes nothing.
    const again = researchReducer(state, { type: "events", events: batch });
    expect(again).toBe(state);

    const pages = state.entries.filter((e) => e.kind === "page");
    expect(pages).toHaveLength(2);
    expect(pages[0]).toMatchObject({ host: "lsa.example.edu", status: "blocked", reason: "answered with a bot challenge; skipped" });
    expect(pages[1]).toMatchObject({ host: "example.edu", path: "/b", status: "read", title: "B" });
    expect(state.counters).toEqual({ pagesRead: 1, pagesBlocked: 1, factsVerified: 1, factsRejected: 1, matches: 0 });
    expect(state.stages.find((s) => s.stage === "read")?.status).toBe("active");
    expect(state.entries.every((e) => e.live === false)).toBe(true); // initial replay: no entrance animation
  });

  it("re-ranks matched details by fit and estimates uniqueness from commonness and the swap test", () => {
    seq = 0;
    let state = researchReducer(initResearchState(RUN), { type: "replayed" });
    state = researchReducer(state, {
      type: "events",
      events: [
        ev({ type: "fact", factId: "a", title: "A", kind: "lab", url: "https://www.example.edu/a", status: "verified", commonness: "rare" }),
        ev({ type: "fact", factId: "b", title: "B", kind: "program", url: "https://www.example.edu/b", status: "verified", commonness: "common" }),
        ev({ type: "match", factId: "b", title: "B", score: 0.4, sentence: "Fits B." }),
        ev({ type: "match", factId: "a", title: "A", activityTitle: "Creek Sensor Project", score: 0.9, sentence: "Fits A." }),
        ev({
          type: "swap",
          factId: "a",
          title: "A",
          results: [
            { schoolId: "s", schoolName: "Second", status: "none" },
            { schoolId: "t", schoolName: "Third", status: "unknown" },
          ],
        }),
        ev({ type: "stage", stage: "match", status: "done", detail: "2 verified facts matched to the activity list." }),
      ],
    });
    const items = formingItems(state);
    expect(items.map((i) => i.factId)).toEqual(["a", "b"]);
    expect(items[0].uniqueness).toBeGreaterThan(items[1].uniqueness);
    expect(state.counters.matches).toBe(2);
    expect(state.entries.every((e) => e.live)).toBe(true);
    expect(state.announcement).toBe("Match to profile done. 2 verified facts matched to the activity list.");
  });

  it("marks the active stage stopped on an error and keeps the message", () => {
    seq = 0;
    let state = researchReducer(initResearchState(RUN), { type: "replayed" });
    state = researchReducer(state, {
      type: "events",
      events: [ev({ type: "stage", stage: "verify", status: "start" }), ev({ type: "error", message: "Only 1 fact could be confirmed." })],
    });
    expect(state.error).toBe("Only 1 fact could be confirmed.");
    expect(state.stages.find((s) => s.stage === "verify")?.status).toBe("failed");
    state = researchReducer(state, { type: "ended", status: "failed", error: "Only 1 fact could be confirmed." });
    expect(state.ended).toBe(true);
    expect(state.run?.status).toBe("failed");
  });

  it("completes every stage on done", () => {
    seq = 0;
    const state = researchReducer(initResearchState(RUN), { type: "events", events: [ev({ type: "done", dossierId: "d1", uniquenessScore: 74 })] });
    expect(state.done).toEqual({ dossierId: "d1", uniquenessScore: 74 });
    expect(state.stages.every((s) => s.status === "done")).toBe(true);
  });

  it("formats offsets, swap summaries, and provisional scores", () => {
    expect(offsetLabel(RUN.startedAt, "2026-11-05T15:01:12.400Z")).toBe("01:12");
    expect(
      swapSummary([
        { schoolId: "a", schoolName: "Second", status: "none" },
        { schoolId: "b", schoolName: "Third", status: "none" },
        { schoolId: "c", schoolName: "Fourth", status: "similar" },
      ]),
    ).toBe("No equivalent at Second and Third; similar at Fourth.");
    expect(provisionalUniqueness("rare", [{ schoolId: "a", schoolName: "A", status: "none" }])).toBeGreaterThanOrEqual(70);
    expect(provisionalUniqueness("common", [{ schoolId: "a", schoolName: "A", status: "equivalent" }])).toBeLessThan(45);
  });
});
