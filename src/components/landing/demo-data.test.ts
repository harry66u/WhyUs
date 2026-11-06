import { describe, expect, it } from "vitest";
import sampleStudentJson from "@data/sample-student.json";
import { DEFAULT_TIMING, diversityOrder as pipelineDiversityOrder } from "@/lib/research/pipeline";
import { seedCorpora } from "@/lib/research/corpus-data";
import { getSchool, isOfficialUrl, listSchools } from "@/lib/schools/registry";
import { RESEARCH_STAGES, type CorpusFile, type Fact, type ResearchEvent, type StudentProfile } from "@/lib/types";
import {
  RUN_PLAN,
  SAMPLE_LIST,
  buildLandingDemo,
  diversityOrder,
  exampleLandingDemo,
  getLandingDemo,
  joinNames,
  planReads,
  termLabel,
} from "./demo-data";
import { replayState, toStoredEvents } from "./demo-script";
import type { LandingDemo } from "./types";

const student = sampleStudentJson as unknown as StudentProfile;
const corpora = seedCorpora();
const schools = listSchools();

/** Every fact in the bundled research bases, by id. */
const corpusFacts = new Map<string, Fact>(corpora.flatMap((c) => c.facts.map((f) => [f.id, f] as const)));

function fact(id: string): Fact {
  const f = corpusFacts.get(id);
  if (!f) throw new Error(`Not a corpus fact: ${id}`);
  return f;
}

function eventsOf<T extends ResearchEvent["type"]>(demo: LandingDemo, type: T): Extract<ResearchEvent, { type: T }>[] {
  return demo.events.filter((e): e is Extract<ResearchEvent, { type: T }> => e.type === type);
}

let real: LandingDemo | null = null;
async function realDemo(): Promise<LandingDemo> {
  real ??= await buildLandingDemo({ student, schools, corpora });
  if (!real) throw new Error("The bundled research bases did not produce a landing demo");
  return real;
}

describe("read plan mirrors the research pipeline", () => {
  it("uses the pipeline's timing numbers", () => {
    for (const key of ["targetVerified", "minKinds", "topWindow", "perKindFirstPass", "concurrency", "perHost", "lookahead", "maxPages"] as const) {
      expect(RUN_PLAN[key], key).toBe(DEFAULT_TIMING[key]);
    }
  });

  it("orders candidates like the pipeline's first pass", () => {
    const kinds = ["course", "course", "lab", "course", "course", "lab", "faculty", "course"] as const;
    const items = kinds.map((kind, i) => ({ fact: { kind }, i }));
    expect(diversityOrder(items, 2).map((x) => x.i)).toEqual(pipelineDiversityOrder(items, 2).map((x) => x.i));
    expect(diversityOrder(items, 3).map((x) => x.i)).toEqual(pipelineDiversityOrder(items, 3).map((x) => x.i));
  });

  it("stops reading once enough top-ranked facts of enough kinds are confirmed", () => {
    const mk = (i: number, kind: Fact["kind"], page: number): Fact =>
      ({ id: `f${i}`, kind, sourceUrl: `https://www.example.edu/p${page}`, sourceTitle: `Page ${page}` }) as Fact;
    const ranked: Fact[] = [];
    // 40 candidates over 20 pages on one host, two per page, four kinds.
    for (let i = 0; i < 40; i++) ranked.push(mk(i, (["course", "lab", "program", "center"] as const)[i % 4], Math.floor(i / 2)));
    const plan = planReads(ranked);
    expect(plan.verified.length).toBeGreaterThanOrEqual(RUN_PLAN.targetVerified);
    expect(new Set(plan.verified.map((f) => f.kind)).size).toBeGreaterThanOrEqual(RUN_PLAN.minKinds);
    // Never more pages than needed plus what was already in flight.
    expect(plan.pages.length).toBeLessThanOrEqual(RUN_PLAN.targetVerified / 2 + RUN_PLAN.concurrency);
    // Every verified fact belongs to a page that was read.
    const read = new Set(plan.pages.map((p) => p.url));
    expect(plan.verified.every((f) => read.has(f.sourceUrl))).toBe(true);
  });
});

describe("landing demo from the verified research bases", () => {
  it("replays a research base, not the example", async () => {
    const demo = await realDemo();
    expect(demo.source).toBe("corpus");
    expect(SAMPLE_LIST.some((e) => e.schoolId === demo.school.id)).toBe(true);
    expect(demo.dossier.details.length).toBeGreaterThanOrEqual(6);
    expect(demo.dossier.details.length).toBeLessThanOrEqual(8);
  });

  it("shows only facts from a corpus file with verifiedAt set, cited exactly as the corpus records them", async () => {
    const demo = await realDemo();
    const school = getSchool(demo.school.id)!;
    for (const d of demo.dossier.details) {
      const f = fact(d.factId);
      expect(f.schoolId).toBe(demo.school.id);
      expect(f.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}/);
      expect(f.verification?.status).not.toBe("failed");
      expect(d.verifiedAt).toBe(f.verifiedAt!.slice(0, 10));
      expect(d.sourceUrl).toBe(f.sourceUrl);
      expect(d.quote).toBe(f.quote);
      expect(d.title).toBe(f.title);
      expect(isOfficialUrl(d.sourceUrl, school)).toBe(true);
    }
    for (const e of eventsOf(demo, "fact")) {
      const f = fact(e.factId);
      expect(e.status).toBe("verified");
      expect(e.quote).toBe(f.quote);
      expect(e.url).toBe(f.sourceUrl);
      expect(demo.verifiedOn[e.factId]).toBe(f.verifiedAt!.slice(0, 10));
    }
    const sources = new Set([...corpusFacts.values()].filter((f) => f.schoolId === demo.school.id).map((f) => f.sourceUrl));
    for (const e of eventsOf(demo, "page")) expect(sources.has(e.url), e.url).toBe(true);

    const c = demo.citation;
    const cf = fact(c.factId);
    expect(c.quote).toBe(cf.quote);
    expect(c.sourceUrl).toBe(cf.sourceUrl);
    expect(c.verifiedAt).toBe(cf.verifiedAt!.slice(0, 10));
    expect(c.nameOnPage).toBe(cf.nameOnPage);
    expect(c.officialDomain).not.toBeNull();
    expect([...school.officialDomains, ...school.officialHosts]).toContain(c.officialDomain);
  });

  it("swap results compare only with verified facts of the other schools", async () => {
    const demo = await realDemo();
    const compared = new Set(demo.compared.map((c) => c.schoolId));
    expect(compared.has(demo.school.id)).toBe(false);
    for (const d of demo.dossier.details) {
      for (const r of d.swap) {
        expect(compared.has(r.schoolId)).toBe(true);
        if (r.equivalentUrl) {
          const other = getSchool(r.schoolId)!;
          expect(isOfficialUrl(r.equivalentUrl, other)).toBe(true);
        }
      }
    }
  });

  it("uses a prompt confirmed on an official page", async () => {
    const demo = await realDemo();
    const school = getSchool(demo.school.id)!;
    const prompt = school.prompts.find((p) => p.text === demo.prompt.text);
    expect(prompt).toBeDefined();
    expect(prompt!.verifiedAt).toBeTruthy();
    expect(demo.prompt.verifiedAt).toBe(prompt!.verifiedAt);
  });

  it("emits events in the order a run does", async () => {
    const demo = await realDemo();
    const starts = demo.events.filter((e) => e.type === "stage" && e.status === "start").map((e) => (e as { stage: string }).stage);
    expect(starts).toEqual(RESEARCH_STAGES.map((s) => s.stage));
    const last = demo.events[demo.events.length - 1];
    expect(last).toEqual({ type: "done", dossierId: demo.dossier.id, uniquenessScore: Math.round(demo.dossier.uniquenessScore) });

    // Matches and swap tests follow the dossier's ranking.
    const ranked = [...demo.dossier.details].sort((a, b) => a.rank - b.rank).map((d) => d.factId);
    expect(eventsOf(demo, "match").map((e) => e.factId)).toEqual(ranked);
    expect(eventsOf(demo, "swap").map((e) => e.factId)).toEqual(ranked);

    // A page is read before any fact on it is verified.
    const readAt = new Map<string, number>();
    demo.events.forEach((e, i) => {
      if (e.type === "page" && e.status === "read") readAt.set(e.url, i);
      if (e.type === "fact") expect(readAt.get(e.url)).toBeLessThan(i);
    });

    // Angles are one line each, never prose paragraphs.
    for (const a of eventsOf(demo, "angle")) {
      expect(a.line).not.toMatch(/\n/);
      expect(a.line.length).toBeLessThanOrEqual(160);
    }
    expect(eventsOf(demo, "angle").filter((a) => a.isLead)).toHaveLength(1);
  });

  it("replays to the dossier's own numbers through the live view's reducer", async () => {
    const demo = await realDemo();
    const stored = toStoredEvents(demo.events);
    const state = replayState(stored, stored.length, 0);
    expect(state.done).toEqual({ dossierId: demo.dossier.id, uniquenessScore: demo.summary.score });
    expect(state.stages.every((s) => s.status === "done")).toBe(true);
    expect(state.counters.matches).toBe(demo.dossier.details.length);
    expect(state.counters.factsVerified).toBe(Object.keys(demo.verifiedOn).length);
    expect(state.counters.pagesRead).toBe(eventsOf(demo, "page").filter((e) => e.status === "read").length);
    expect(state.counters.pagesBlocked).toBe(0);
    expect(state.counters.factsRejected).toBe(0);
  });

  it("is memoized and built from the bundled data", async () => {
    const a = await getLandingDemo();
    const b = await getLandingDemo();
    expect(a).toBe(b);
    expect(a.source).toBe("corpus");
  });
});

describe("what the demo refuses to show", () => {
  it("never shows a fact without a verification date or with a failed check", async () => {
    const target = (await realDemo()).school.id;
    const shown = (await realDemo()).dossier.details.map((d) => d.factId);
    // Strip the date from half of the shown facts and fail the other half.
    const tampered: CorpusFile[] = corpora.map((c) =>
      c.schoolId !== target
        ? c
        : {
            ...c,
            facts: c.facts.map((f) => {
              const i = shown.indexOf(f.id);
              if (i === -1) return f;
              return i % 2 === 0
                ? { ...f, verifiedAt: null }
                : { ...f, verification: { status: "failed" as const, checkedAt: "2026-11-05T00:00:00Z", detail: "Quoted text was not found on the current page" } };
            }),
          },
    );
    const demo = await buildLandingDemo({ student, schools, corpora: tampered });
    const ids = new Set([
      ...(demo?.dossier.details.map((d) => d.factId) ?? []),
      ...(demo ? eventsOf(demo, "fact").map((e) => e.factId) : []),
    ]);
    for (const id of shown) expect(ids.has(id), id).toBe(false);
  });

  it("returns nothing when there is no research base, and the example then stays fictional", async () => {
    const empty = corpora.map((c) => ({ ...c, facts: [] }));
    expect(await buildLandingDemo({ student, schools, corpora: empty })).toBeNull();

    const example = exampleLandingDemo(student);
    expect(example.source).toBe("example");
    expect(example.corpusStats).toBeNull();
    const urls = [
      ...example.dossier.details.map((d) => d.sourceUrl),
      ...example.events.flatMap((e) => (e.type === "page" || e.type === "fact" ? [e.url] : [])),
      example.citation.sourceUrl,
    ];
    for (const url of urls) expect(new URL(url).host.endsWith("example.edu"), url).toBe(true);
    const stored = toStoredEvents(example.events);
    expect(replayState(stored, stored.length, 0).done?.uniquenessScore).toBe(example.summary.score);
  });
});

describe("helpers", () => {
  it("joins names in plain English", () => {
    expect(joinNames(["Penn"])).toBe("Penn");
    expect(joinNames(["Penn", "Tufts"])).toBe("Penn and Tufts");
    expect(joinNames(["Dartmouth", "Penn", "Tufts"])).toBe("Dartmouth, Penn, and Tufts");
  });

  it("labels terms", () => {
    expect(termLabel("2026-fall")).toBe("fall 2026");
    expect(termLabel("2027-spring")).toBe("spring 2027");
    expect(termLabel("")).toBeNull();
  });
});
