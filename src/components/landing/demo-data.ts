/**
 * The landing page's research demo, built on the server when the page is
 * prerendered (the landing page is static).
 *
 * It replays how a research run handles one application on the sample
 * student's list, using the same steps a live run takes:
 *   rankFacts -> the pipeline's read plan (diversity-aware page order, about
 *   six pages at a time, stop once enough facts of enough kinds are confirmed)
 *   -> buildDossier (match, swap test against the rest of the list, uniqueness,
 *   angles) -> the research events a run emits, in order.
 *
 * Every fact it shows comes from a /data/corpus file with `verifiedAt` set, on
 * an official URL, and the citations carry the corpus verification dates. When
 * no research base can produce a dossier yet, it falls back to the fictional
 * example.edu fixture, which the page labels "Example".
 *
 * Server-only in practice (it imports the matching engine); client components
 * receive the resulting LandingDemo as plain JSON.
 */
import sampleStudentJson from "@data/sample-student.json";
import { labelCountsText, scoreBand } from "@/components/dossier/model";
import { buildDossier, rankFacts } from "@/lib/matching/engine";
import { EXAMPLE_DOSSIER } from "@/lib/fixtures/example-dossier";
import { seedCorpora } from "@/lib/research/corpus-data";
import { isOfficialUrl, listSchools, promptsFor } from "@/lib/schools/registry";
import type {
  CorpusFile,
  Dossier,
  DossierDetail,
  Fact,
  ResearchEvent,
  School,
  StudentProfile,
  SupplementalPrompt,
} from "@/lib/types";
import type { ComparedSchool, CorpusStats, DossierSummary, LandingCitation, LandingDemo } from "./types";

/* ------------------------------------------------------------------ */
/* The sample student's list                                           */
/* ------------------------------------------------------------------ */

export interface ListEntry {
  schoolId: string;
  unitId: string | null;
}

/**
 * The sample student's applications: the same schools and units as the
 * acceptance check (scripts/done-check.ts).
 */
export const SAMPLE_LIST: ListEntry[] = [
  { schoolId: "dartmouth", unitId: "college" },
  { schoolId: "penn", unitId: "college" },
  { schoolId: "cornell", unitId: "engineering" },
  { schoolId: "tufts", unitId: "engineering" },
  { schoolId: "umich", unitId: "taubman" },
];

/**
 * Which application the demo replays, best first. Cornell Engineering is the
 * closest fit to the sample student's intended major; the rest are fallbacks
 * for when a research base or a confirmed prompt is missing.
 */
export const DEMO_ORDER = ["cornell", "penn", "dartmouth", "umich", "tufts"];

/** A replayed dossier must have at least this many details to be worth showing. */
export const MIN_DEMO_DETAILS = 6;

/* ------------------------------------------------------------------ */
/* Read plan (mirrors DEFAULT_TIMING and readAndVerify in               */
/* src/lib/research/pipeline.ts; a test keeps the numbers in sync)     */
/* ------------------------------------------------------------------ */

export const RUN_PLAN = {
  /** Keep reading until this many top-ranked candidates are confirmed... */
  targetVerified: 12,
  /** ...covering at least this many kinds of detail. */
  minKinds: 4,
  /** Candidates ranked below this position do not count toward the target. */
  topWindow: 48,
  /** First pass takes at most this many candidates of one kind. */
  perKindFirstPass: 3,
  /** Pages read at the same time. */
  concurrency: 6,
  /** Pages read at the same time from one host. */
  perHost: 2,
  /** How far down the page order a free slot may reach past a busy host. */
  lookahead: 10,
  maxPages: 60,
} as const;

export type RunPlan = typeof RUN_PLAN;

/** Ranking order, except that a first pass takes at most `perKind` candidates of each kind. */
export function diversityOrder<T extends { fact: Pick<Fact, "kind"> }>(candidates: T[], perKind: number): T[] {
  const first: T[] = [];
  const rest: T[] = [];
  const counts = new Map<string, number>();
  for (const c of candidates) {
    const n = counts.get(c.fact.kind) ?? 0;
    if (n < perKind) {
      counts.set(c.fact.kind, n + 1);
      first.push(c);
    } else rest.push(c);
  }
  return [...first, ...rest];
}

function hostOf(url: string): string {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return url;
  }
}

export interface PlannedPage {
  url: string;
  /** The page's <title> as recorded in the research base. */
  title: string;
  /** Candidate facts confirmed on this page, best ranked first. */
  facts: Fact[];
}

/**
 * Which official pages a run reads for this ranking, in the order it starts
 * them, assuming every page reads cleanly: pages in order of their best
 * candidate (diversity-aware), up to `concurrency` at once and `perHost` per
 * host, and no new page once enough top-ranked facts of enough kinds are in.
 */
export function planReads(ranked: Fact[], plan: RunPlan = RUN_PLAN): { pages: PlannedPage[]; verified: Fact[] } {
  const candidates = ranked.map((fact, rank) => ({ fact, rank }));
  type Page = { url: string; host: string; title: string; cands: { fact: Fact; rank: number }[] };
  const byUrl = new Map<string, Page>();
  const order: Page[] = [];
  for (const c of diversityOrder(candidates, plan.perKindFirstPass)) {
    let page = byUrl.get(c.fact.sourceUrl);
    if (!page) {
      page = { url: c.fact.sourceUrl, host: hostOf(c.fact.sourceUrl), title: c.fact.sourceTitle, cands: [] };
      byUrl.set(page.url, page);
      order.push(page);
    }
    page.cands.push(c);
  }

  const target = Math.min(plan.targetVerified, candidates.filter((c) => c.rank < plan.topWindow).length);
  const kindsNeeded = Math.min(plan.minKinds, new Set(candidates.map((c) => c.fact.kind)).size);
  const verified: { fact: Fact; rank: number }[] = [];
  const enough = () =>
    verified.filter((c) => c.rank < plan.topWindow).length >= target && new Set(verified.map((c) => c.fact.kind)).size >= kindsNeeded;

  const queue = [...order];
  const inFlight: Page[] = [];
  const started: Page[] = [];
  const active = new Map<string, number>();
  const startNext = (): boolean => {
    const reach = Math.min(queue.length, plan.lookahead);
    for (let i = 0; i < reach; i++) {
      const page = queue[i];
      if ((active.get(page.host) ?? 0) >= plan.perHost) continue;
      queue.splice(i, 1);
      active.set(page.host, (active.get(page.host) ?? 0) + 1);
      inFlight.push(page);
      started.push(page);
      return true;
    }
    return false;
  };
  const fill = () => {
    while (inFlight.length < plan.concurrency && started.length < plan.maxPages && !enough() && startNext()) {
      // keep starting pages while slots and candidates remain
    }
  };

  fill();
  while (inFlight.length > 0) {
    const page = inFlight.shift()!;
    active.set(page.host, Math.max(0, (active.get(page.host) ?? 1) - 1));
    verified.push(...page.cands);
    fill();
  }

  return {
    pages: started.map((p) => ({ url: p.url, title: p.title, facts: p.cands.map((c) => c.fact) })),
    verified: verified.map((c) => c.fact),
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** "A", "A and B", "A, B, and C" */
export function joinNames(names: string[]): string {
  if (names.length <= 2) return names.join(" and ");
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** A fact the demo may show: verified (with a date), not failed since, on an official URL of its school. */
export function isShowableFact(fact: Fact, school: School): boolean {
  if (!fact || fact.schoolId !== school.id) return false;
  if (!fact.verifiedAt || !/^\d{4}-\d{2}-\d{2}/.test(fact.verifiedAt)) return false;
  const status = fact.verification?.status;
  if (status === "failed" || status === "unreachable") return false;
  return isOfficialUrl(fact.sourceUrl, school);
}

/** Facts for a school as a run loads them for one unit: the unit's own plus university-wide facts. */
function scopedFacts(facts: Fact[], unitId: string | null): Fact[] {
  return facts.filter((f) => !unitId || (f.unitIds ?? []).length === 0 || f.unitIds.includes(unitId));
}

/** The prompt a run uses for this unit (the unit's "why" prompt), only if its text was confirmed on an official page. */
function confirmedWhyPrompt(school: School, unitId: string | null): SupplementalPrompt | null {
  const prompts = promptsFor(school, unitId);
  const prompt = prompts.find((p) => p.kind === "why_school") ?? prompts[0];
  if (!prompt || !prompt.text?.trim() || !prompt.verifiedAt) return null;
  return prompt;
}

function officialDomainFor(url: string, school: School): string | null {
  let host: string;
  try {
    host = new URL(url).host.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
  const hostMatch = school.officialHosts.find((h) => h.toLowerCase().replace(/^www\./, "") === host);
  if (hostMatch) return hostMatch.replace(/^www\./, "");
  return school.officialDomains.find((d) => host === d.toLowerCase() || host.endsWith(`.${d.toLowerCase()}`)) ?? null;
}

/** "2026-fall" -> "fall 2026" */
export function termLabel(term: string | null | undefined): string | null {
  const m = /^(\d{4})-(fall|spring|summer)$/.exec(term ?? "");
  return m ? `${m[2]} ${m[1]}` : null;
}

function activityTitle(student: StudentProfile, detail: DossierDetail): string | undefined {
  const id = detail.fit.activityIds?.[0];
  return id ? student.activities.find((a) => a.id === id)?.title : undefined;
}

/** The score line as the briefing words it (same bands and counts as the dossier page). */
export function dossierSummary(dossier: Dossier): DossierSummary {
  const score = Math.max(0, Math.min(100, Math.round(dossier.uniquenessScore)));
  const band = scoreBand(score);
  return { score, bandLabel: band.label, bandTone: band.tone, countsText: labelCountsText(dossier.details) };
}

/* ------------------------------------------------------------------ */
/* Events                                                              */
/* ------------------------------------------------------------------ */

interface EventInput {
  school: Pick<School, "name" | "shortName">;
  /** Display name of the unit the research is scoped to; null for the whole school. */
  unitLabel: string | null;
  baseFacts: number;
  basePages: number;
  pages: { url: string; title: string; facts: Pick<Fact, "id" | "title" | "kind" | "sourceUrl" | "quote" | "commonness">[] }[];
  dossier: Dossier;
  student: StudentProfile;
  compared: ComparedSchool[];
}

/** Pages in flight at once in the replay (a live run reads about six at a time). */
const REPLAY_IN_FLIGHT = 3;

/**
 * The events a research run emits for this application, in emission order,
 * worded the way the research pipeline words them.
 */
export function researchEvents(input: EventInput): ResearchEvent[] {
  const { school, unitLabel, dossier, student, compared } = input;
  const events: ResearchEvent[] = [];
  const details = [...dossier.details].sort((a, b) => a.rank - b.rank);
  const verifiedCount = input.pages.reduce((n, p) => n + p.facts.length, 0);

  events.push({ type: "stage", stage: "scope", status: "start" });
  events.push({
    type: "stage",
    stage: "scope",
    status: "done",
    detail: unitLabel
      ? `Scoped to ${unitLabel}, plus opportunities open to all ${school.shortName} undergraduates.`
      : `Scoped to all of ${school.name}.`,
  });

  events.push({ type: "stage", stage: "discover", status: "start" });
  events.push({
    type: "stage",
    stage: "discover",
    status: "done",
    detail: `${plural(input.baseFacts, "fact")} in the ${school.shortName} research base apply to ${unitLabel ?? school.name}, from ${plural(input.basePages, "official page")}.`,
  });
  events.push({
    type: "log",
    message: `Ranked ${plural(input.baseFacts, "candidate fact")} against the activity list and the prompt. Checking the strongest on their live pages first.`,
  });

  events.push({ type: "stage", stage: "read", status: "start" });
  let verifyStarted = false;
  const inFlight: EventInput["pages"] = [];
  const complete = (page: EventInput["pages"][number]) => {
    events.push({ type: "page", url: page.url, title: page.title || undefined, status: "read" });
    if (!verifyStarted) {
      verifyStarted = true;
      events.push({ type: "stage", stage: "verify", status: "start" });
    }
    for (const f of page.facts) {
      events.push({
        type: "fact",
        factId: f.id,
        title: f.title,
        kind: f.kind,
        url: f.sourceUrl,
        status: "verified",
        quote: f.quote,
        ...(f.commonness ? { commonness: f.commonness } : {}),
      });
    }
  };
  for (const page of input.pages) {
    events.push({ type: "page", url: page.url, status: "reading" });
    inFlight.push(page);
    if (inFlight.length >= REPLAY_IN_FLIGHT) complete(inFlight.shift()!);
  }
  while (inFlight.length > 0) complete(inFlight.shift()!);
  events.push({ type: "stage", stage: "read", status: "done", detail: `Read ${plural(input.pages.length, "official page")}.` });
  events.push({ type: "stage", stage: "verify", status: "done", detail: `${plural(verifiedCount, "fact")} confirmed on current pages.` });

  events.push({ type: "stage", stage: "match", status: "start" });
  for (const d of details) {
    const activity = activityTitle(student, d);
    events.push({
      type: "match",
      factId: d.factId,
      title: d.title,
      ...(activity ? { activityTitle: activity } : {}),
      score: d.fit.score,
      sentence: d.fit.sentence,
    });
  }
  events.push({
    type: "stage",
    stage: "match",
    status: "done",
    detail: `${plural(details.length, "verified fact")} matched to the activity list.`,
  });

  events.push({ type: "stage", stage: "swap", status: "start" });
  for (const d of details) {
    events.push({
      type: "swap",
      factId: d.factId,
      title: d.title,
      results: (d.swap ?? []).map((r) => ({
        schoolId: r.schoolId,
        schoolName: r.schoolName,
        status: r.status,
        ...(r.equivalentTitle ? { equivalentTitle: r.equivalentTitle } : {}),
      })),
    });
  }
  const unresearched = compared.filter((c) => !c.researched).map((c) => c.shortName);
  events.push({
    type: "stage",
    stage: "swap",
    status: "done",
    detail:
      compared.length === 0
        ? "No other schools on the list yet, so there is nothing to swap against."
        : `Checked each detail against ${joinNames(compared.map((c) => c.shortName))}.${
            unresearched.length
              ? ` ${joinNames(unresearched)} ${unresearched.length === 1 ? "has" : "have"} no verified research base yet, so ${unresearched.length === 1 ? "its" : "their"} results show as unknown.`
              : ""
          }`,
  });

  events.push({ type: "stage", stage: "assemble", status: "start" });
  const angles = [...dossier.angles].sort((a, b) => Number(b.isLead) - Number(a.isLead));
  for (const a of angles) events.push({ type: "angle", line: a.line, isLead: a.isLead });
  const score = Math.round(dossier.uniquenessScore);
  events.push({
    type: "stage",
    stage: "assemble",
    status: "done",
    detail: `${plural(details.length, "detail")}, ${plural(angles.length, "angle")}, and ${plural(dossier.questions.length, "question")}. Uniqueness ${score}.`,
  });
  events.push({ type: "done", dossierId: dossier.id, uniquenessScore: score });
  return events;
}

/* ------------------------------------------------------------------ */
/* Build from the verified research bases                              */
/* ------------------------------------------------------------------ */

export interface LandingDemoInputs {
  student: StudentProfile;
  schools: School[];
  corpora: CorpusFile[];
  list?: ListEntry[];
  order?: string[];
}

/** Size of the verified research bases (all schools, all units). */
export function corpusStats(schools: School[], corpora: CorpusFile[]): CorpusStats | null {
  const names: string[] = [];
  const pages = new Set<string>();
  const terms = new Map<string, number>();
  let facts = 0;
  for (const school of schools) {
    const corpus = corpora.find((c) => c.schoolId === school.id);
    const usable = (corpus?.facts ?? []).filter((f) => isShowableFact(f, school));
    if (usable.length === 0) continue;
    names.push(school.shortName);
    facts += usable.length;
    for (const f of usable) pages.add(f.sourceUrl);
    if (corpus?.term) terms.set(corpus.term, (terms.get(corpus.term) ?? 0) + 1);
  }
  if (facts === 0) return null;
  const term = [...terms.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return { schools: names.sort((a, b) => a.localeCompare(b)), facts, pages: pages.size, term: termLabel(term) };
}

/**
 * The demo for the first application in `order` whose school has a research
 * base, a confirmed prompt, and enough verified facts for a full dossier.
 * Null when none qualifies.
 */
export async function buildLandingDemo(inputs: LandingDemoInputs): Promise<LandingDemo | null> {
  const list = inputs.list ?? SAMPLE_LIST;
  const order = inputs.order ?? DEMO_ORDER;
  const schoolById = new Map(inputs.schools.map((s) => [s.id, s]));
  const usableFor = (school: School) =>
    (inputs.corpora.find((c) => c.schoolId === school.id)?.facts ?? []).filter((f) => isShowableFact(f, school));

  const entries = list.filter((e) => schoolById.has(e.schoolId));
  const targets = [...entries].sort((a, b) => rankOf(order, a.schoolId) - rankOf(order, b.schoolId));

  for (const target of targets) {
    const school = schoolById.get(target.schoolId)!;
    const prompt = confirmedWhyPrompt(school, target.unitId);
    if (!prompt) continue;
    const base = scopedFacts(usableFor(school), target.unitId);
    if (base.length < MIN_DEMO_DETAILS) continue;

    const ranked = rankFacts(inputs.student, base, { unitId: target.unitId, promptText: prompt.text }).map((r) => r.fact);
    const plan = planReads(ranked);
    if (plan.verified.length < MIN_DEMO_DETAILS) continue;

    const others = entries
      .filter((e) => e.schoolId !== school.id)
      .map((e) => {
        const other = schoolById.get(e.schoolId)!;
        return { entry: e, school: other, facts: scopedFacts(usableFor(other), e.unitId) };
      });
    const compared: ComparedSchool[] = others.map((o) => ({
      schoolId: o.school.id,
      name: o.school.name,
      shortName: o.school.shortName,
      researched: o.facts.length > 0,
    }));
    const unit = target.unitId ? school.units.find((u) => u.id === target.unitId) ?? null : null;
    const corpus = inputs.corpora.find((c) => c.schoolId === school.id);

    const built = await buildDossier({
      dossierId: `landing-demo-${school.id}`,
      applicationId: `landing-demo-${school.id}`,
      student: inputs.student,
      school,
      unitId: target.unitId,
      prompt: { text: prompt.text, wordLimit: prompt.wordLimit?.max ?? null },
      verifiedFacts: plan.verified,
      otherSchools: others.map((o) => ({ school: o.school, facts: o.facts })),
      usedLeadAngleKeys: [],
      term: corpus?.term ?? "",
      stats: {
        pagesRead: plan.pages.length,
        pagesBlocked: 0,
        factsConsidered: base.length,
        factsVerified: plan.verified.length,
        factsRejected: 0,
        durationMs: 0,
      },
    });

    const dossier = keepVerifiedOnly(built, plan.verified);
    if (dossier.details.length < MIN_DEMO_DETAILS) continue;

    const top = [...dossier.details].sort((a, b) => a.rank - b.rank)[0];
    const topFact = plan.verified.find((f) => f.id === top.factId)!;
    const citation: LandingCitation = {
      factId: top.factId,
      kind: top.kind,
      title: top.title,
      quote: topFact.quote,
      sourceUrl: topFact.sourceUrl,
      verifiedAt: topFact.verifiedAt!.slice(0, 10),
      nameOnPage: topFact.nameOnPage?.trim() || null,
      officialDomain: officialDomainFor(topFact.sourceUrl, school),
    };
    const unitLabel = unit ? (unit.shortName ?? unit.name) : null;

    return {
      source: "corpus",
      school: { id: school.id, name: school.name, shortName: school.shortName },
      unit: unit ? { name: unit.name, shortName: unit.shortName ?? null } : null,
      prompt: {
        text: prompt.text,
        wordLimit: prompt.wordLimit?.max ?? null,
        sourceUrl: prompt.sourceUrl,
        verifiedAt: prompt.verifiedAt,
      },
      student: { activityCount: inputs.student.activities.length, intendedMajors: [...inputs.student.intendedMajors] },
      events: researchEvents({
        school,
        unitLabel,
        baseFacts: base.length,
        basePages: new Set(base.map((f) => f.sourceUrl)).size,
        pages: plan.pages,
        dossier,
        student: inputs.student,
        compared,
      }),
      verifiedOn: Object.fromEntries(plan.verified.map((f) => [f.id, f.verifiedAt!.slice(0, 10)])),
      dossier,
      summary: dossierSummary(dossier),
      compared,
      citation,
      corpusStats: corpusStats(inputs.schools, inputs.corpora),
    };
  }
  return null;
}

function rankOf(order: string[], schoolId: string): number {
  const i = order.indexOf(schoolId);
  return i === -1 ? order.length : i;
}

/**
 * Safety net, as in the research pipeline: a detail survives only if it is one
 * of the facts confirmed in this run, and it is cited to that fact's page,
 * quote, and verification date.
 */
function keepVerifiedOnly(dossier: Dossier, verified: Fact[]): Dossier {
  const byId = new Map(verified.map((f) => [f.id, f]));
  const details = [...dossier.details]
    .sort((a, b) => a.rank - b.rank)
    .filter((d) => byId.has(d.factId))
    .map((d, i) => {
      const f = byId.get(d.factId)!;
      return { ...d, rank: i + 1, sourceUrl: f.sourceUrl, quote: f.quote, verifiedAt: f.verifiedAt!.slice(0, 10) };
    });
  return {
    ...dossier,
    details,
    angles: dossier.angles.map((a) => ({ ...a, factIds: a.factIds.filter((id) => byId.has(id)) })),
    questions: dossier.questions.map((q) => (q.factId && !byId.has(q.factId) ? { ...q, factId: undefined } : q)),
  };
}

/* ------------------------------------------------------------------ */
/* Example fallback (fictional example.edu)                            */
/* ------------------------------------------------------------------ */

/** The demo built from the fictional example.edu fixture. The page labels it "Example". */
export function exampleLandingDemo(student: StudentProfile): LandingDemo {
  const dossier = EXAMPLE_DOSSIER;
  const details = [...dossier.details].sort((a, b) => a.rank - b.rank);
  const pages: EventInput["pages"] = [];
  for (const d of details) {
    let page = pages.find((p) => p.url === d.sourceUrl);
    if (!page) {
      page = { url: d.sourceUrl, title: d.sourceTitle, facts: [] };
      pages.push(page);
    }
    page.facts.push({ id: d.factId, title: d.title, kind: d.kind, sourceUrl: d.sourceUrl, quote: d.quote, commonness: "moderate" });
  }
  const compared: ComparedSchool[] = [];
  for (const d of details) {
    for (const r of d.swap) {
      if (!compared.some((c) => c.schoolId === r.schoolId)) {
        compared.push({ schoolId: r.schoolId, name: r.schoolName, shortName: r.schoolName, researched: r.status !== "unknown" });
      }
    }
  }
  const top = details[0];
  const school = { id: dossier.schoolId, name: dossier.schoolName, shortName: "Example" };
  return {
    source: "example",
    school,
    unit: dossier.unitName ? { name: dossier.unitName, shortName: null } : null,
    prompt: { text: dossier.prompt.text, wordLimit: dossier.prompt.wordLimit, sourceUrl: null, verifiedAt: null },
    student: { activityCount: student.activities.length, intendedMajors: [...student.intendedMajors] },
    events: researchEvents({
      school,
      unitLabel: dossier.unitName,
      baseFacts: details.length,
      basePages: pages.length,
      pages,
      dossier,
      student,
      compared,
    }),
    verifiedOn: Object.fromEntries(details.map((d) => [d.factId, d.verifiedAt])),
    dossier,
    summary: dossierSummary(dossier),
    compared,
    citation: {
      factId: top.factId,
      kind: top.kind,
      title: top.title,
      quote: top.quote,
      sourceUrl: top.sourceUrl,
      verifiedAt: top.verifiedAt,
      nameOnPage: null,
      officialDomain: "example.edu",
    },
    corpusStats: null,
  };
}

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

const sampleStudent = sampleStudentJson as unknown as StudentProfile;

let cached: Promise<LandingDemo> | null = null;

/**
 * The landing demo from the bundled research bases and the sample student,
 * computed once per server process (the page itself is prerendered at build).
 */
export function getLandingDemo(): Promise<LandingDemo> {
  if (!cached) {
    cached = buildLandingDemo({ student: sampleStudent, schools: listSchools(), corpora: seedCorpora() })
      .then((demo) => demo ?? exampleLandingDemo(sampleStudent))
      .catch((err: unknown) => {
        console.warn(`Landing demo: using the example data because the research bases could not produce a dossier (${(err as Error)?.message ?? err}).`);
        return exampleLandingDemo(sampleStudent);
      });
  }
  return cached;
}
