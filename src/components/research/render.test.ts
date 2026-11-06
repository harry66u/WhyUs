import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ResearchEvent, StoredResearchEvent } from "@/lib/types";
import { CounterStrip } from "./counters";
import { DossierForming } from "./dossier-forming";
import { LiveLog } from "./live-log";
import { StageTrack } from "./stage-track";
import { initResearchState, researchReducer, type RunMeta } from "./state";
import type { FinalDossierView } from "./types";

/** Server-rendered HTML without React's text separators. */
const render = (el: Parameters<typeof renderToString>[0]) => renderToString(el).replace(/<!-- -->/g, "");

const RUN: RunMeta = { id: "run-1", status: "running", startedAt: "2026-11-05T15:00:00.000Z", finishedAt: null, error: null };

function stateFrom(events: ResearchEvent[], live = true) {
  const stored: StoredResearchEvent[] = events.map((event, i) => ({ seq: i + 1, runId: "run-1", ts: new Date(Date.parse(RUN.startedAt) + i * 1500).toISOString(), event }));
  let state = initResearchState(RUN);
  if (live) state = researchReducer(state, { type: "replayed" });
  return researchReducer(state, { type: "events", events: stored });
}

const EVENTS: ResearchEvent[] = [
  { type: "stage", stage: "scope", status: "start" },
  { type: "stage", stage: "scope", status: "done", detail: "Scoped to School of Engineering, plus opportunities open to all Example undergraduates." },
  { type: "stage", stage: "discover", status: "start" },
  { type: "stage", stage: "discover", status: "done", detail: "12 facts in the Example research base apply to School of Engineering, from 10 official pages." },
  { type: "stage", stage: "read", status: "start" },
  { type: "page", url: "https://engineering.example.edu/labs/river", status: "reading" },
  { type: "page", url: "https://arts.example.edu/programs/interpreting", status: "reading" },
  { type: "page", url: "https://engineering.example.edu/labs/river", status: "read", title: "River Sensing Lab", ms: 840 },
  { type: "page", url: "https://arts.example.edu/programs/interpreting", status: "blocked", reason: "answered with a bot challenge; skipped" },
  { type: "stage", stage: "verify", status: "start" },
  { type: "fact", factId: "f1", title: "River Sensing Lab", kind: "lab", url: "https://engineering.example.edu/labs/river", status: "verified", quote: "Undergraduates build and deploy water sensors.", commonness: "rare" },
  { type: "fact", factId: "f2", title: "Community Interpreting Program", kind: "program", url: "https://arts.example.edu/programs/interpreting", status: "rejected", reason: "could not be checked: arts.example.edu answered with a bot challenge" },
  { type: "stage", stage: "read", status: "done", detail: "Read 1 official page; 1 could not be read." },
  { type: "stage", stage: "verify", status: "done", detail: "1 fact confirmed on current pages; 1 rejected." },
  { type: "stage", stage: "match", status: "start" },
  { type: "match", factId: "f1", title: "River Sensing Lab", activityTitle: "Creek Sensor Project", score: 0.9, sentence: "Builds on the creek sensor project." },
  { type: "swap", factId: "f1", title: "River Sensing Lab", results: [{ schoolId: "second", schoolName: "Second", status: "none" }] },
  { type: "angle", line: "Sensing water, from a creek to a river lab.", isLead: true },
];

describe("live research view rendering", () => {
  it("renders the log with host chips, plain blocked reasons, and quote toggles", () => {
    const state = stateFrom(EVENTS);
    const html = render(createElement(LiveLog, { entries: state.entries, startedAt: RUN.startedAt, connection: "live", runStatus: "running", schoolShortName: "Example" }));
    expect(html).toContain("arts.example.edu answered with a bot challenge; skipped");
    expect(html).toContain("engineering.example.edu");
    expect(html).toContain("Show the quote found on the page");
    expect(html).toContain("Undergraduates build and deploy water sensors.");
    expect(html).toContain("Swap test for");
    expect(html).toContain("No equivalent at Second.");
    expect(html).toContain("00:01");
    expect(html).toContain("Live");
  });

  it("renders the stage track and counters", () => {
    const state = stateFrom(EVENTS);
    const track = render(createElement(StageTrack, { stages: state.stages }));
    expect(track).toContain("Scope the prompt");
    expect(track).toContain("Assemble dossier");
    expect(track).toContain('aria-current="step"');
    const counters = render(createElement(CounterStrip, { counters: state.counters }));
    for (const label of ["Pages read", "Pages blocked", "Facts verified", "Facts rejected", "Matches"]) expect(counters).toContain(label);
  });

  it("renders the forming dossier, then the final ranking with sources and dates", () => {
    const state = stateFrom(EVENTS);
    const forming = render(createElement(DossierForming, { state, final: null, running: true }));
    expect(forming).toContain("Dossier forming");
    expect(forming).toContain("River Sensing Lab");
    expect(forming).toContain("Fits Creek Sensor Project");
    expect(forming).toContain("Estimated uniqueness");
    expect(forming).toContain("Sensing water, from a creek to a river lab.");

    const final: FinalDossierView = {
      dossierId: "d1",
      uniquenessScore: 74,
      generatedAt: RUN.startedAt,
      details: [
        {
          factId: "f1",
          rank: 1,
          kind: "lab",
          title: "River Sensing Lab",
          sentence: "Builds on the creek sensor project.",
          uniqueness: { score: 86, label: "Distinctive", commonlyMentioned: false },
          swap: [{ schoolId: "second", schoolName: "Second", status: "none" }],
          sourceUrl: "https://engineering.example.edu/labs/river",
          verifiedAt: "2026-11-05",
        },
      ],
      angles: [{ line: "Sensing water, from a creek to a river lab.", isLead: true }],
    };
    const settled = render(createElement(DossierForming, { state, final, running: false }));
    expect(settled).toContain("Final ranking");
    expect(settled).toContain("Distinctive");
    expect(settled).toContain("Verified Nov 5, 2026");
    expect(settled).toContain("engineering.example.edu/labs/river");
  });

  it("renders an empty log and dossier before any events", () => {
    const state = initResearchState(null);
    expect(render(createElement(LiveLog, { entries: [], startedAt: undefined, connection: "idle", runStatus: null, schoolShortName: "Example" }))).toContain("Starting research");
    expect(render(createElement(DossierForming, { state, final: null, running: true }))).toContain("Matched details appear here");
  });
});
