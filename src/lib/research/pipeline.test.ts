import { describe, expect, it } from "vitest";
import { EXAMPLE_DOSSIER } from "@/lib/fixtures/example-dossier";
import type { Dossier, Fact, ResearchEvent, VerificationResult } from "@/lib/types";
import { CLAUDE_FETCH_NOTE } from "./claude-fetch";
import {
  diversityOrder,
  NO_RESEARCH_BASE_MESSAGE,
  ResearchError,
  resolveScope,
  runResearchPipeline,
  type PipelineApplication,
  type PipelineDeps,
} from "./pipeline";
import { isoDate } from "./term";
import {
  EXAMPLE_SCHOOL,
  fakeEngine,
  makeFact,
  pageTextFor,
  SECOND_SCHOOL,
  STUDENT,
  StubPageSource,
  type StubPage,
} from "./testing/example-school";

const APP: PipelineApplication = {
  id: "app-example",
  studentId: STUDENT.id,
  schoolId: "example",
  unitId: "engineering",
  promptId: "example-why",
  promptText: "Why Example University?",
  wordLimit: 200,
};
const OTHER_APP: PipelineApplication = { ...APP, id: "app-second", schoolId: "second", unitId: "college" };

const lab = makeFact({ id: "example:lab", kind: "lab", title: "River Sensing Lab", sourceUrl: "https://engineering.example.edu/labs/river", quote: "Undergraduates in the River Sensing Lab build and deploy low-cost water sensors.", unitIds: ["engineering"] });
const shop = makeFact({ id: "example:shop", kind: "facility", title: "Sensor Prototyping Shop", sourceUrl: "https://engineering.example.edu/labs/river", quote: "The Sensor Prototyping Shop is open to all engineering students." });
const course41 = makeFact({ id: "example:engr-41", kind: "course", title: "ENGR 41: Watershed Systems", nameOnPage: "ENGR 41", sourceUrl: "https://catalog.example.edu/courses/engr-41", quote: "ENGR 41 examines how rainfall and land use shape the water that reaches a stream." });
const course12 = makeFact({ id: "example:engr-12", kind: "course", title: "ENGR 12: Design Studio", nameOnPage: "ENGR 12", sourceUrl: "https://catalog.example.edu/courses/engr-12", quote: "ENGR 12 asks first-year students to design, build, and test a working device." });
const courseGone = makeFact({ id: "example:engr-55", kind: "course", title: "ENGR 55: Retired Course", nameOnPage: "ENGR 55", sourceUrl: "https://catalog.example.edu/courses/engr-55", quote: "ENGR 55 covers a topic that is no longer offered by the department." });
const courseChanged = makeFact({ id: "example:envs-30", kind: "course", title: "ENVS 30: Urban Heat", nameOnPage: "ENVS 30", sourceUrl: "https://catalog.example.edu/courses/envs-30", quote: "ENVS 30 maps summer heat across neighborhoods with student-built loggers." });
const center = makeFact({ id: "example:civic", kind: "center", title: "Civic Data Center", sourceUrl: "https://www.example.edu/centers/civic-data", quote: "The Civic Data Center helps students publish open data for local governments." });
const jazz = makeFact({ id: "example:jazz", kind: "organization", title: "Jazz Combo Collective", sourceUrl: "https://www.example.edu/clubs/jazz", quote: "The Jazz Combo Collective rehearses weekly and performs student arrangements.", themes: ["jazz"] });
const interpreting = makeFact({ id: "example:interp", kind: "program", title: "Community Interpreting Program", sourceUrl: "https://arts.example.edu/programs/interpreting", quote: "Students in the Community Interpreting Program interpret at local health clinics." });
const tradition = makeFact({ id: "example:river-day", kind: "tradition", title: "River Day", sourceUrl: "https://www.example.edu/traditions/river-day", quote: "Every spring, River Day sends students to clean up the banks of the Example River." });
const place = makeFact({ id: "example:partners", kind: "location", title: "Watershed Partners", sourceUrl: "https://www.example.edu/place/watershed-partners", quote: "Watershed Partners connects students with conservation groups along the Example River." });
const major = makeFact({ id: "example:major", kind: "major", title: "Environmental Engineering", sourceUrl: "https://catalog.example.edu/majors/environmental-engineering", quote: "The Environmental Engineering major prepares students to design water and air systems." });
const artsOnly = makeFact({ id: "example:arts-only", kind: "course", title: "ARTS 10: Drawing", nameOnPage: "ARTS 10", sourceUrl: "https://arts.example.edu/courses/arts-10", quote: "ARTS 10 introduces observational drawing in the studio.", unitIds: ["arts"] });

const EXAMPLE_FACTS: Fact[] = [lab, shop, course41, course12, courseGone, courseChanged, center, jazz, interpreting, tradition, place, major, artsOnly];

const SECOND_FACTS: Fact[] = [
  makeFact({ id: "second:lab", kind: "lab", title: "Second Water Lab", sourceUrl: "https://www.second.example/labs/water", quote: "The Second Water Lab studies drinking water systems with undergraduates.", verifiedAt: isoDate() }, "second"),
  makeFact({ id: "second:stale", kind: "course", title: "SEC 1: Old Course", sourceUrl: "https://www.second.example/courses/1", quote: "SEC 1 is a course that was verified a long time ago.", verifiedAt: "2020-01-15" }, "second"),
];

function basePages(): Record<string, StubPage> {
  const cachedAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  return {
    "https://engineering.example.edu/labs/river": { text: pageTextFor(lab, shop), title: "River Sensing Lab" },
    "https://catalog.example.edu/courses/engr-41": { text: pageTextFor(course41), title: "ENGR 41" },
    "https://catalog.example.edu/courses/engr-12": { text: pageTextFor(course12), fromCache: true, fetchedAt: cachedAt },
    "https://catalog.example.edu/courses/engr-55": { status: 404 },
    "https://catalog.example.edu/courses/envs-30": { text: "ENVS 30\nThis course now studies something else entirely." },
    "https://www.example.edu/centers/civic-data": { text: pageTextFor(center) },
    "https://www.example.edu/clubs/jazz": { text: pageTextFor(jazz) },
    "https://arts.example.edu/programs/interpreting": { blockedReason: "bot-challenge", status: 403, problem: "the site answered with a bot challenge" },
    "https://www.example.edu/traditions/river-day": { text: pageTextFor(tradition) },
    "https://www.example.edu/place/watershed-partners": { text: pageTextFor(place) },
    "https://catalog.example.edu/majors/environmental-engineering": { text: pageTextFor(major) },
  };
}

function setup(opts: { pages?: Record<string, StubPage>; facts?: Fact[]; deps?: Partial<PipelineDeps>; delayMs?: number } = {}) {
  const pageSource = new StubPageSource(opts.pages ?? basePages(), opts.delayMs ?? 5);
  const engine = fakeEngine();
  const recorded: { id: string; result: VerificationResult }[] = [];
  const saved: Dossier[] = [];
  const events: ResearchEvent[] = [];
  const progress: number[] = [];
  let ids = 0;
  const facts = opts.facts ?? EXAMPLE_FACTS;
  const deps: PipelineDeps = {
    getSchool: (id) => (id === "example" ? EXAMPLE_SCHOOL : id === "second" ? SECOND_SCHOOL : undefined),
    loadStudent: async () => STUDENT,
    listStudentApplications: async () => [APP, OTHER_APP],
    loadSchoolFacts: async (schoolId, unitId) =>
      (schoolId === "example" ? facts : schoolId === "second" ? SECOND_FACTS : []).filter((f) => !unitId || f.unitIds.length === 0 || f.unitIds.includes(unitId)),
    pageSource,
    recordVerification: async (id, result) => {
      recorded.push({ id, result });
    },
    upsertFacts: async () => {},
    rankFacts: engine.rankFacts,
    buildDossier: engine.buildDossier,
    coordinateAngles: engine.coordinateAngles,
    saveDossier: async (d) => {
      const i = saved.findIndex((x) => x.id === d.id);
      if (i >= 0) saved[i] = d;
      else saved.push(d);
    },
    listStudentDossiers: async () => [...saved],
    llmAvailable: () => false,
    crawlSchool: async () => {
      throw new Error("crawl should not run in this test");
    },
    claudeFetch: null,
    newId: () => `id-${++ids}`,
    now: () => Date.now(),
    timing: { readSoftMs: 5_000, readHardMs: 8_000 },
    ...opts.deps,
  };
  const hooks = {
    emit: async (e: ResearchEvent) => {
      events.push(e);
    },
    onProgress: (p: number) => progress.push(p),
  };
  return { deps, hooks, pageSource, engine, recorded, saved, events, progress };
}

const stageEvents = (events: ResearchEvent[]) =>
  events.filter((e): e is Extract<ResearchEvent, { type: "stage" }> => e.type === "stage").map((e) => `${e.stage}:${e.status}`);

describe("research pipeline", () => {
  it("runs the seven stages in order and only keeps facts confirmed on the page", async () => {
    const t = setup();
    const { dossier } = await runResearchPipeline(APP, t.deps, t.hooks);

    expect(stageEvents(t.events)).toEqual([
      "scope:start",
      "scope:done",
      "discover:start",
      "discover:done",
      "read:start",
      "verify:start",
      "read:done",
      "verify:done",
      "match:start",
      "match:done",
      "swap:start",
      "swap:done",
      "assemble:start",
      "assemble:done",
    ]);

    // Every page was read at most once, even when two facts share it.
    for (const [, n] of t.pageSource.loads) expect(n).toBe(1);
    expect(t.pageSource.loads.get("https://engineering.example.edu/labs/river")).toBe(1);
    // The arts-only fact is outside the engineering scope and never read.
    expect(t.pageSource.loads.has("https://arts.example.edu/courses/arts-10")).toBe(false);

    const input = t.engine.calls[0];
    const verifiedIds = input.verifiedFacts.map((f) => f.id).sort();
    expect(verifiedIds).toEqual(
      [lab, shop, course41, course12, center, jazz, tradition, place, major].map((f) => f.id).sort(),
    );
    for (const f of input.verifiedFacts) expect(f.verification?.status).toBe("verified");

    // Cached pages verify with the date the page was read; live pages with today.
    const cachedDay = isoDate(new Date(Date.now() - 2 * 60 * 60 * 1000));
    expect(input.verifiedFacts.find((f) => f.id === course12.id)?.verifiedAt).toBe(cachedDay);
    expect(input.verifiedFacts.find((f) => f.id === lab.id)?.verifiedAt).toBe(isoDate());
    for (const d of dossier.details) {
      expect(input.verifiedFacts.some((f) => f.id === d.factId)).toBe(true);
      expect(d.verifiedAt).toBe(input.verifiedFacts.find((f) => f.id === d.factId)?.verifiedAt);
    }

    // Rejections say why, plainly.
    const rejected = Object.fromEntries(
      t.events.filter((e): e is Extract<ResearchEvent, { type: "fact" }> => e.type === "fact" && e.status === "rejected").map((e) => [e.factId, e.reason]),
    );
    expect(rejected[courseGone.id]).toBe("the page no longer exists (HTTP 404)");
    expect(rejected[courseChanged.id]).toBe("the quoted text is no longer on the page");
    expect(rejected[interpreting.id]).toBe("could not be checked: arts.example.edu answered with a bot challenge");

    // Page events: reading first, then a final status with a plain reason.
    const pageEvents = t.events.filter((e): e is Extract<ResearchEvent, { type: "page" }> => e.type === "page");
    const blocked = pageEvents.find((e) => e.url.endsWith("/programs/interpreting") && e.status === "blocked");
    expect(blocked?.reason).toBe("answered with a bot challenge; skipped");
    expect(pageEvents.find((e) => e.url.endsWith("/engr-12") && e.status !== "reading")?.status).toBe("cached");
    expect(pageEvents.find((e) => e.url.endsWith("/engr-55") && e.status !== "reading")?.status).toBe("failed");
    for (const url of new Set(pageEvents.map((e) => e.url))) {
      const forUrl = pageEvents.filter((e) => e.url === url);
      expect(forUrl[0].status).toBe("reading");
      expect(forUrl[forUrl.length - 1].status).not.toBe("reading");
    }

    // Verified fact events carry the quote and commonness for the live view.
    const verifiedEvent = t.events.find((e) => e.type === "fact" && e.factId === lab.id);
    expect(verifiedEvent).toMatchObject({ status: "verified", quote: lab.quote, commonness: "rare" });

    // Every checked fact was recorded on the shared research base.
    const statuses = Object.fromEntries(t.recorded.map((r) => [r.id, r.result.status]));
    expect(statuses[lab.id]).toBe("verified");
    expect(statuses[courseGone.id]).toBe("failed");
    expect(statuses[courseChanged.id]).toBe("failed");
    expect(statuses[interpreting.id]).toBe("unreachable");

    // Saved, stats filled in, progress monotonic and below 100 (the runner sets 100).
    expect(t.saved.map((d) => d.id)).toContain(dossier.id);
    expect(dossier.stats.pagesRead).toBe(9); // includes the page whose quote changed
    expect(dossier.stats.pagesBlocked).toBe(2);
    expect(dossier.stats.factsVerified).toBe(9);
    expect(dossier.stats.factsRejected).toBe(3);
    expect(t.progress.every((p, i) => i === 0 || p >= t.progress[i - 1])).toBe(true);
    expect(Math.max(...t.progress)).toBeLessThan(100);
  });

  it("passes the other schools' current research to the swap test", async () => {
    const t = setup();
    await runResearchPipeline(APP, t.deps, t.hooks);
    const input = t.engine.calls[0];
    expect(input.otherSchools.map((o) => o.school.id)).toEqual(["second"]);
    // Facts not confirmed this term are not evidence of an equivalent.
    expect(input.otherSchools[0].facts.map((f) => f.id)).toEqual(["second:lab"]);
    const swapDone = t.events.find((e) => e.type === "stage" && e.stage === "swap" && e.status === "done");
    expect(swapDone).toMatchObject({ detail: "Checked each detail against Second." });
  });

  it("avoids lead angles already used by the student's other dossiers", async () => {
    const t = setup();
    const earlier: Dossier = { ...EXAMPLE_DOSSIER, id: "dossier-earlier", applicationId: OTHER_APP.id };
    t.deps.listStudentDossiers = async () => [earlier, ...t.saved];
    await runResearchPipeline(APP, t.deps, t.hooks);
    expect(t.engine.calls[0].usedLeadAngleKeys).toEqual(["water-sensing"]);
  });

  it("stops reading once enough facts of enough kinds are confirmed, and limits concurrency", async () => {
    const kinds = ["course", "lab", "center", "organization", "program", "facility"] as const;
    const many: Fact[] = Array.from({ length: 48 }, (_, i) =>
      makeFact({
        id: `example:many-${i}`,
        kind: kinds[i % kinds.length],
        title: `Detail ${i}`,
        sourceUrl: `https://${["www", "catalog", "engineering", "arts"][i % 4]}.example.edu/detail/${i}`,
        quote: `Detail ${i} is a fictional opportunity described on this page for testing.`,
      }),
    );
    const pages: Record<string, StubPage> = Object.fromEntries(many.map((f) => [f.sourceUrl, { text: pageTextFor(f) }]));
    const t = setup({ facts: many, pages, delayMs: 15 });
    await runResearchPipeline(APP, t.deps, t.hooks);
    const verified = t.engine.calls[0].verifiedFacts;
    expect(verified.length).toBeGreaterThanOrEqual(12);
    expect(t.pageSource.loads.size).toBeLessThan(many.length);
    expect(t.pageSource.maxActive).toBeLessThanOrEqual(6);
    for (const [, n] of t.pageSource.maxActivePerHost) expect(n).toBeLessThanOrEqual(2);
  });

  it("keeps kind diversity when the top of the ranking is all one kind", async () => {
    const courses = Array.from({ length: 14 }, (_, i) =>
      makeFact({ id: `example:c${i}`, kind: "course", title: `ENGR ${100 + i}: Course ${i}`, nameOnPage: `ENGR ${100 + i}`, sourceUrl: `https://catalog.example.edu/c/${i}`, quote: `ENGR ${100 + i} is a fictional course used to test diversity.` }),
    );
    const others = [lab, center, jazz, tradition, place];
    const facts = [...courses, ...others];
    const pages: Record<string, StubPage> = { ...basePages(), ...Object.fromEntries(courses.map((f) => [f.sourceUrl, { text: pageTextFor(f) }])) };
    // Courses rank highest.
    const scores = Object.fromEntries(facts.map((f, i) => [f.id, f.kind === "course" ? 0.99 - i * 0.001 : 0.5 - i * 0.001]));
    const engine = fakeEngine({ scores });
    const t = setup({ facts, pages, deps: { rankFacts: engine.rankFacts, buildDossier: engine.buildDossier } });
    await runResearchPipeline(APP, t.deps, t.hooks);
    const kinds = new Set(engine.calls[0].verifiedFacts.map((f) => f.kind));
    expect(kinds.size).toBeGreaterThanOrEqual(4);
  });

  it("stops waiting for very slow pages at the hard deadline", async () => {
    const pages = basePages();
    pages["https://www.example.edu/centers/civic-data"] = { text: pageTextFor(center), delayMs: 3_000 };
    const t = setup({ pages, deps: { timing: { readSoftMs: 200, readHardMs: 400 } } });
    const started = Date.now();
    await runResearchPipeline(APP, t.deps, t.hooks);
    expect(Date.now() - started).toBeLessThan(2_500);
    expect(t.engine.calls[0].verifiedFacts.some((f) => f.id === center.id)).toBe(false);
    expect(t.events.some((e) => e.type === "log" && /Stopped waiting for 1 slow page/.test(e.message))).toBe(true);
  });

  it("reads bot-challenged pages through Claude's web fetch tool when it is available", async () => {
    const t = setup({
      deps: {
        claudeFetch: async (url) => ({
          ok: true,
          page: {
            url,
            finalUrl: url,
            host: new URL(url).host,
            status: 200,
            ok: true,
            title: "Community Interpreting Program",
            text: pageTextFor(interpreting),
            mainText: pageTextFor(interpreting),
            links: [],
            headings: [],
            contentHash: null,
            fetchedAt: new Date().toISOString(),
            ms: 900,
            fromCache: false,
          },
        }),
      },
    });
    await runResearchPipeline(APP, t.deps, t.hooks);
    const rec = t.recorded.find((r) => r.id === interpreting.id);
    expect(rec?.result.status).toBe("verified");
    expect(rec?.result.detail).toBe(CLAUDE_FETCH_NOTE);
    const pageEvents = t.events.filter((e) => e.type === "page" && e.url.endsWith("/programs/interpreting")).map((e) => (e as { status: string }).status);
    expect(pageEvents).toEqual(["reading", "blocked", "reading", "read"]);
  });

  it("fails clearly for a school without a research base when Claude is not available", async () => {
    const t = setup({ facts: [] });
    await expect(runResearchPipeline(APP, t.deps, t.hooks)).rejects.toThrow(ResearchError);
    await expect(runResearchPipeline(APP, setup({ facts: [] }).deps, t.hooks)).rejects.toThrow(NO_RESEARCH_BASE_MESSAGE);
    expect(t.pageSource.loads.size).toBe(0);
  });

  it("fails when too few facts can be confirmed instead of building a thin dossier", async () => {
    const t = setup({ pages: { "https://engineering.example.edu/labs/river": { text: pageTextFor(lab) } } });
    await expect(runResearchPipeline(APP, t.deps, t.hooks)).rejects.toThrow(/Only 1 fact could be confirmed/);
    expect(t.engine.calls).toHaveLength(0);
  });

  it("drops dossier details the engine did not get from this run's verified facts", async () => {
    const t = setup();
    const engine = fakeEngine();
    t.deps.buildDossier = async (input, hooks) => {
      const d = await engine.buildDossier(input, hooks);
      d.details.push({ ...d.details[0], factId: "example:not-verified", title: "Invented" });
      return d;
    };
    const { dossier } = await runResearchPipeline(APP, t.deps, t.hooks);
    expect(dossier.details.some((d) => d.factId === "example:not-verified")).toBe(false);
    expect(dossier.details.map((d) => d.rank)).toEqual(dossier.details.map((_, i) => i + 1));
  });
});

describe("scope", () => {
  it("uses the application's unit, or the unit a custom prompt names", () => {
    expect(resolveScope(EXAMPLE_SCHOOL, { unitId: "engineering", promptId: "p", promptText: "Why us?" }).unit?.id).toBe("engineering");
    const custom = resolveScope(EXAMPLE_SCHOOL, { unitId: null, promptId: null, promptText: "Why does the College of Arts and Sciences appeal to you?" });
    expect(custom.unit?.id).toBe("arts");
    expect(custom.detail).toMatch(/The prompt names College of Arts and Sciences/);
    expect(resolveScope(EXAMPLE_SCHOOL, { unitId: null, promptId: null, promptText: "Why us?" }).unit).toBeUndefined();
  });

  it("orders candidates with a per-kind cap on the first pass", () => {
    const items = ["course", "course", "course", "course", "lab", "course", "center"].map((kind, i) => ({ id: i, fact: { kind } as Fact }));
    expect(diversityOrder(items, 3).map((x) => x.id)).toEqual([0, 1, 2, 4, 6, 3, 5]);
  });
});
