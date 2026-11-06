/**
 * Test fixtures for the research runtime: a fictional school on example.edu
 * (the same fictional "Example University" as src/lib/fixtures/example-dossier.ts),
 * a second fictional school on the reserved .example TLD, a fictional student,
 * a page source that serves canned pages, and a stand-in matching engine.
 * Nothing here describes a real school.
 */
import type { BuildDossierInput, BuildHooks, RankedFact, RankOptions } from "@/lib/matching/engine";
import { RESEARCH_POLICY_NOTE, type Dossier, type Fact, type FactKind, type School, type StudentProfile } from "@/lib/types";
import type { BlockedReason } from "../fetcher";
import type { LoadOptions, PageSnapshot, PageSource } from "../page-source";

export const EXAMPLE_SCHOOL: School = {
  id: "example",
  name: "Example University",
  shortName: "Example",
  city: "Exampleville",
  state: "EX",
  officialDomains: ["example.edu"],
  officialHosts: [],
  units: [
    { id: "engineering", name: "School of Engineering", shortName: "Example Engineering", aliases: ["Example Engineering", "School of Engineering"], hosts: ["engineering.example.edu"] },
    { id: "arts", name: "College of Arts and Sciences", shortName: "Arts and Sciences", aliases: ["Arts and Sciences"], hosts: ["arts.example.edu"] },
  ],
  prompts: [],
  seedUrls: [
    { url: "https://engineering.example.edu/research", category: "research", unitIds: ["engineering"] },
    { url: "https://www.example.edu/student-life/clubs", category: "organizations" },
  ],
  hasCorpus: true,
};

export const SECOND_SCHOOL: School = {
  id: "second",
  name: "Second College",
  shortName: "Second",
  city: "Elsewhere",
  state: "EX",
  officialDomains: ["second.example"],
  officialHosts: [],
  units: [{ id: "college", name: "Second College", aliases: ["Second"], hosts: ["www.second.example"] }],
  prompts: [],
  seedUrls: [],
  hasCorpus: true,
};

export const STUDENT: StudentProfile = {
  id: "student-1",
  name: "Test Student",
  graduationYear: 2027,
  intendedMajors: ["Environmental Engineering"],
  interests: ["water quality", "jazz"],
  activities: [
    { id: "act-sensors", title: "Creek Sensor Project", role: "Builder", description: "Built water quality sensors for a local creek." },
    { id: "act-jazz", title: "Jazz Band", role: "Trumpet", description: "Plays trumpet in the school jazz band." },
  ],
};

let factCounter = 0;

export function makeFact(partial: Partial<Fact> & { title: string; kind: FactKind; sourceUrl: string; quote: string }, schoolId = "example"): Fact {
  factCounter++;
  return {
    id: partial.id ?? `${schoolId}:fact-${factCounter}`,
    schoolId,
    unitIds: partial.unitIds ?? [],
    kind: partial.kind,
    title: partial.title,
    nameOnPage: partial.nameOnPage ?? partial.title,
    summary: partial.summary ?? `A fictional ${partial.kind} used in tests.`,
    hook: partial.hook ?? "gives students a fictional test opportunity",
    quote: partial.quote,
    sourceUrl: partial.sourceUrl,
    sourceTitle: partial.sourceTitle ?? `${partial.title} | Example University`,
    themes: partial.themes ?? ["water"],
    commonness: partial.commonness ?? "rare",
    term: partial.term ?? "2026-fall",
    verifiedAt: partial.verifiedAt ?? "2026-10-01",
    verification: partial.verification,
  };
}

/** The canned page text that contains a fact's name and quote. */
export function pageTextFor(...facts: Fact[]): string {
  return ["Example University", ...facts.flatMap((f) => [f.nameOnPage, f.quote]), "Contact us"].join("\n");
}

export interface StubPage {
  text?: string;
  status?: number;
  blockedReason?: BlockedReason;
  problem?: string;
  fromCache?: boolean;
  fetchedAt?: string;
  title?: string;
  delayMs?: number;
  links?: { href: string; text: string }[];
}

/** Serves canned pages, counts loads per URL, and tracks how many loads run at once. */
export class StubPageSource implements PageSource {
  loads = new Map<string, number>();
  active = 0;
  maxActive = 0;
  maxActivePerHost = new Map<string, number>();
  private activePerHost = new Map<string, number>();

  constructor(
    private pages: Record<string, StubPage>,
    private defaultDelayMs = 5,
  ) {}

  async load(url: string, _opts: LoadOptions = {}): Promise<PageSnapshot> {
    this.loads.set(url, (this.loads.get(url) ?? 0) + 1);
    const host = new URL(url).host;
    this.active++;
    this.maxActive = Math.max(this.maxActive, this.active);
    const perHost = (this.activePerHost.get(host) ?? 0) + 1;
    this.activePerHost.set(host, perHost);
    this.maxActivePerHost.set(host, Math.max(this.maxActivePerHost.get(host) ?? 0, perHost));
    const page = this.pages[url];
    await new Promise((r) => setTimeout(r, page?.delayMs ?? this.defaultDelayMs));
    this.active--;
    this.activePerHost.set(host, (this.activePerHost.get(host) ?? 1) - 1);
    const fetchedAt = page?.fetchedAt ?? new Date().toISOString();
    if (!page || page.status === 404 || page.blockedReason || page.status === 0 || (page.status ?? 200) >= 400) {
      const status = page ? (page.status ?? 0) : 404;
      return {
        url,
        finalUrl: url,
        host,
        status,
        ok: false,
        title: "",
        text: "",
        mainText: "",
        links: [],
        headings: [],
        contentHash: null,
        fetchedAt,
        ms: 12,
        blockedReason: page?.blockedReason,
        problem: page?.problem ?? (status ? `HTTP ${status}` : "network error"),
        fromCache: Boolean(page?.fromCache),
      };
    }
    const text = page.text ?? "";
    return {
      url,
      finalUrl: url,
      host,
      status: page.status ?? 200,
      ok: true,
      title: page.title ?? "Example University",
      text,
      mainText: text,
      links: page.links ?? [],
      headings: [],
      contentHash: "stub",
      fetchedAt,
      ms: 12,
      fromCache: Boolean(page.fromCache),
    };
  }
}

/** A stand-in for the matching engine with the same signatures. */
export function fakeEngine(opts: { scores?: Record<string, number>; detailCount?: number } = {}) {
  const calls: BuildDossierInput[] = [];
  const rankFacts = (_student: StudentProfile, facts: Fact[], _o: RankOptions): RankedFact[] =>
    facts
      .map((fact, i) => ({ fact, score: opts.scores?.[fact.id] ?? 1 - i / 1000, activityIds: ["act-sensors"], themes: fact.themes }))
      .sort((a, b) => b.score - a.score);
  const buildDossier = async (input: BuildDossierInput, hooks: BuildHooks = {}): Promise<Dossier> => {
    calls.push(input);
    const picked = input.verifiedFacts.slice(0, opts.detailCount ?? 7);
    for (const [i, f] of picked.entries()) {
      await hooks.emit?.({ type: "match", factId: f.id, title: f.title, activityTitle: "Creek Sensor Project", score: 0.9 - i * 0.05, sentence: "Connects to the creek sensor project." });
    }
    for (const f of picked.slice(0, 2)) {
      await hooks.emit?.({
        type: "swap",
        factId: f.id,
        title: f.title,
        results: input.otherSchools.map((o) => ({ schoolId: o.school.id, schoolName: o.school.shortName, status: o.facts.length ? "none" : "unknown" })),
      });
    }
    await hooks.emit?.({ type: "angle", line: "Sensing water, from a creek to a river lab.", isLead: true });
    await hooks.emit?.({ type: "angle", line: "Music as a second thread.", isLead: false });
    return {
      id: input.dossierId,
      applicationId: input.applicationId,
      studentId: input.student.id,
      schoolId: input.school.id,
      schoolName: input.school.name,
      unitId: input.unitId,
      unitName: input.school.units.find((u) => u.id === input.unitId)?.name ?? null,
      prompt: input.prompt,
      generatedAt: new Date().toISOString(),
      term: input.term,
      uniquenessScore: 71,
      details: picked.map((f, i) => ({
        factId: f.id,
        rank: i + 1,
        kind: f.kind,
        title: f.title,
        summary: f.summary,
        quote: f.quote,
        sourceUrl: f.sourceUrl,
        sourceTitle: f.sourceTitle,
        verifiedAt: f.verifiedAt ?? "",
        fit: { sentence: "Connects to the creek sensor project.", activityIds: ["act-sensors"], themes: f.themes, score: 0.8 },
        uniqueness: { score: 70, label: "Uncommon", commonlyMentioned: false, reason: "Specific detail." },
        swap: [],
      })),
      angles: [
        { key: "act-sensors|water", line: "Sensing water, from a creek to a river lab.", factIds: picked.slice(0, 1).map((f) => f.id), activityIds: ["act-sensors"], themes: ["water"], isLead: true },
        { key: "act-jazz|jazz", line: "Music as a second thread.", factIds: [], activityIds: ["act-jazz"], themes: ["jazz"], isLead: false },
      ],
      questions: [
        { text: "How do first-year students join the lab?", factId: picked[0]?.id, audience: "info_session" },
        { text: "What does a typical week look like?", audience: "current_student" },
        { text: "Which courses do students take first?", audience: "current_student" },
      ],
      policyNote: RESEARCH_POLICY_NOTE,
      stats: { ...input.stats, engine: "deterministic" },
    };
  };
  const coordinateAngles = (_dossiers: Dossier[]): Dossier[] => [];
  return { calls, rankFacts, buildDossier, coordinateAngles };
}
