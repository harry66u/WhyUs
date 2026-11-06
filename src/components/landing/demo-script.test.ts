import { describe, expect, it } from "vitest";
import type { ResearchEvent } from "@/lib/types";
import { REPLAY_BUDGET_MS, initialCount, replayDelay, replayDuration, replaySchedule, replayState, toStoredEvents } from "./demo-script";

const EVENTS: ResearchEvent[] = [
  { type: "stage", stage: "scope", status: "start" },
  { type: "stage", stage: "scope", status: "done", detail: "Scoped to the School of Engineering, plus opportunities open to all Example undergraduates." },
  { type: "stage", stage: "discover", status: "start" },
  { type: "stage", stage: "discover", status: "done", detail: "3 facts in the Example research base apply to the School of Engineering, from 2 official pages." },
  { type: "stage", stage: "read", status: "start" },
  { type: "page", url: "https://www.example.edu/lab", status: "reading" },
  { type: "page", url: "https://www.example.edu/lab", title: "Lab", status: "read" },
  { type: "stage", stage: "verify", status: "start" },
  { type: "fact", factId: "f1", title: "Example Lab", kind: "lab", url: "https://www.example.edu/lab", status: "verified", quote: "Students build sensors." },
  { type: "stage", stage: "read", status: "done", detail: "Read 1 official page." },
  { type: "stage", stage: "verify", status: "done", detail: "1 fact confirmed on current pages." },
  { type: "stage", stage: "match", status: "start" },
  { type: "match", factId: "f1", title: "Example Lab", activityTitle: "Creek Watch Sensor Network", score: 0.9, sentence: "Builds on the creek sensors." },
  { type: "stage", stage: "match", status: "done" },
  { type: "stage", stage: "swap", status: "start" },
  { type: "swap", factId: "f1", title: "Example Lab", results: [{ schoolId: "other", schoolName: "Other", status: "none" }] },
  { type: "stage", stage: "swap", status: "done" },
  { type: "stage", stage: "assemble", status: "start" },
  { type: "angle", line: "From a creek you instrumented to a lab that does it at scale.", isLead: true },
  { type: "stage", stage: "assemble", status: "done" },
  { type: "done", dossierId: "d1", uniquenessScore: 80 },
];

describe("replay timing", () => {
  it("gives reading-heavy lines more time than quick ticks", () => {
    const match = replayDelay({ type: "match", factId: "f", title: "t", score: 1, sentence: "s" });
    const fact = replayDelay({ type: "fact", factId: "f", title: "t", kind: "lab", url: "https://www.example.edu/", status: "verified" });
    expect(match).toBeGreaterThan(fact);
  });

  it("fits long runs into the budget without dropping below a readable pace", () => {
    const long: ResearchEvent[] = Array.from({ length: 200 }, (_, i) => ({ type: "match", factId: `f${i}`, title: "t", score: 1, sentence: "s" }));
    const schedule = replaySchedule(long);
    expect(schedule).toHaveLength(200);
    expect(schedule.every((ms) => ms >= 140)).toBe(true);
    expect(replayDuration(long)).toBeLessThanOrEqual(Math.max(REPLAY_BUDGET_MS, 200 * 140));
    // Short runs keep their natural pace.
    expect(replaySchedule(EVENTS)).toEqual(EVENTS.map(replayDelay));
  });

  it("stores events in order with increasing timestamps", () => {
    const stored = toStoredEvents(EVENTS);
    expect(stored.map((s) => s.seq)).toEqual(EVENTS.map((_, i) => i + 1));
    for (let i = 1; i < stored.length; i++) expect(Date.parse(stored[i].ts)).toBeGreaterThan(Date.parse(stored[i - 1].ts));
  });
});

describe("replay state", () => {
  it("starts the page on the first stage done and the second starting", () => {
    expect(initialCount(EVENTS)).toBe(3);
    const state = replayState(toStoredEvents(EVENTS), initialCount(EVENTS), initialCount(EVENTS));
    expect(state.stages.map((s) => s.status).slice(0, 3)).toEqual(["done", "active", "pending"]);
    // An instant replay announces nothing and animates nothing.
    expect(state.announcement).toBe("");
    expect(state.entries.every((e) => !e.live)).toBe(true);
  });

  it("announces and animates what arrives after the replay goes live", () => {
    const stored = toStoredEvents(EVENTS);
    const state = replayState(stored, 7, 3);
    expect(state.entries.filter((e) => e.live).length).toBeGreaterThan(0);
    expect(state.announcement).not.toBe("");
    // The page line moved from reading to read in place.
    const pages = state.entries.filter((e) => e.kind === "page");
    expect(pages).toHaveLength(1);
    expect(pages[0].kind === "page" && pages[0].status).toBe("read");
  });

  it("ends finished: every stage done, the score in, the lead angle set", () => {
    const stored = toStoredEvents(EVENTS);
    const state = replayState(stored, stored.length, stored.length);
    expect(state.done).toEqual({ dossierId: "d1", uniquenessScore: 80 });
    expect(state.stages.every((s) => s.status === "done")).toBe(true);
    expect(state.angles.find((a) => a.isLead)?.line).toContain("creek");
    expect(state.counters).toEqual({ pagesRead: 1, pagesBlocked: 0, factsVerified: 1, factsRejected: 0, matches: 1 });
  });

  it("clamps out-of-range counts", () => {
    const stored = toStoredEvents(EVENTS);
    expect(replayState(stored, 999, -4).done).not.toBeNull();
    expect(replayState(stored, -1, 0).entries).toHaveLength(0);
  });
});
