/**
 * The research pipeline for one application:
 *
 *   scope -> discover -> read -> verify -> match -> swap -> assemble
 *
 * - scope: the school, the unit (custom prompts: units named in the prompt), the prompt.
 * - discover: the school's shared research base for that unit; schools without
 *   one are crawled and extracted live when Claude is available.
 * - read + verify: candidates are ranked against the student (rankFacts) and the
 *   best are checked on their live official pages (or the page cache window):
 *   pages are de-duplicated and read about six at a time, and the run keeps going
 *   down the ranking until enough facts of enough different kinds are confirmed.
 *   A fact enters the dossier only if its quote and name are on the page now.
 * - match, swap, assemble: buildDossier (matching engine), then the dossier is
 *   saved and lead angles are re-coordinated across the student's dossiers.
 *
 * Everything external is injected (PipelineDeps) so the pipeline can be tested
 * without a network, a database, or the real matching engine.
 */
import type { BuildDossierInput, BuildHooks, RankedFact, RankOptions } from "@/lib/matching/engine";
import { findUnitsInText, isOfficialUrl } from "@/lib/schools/registry";
import type {
  Dossier,
  Fact,
  ResearchEvent,
  School,
  SchoolUnit,
  StudentProfile,
  VerificationResult,
} from "@/lib/types";
import { createLimiter, joinNames, throwIfAborted, whenAborted } from "./async";
import { CLAUDE_FETCH_NOTE, type ClaudeFetchResult } from "./claude-fetch";
import { CRAWLER_BUILT_BY, pageProblem, pageStatusOf, type CrawlOptions, type CrawlResult } from "./crawler";
import { createStageTracker, STAGE_PROGRESS, type StageTracker } from "./events";
import type { PageSnapshot, PageSource } from "./page-source";
import { currentTerm, isoDate, verifiedThisTerm } from "./term";
import { verifyAgainstPage } from "./verify";

/* ------------------------------------------------------------------ */
/* Contracts                                                           */
/* ------------------------------------------------------------------ */

export interface PipelineApplication {
  id: string;
  studentId: string;
  schoolId: string;
  unitId: string | null;
  promptId: string | null;
  promptText: string;
  wordLimit: number | null;
}

export interface PipelineTiming {
  /** Stop starting new page reads after this long in the read phase. */
  readSoftMs: number;
  /** Stop waiting for slow pages after this long; they are left out of this dossier. */
  readHardMs: number;
  /** Keep reading until this many of the top-ranked candidates are confirmed... */
  targetVerified: number;
  /** ...covering at least this many kinds of detail (when the base has them). */
  minKinds: number;
  /** Candidates ranked below this position do not count toward the target. */
  topWindow: number;
  /** First pass takes at most this many candidates of one kind before the rest. */
  perKindFirstPass: number;
  /** Pages read at the same time. */
  concurrency: number;
  /** Pages read at the same time from one host. */
  perHost: number;
  /** How far down the page order a free slot may reach past a busy host. */
  lookahead: number;
  maxPages: number;
  /** Bot-challenged pages read through Claude's web fetch tool per run. */
  maxClaudeFetches: number;
}

export const DEFAULT_TIMING: PipelineTiming = {
  readSoftMs: 60_000,
  readHardMs: 80_000,
  targetVerified: 12,
  minKinds: 4,
  topWindow: 48,
  perKindFirstPass: 3,
  concurrency: 6,
  perHost: 2,
  lookahead: 10,
  maxPages: 60,
  maxClaudeFetches: 6,
};

/** The fewest confirmed facts a dossier may be built from. */
export const MIN_VERIFIED_FOR_DOSSIER = 3;

export interface PipelineDeps {
  getSchool(id: string): School | undefined;
  loadStudent(studentId: string): Promise<StudentProfile | null>;
  listStudentApplications(studentId: string): Promise<PipelineApplication[]>;
  /** The research base for a school, scoped to a unit (plus university-wide facts). Excludes failed facts. */
  loadSchoolFacts(schoolId: string, unitId: string | null): Promise<Fact[]>;
  pageSource: PageSource;
  recordVerification(factId: string, result: VerificationResult): Promise<void>;
  upsertFacts(facts: Fact[], builtBy: string): Promise<void>;
  rankFacts(student: StudentProfile, facts: Fact[], opts: RankOptions): RankedFact[];
  buildDossier(input: BuildDossierInput, hooks?: BuildHooks): Promise<Dossier>;
  coordinateAngles(dossiers: Dossier[]): Dossier[];
  saveDossier(dossier: Dossier): Promise<void>;
  /** Latest dossier per application for the student. */
  listStudentDossiers(studentId: string): Promise<Dossier[]>;
  llmAvailable(): boolean;
  crawlSchool(opts: CrawlOptions): Promise<CrawlResult>;
  /** Reads a bot-challenged official page through Claude's web fetch tool; null when unavailable. */
  claudeFetch: ((url: string, school: School, signal?: AbortSignal) => Promise<ClaudeFetchResult>) | null;
  newId(): string;
  now(): number;
  timing?: Partial<PipelineTiming>;
}

export interface PipelineHooks {
  emit(event: ResearchEvent): Promise<void>;
  /** Overall progress, 0-100 (monotonic). */
  onProgress?(progress: number): void;
  signal?: AbortSignal;
}

export interface PipelineResult {
  dossier: Dossier;
  /** Dossiers whose angles were re-coordinated (may include this one). */
  changed: Dossier[];
}

export type ResearchErrorCode =
  | "unknown_school"
  | "missing_student"
  | "no_research_base"
  | "too_few_verified"
  | "timeout"
  | "interrupted"
  | "research_failed";

/** A failure with a message written for the person waiting on the research. */
export class ResearchError extends Error {
  constructor(
    message: string,
    readonly code: ResearchErrorCode = "research_failed",
  ) {
    super(message);
    this.name = "ResearchError";
  }
}

export const NO_RESEARCH_BASE_MESSAGE =
  "This school does not have a verified research base yet. Researching a new school live needs Claude, which is not enabled on this server.";

/* ------------------------------------------------------------------ */
/* Pipeline                                                            */
/* ------------------------------------------------------------------ */

interface Candidate {
  fact: Fact;
  score: number;
  rank: number; // 0-based position in the ranking
}

export async function runResearchPipeline(app: PipelineApplication, deps: PipelineDeps, hooks: PipelineHooks): Promise<PipelineResult> {
  const timing: PipelineTiming = { ...DEFAULT_TIMING, ...deps.timing };
  const signal = hooks.signal;
  const started = deps.now();
  const emit = hooks.emit;
  let progressValue = 0;
  const progress = (p: number) => {
    const v = Math.min(99, Math.round(p));
    if (v > progressValue) {
      progressValue = v;
      hooks.onProgress?.(v);
    }
  };
  const stages = createStageTracker(emit, (stage, status) => progress(STAGE_PROGRESS[stage][status]));

  /* scope ----------------------------------------------------------- */
  await stages.start("scope");
  const school = deps.getSchool(app.schoolId);
  if (!school) throw new ResearchError("This school is not in the WhyUs registry, so it cannot be researched.", "unknown_school");
  const student = await deps.loadStudent(app.studentId);
  if (!student) throw new ResearchError("The student profile for this school no longer exists.", "missing_student");
  const scope = resolveScope(school, app);
  if (scope.note) await emit({ type: "log", message: scope.note });
  await stages.done("scope", scope.detail);
  throwIfAborted(signal);

  /* discover -------------------------------------------------------- */
  await stages.start("discover");
  const unitId = scope.unit?.id ?? null;
  const base = await deps.loadSchoolFacts(school.id, unitId);
  let verifiedFacts: Fact[];
  let pagesRead = 0;
  let pagesBlocked = 0;
  let factsRejected = 0;
  let factsConsidered = 0;

  if (base.length === 0) {
    if (!deps.llmAvailable()) {
      const anyFacts = unitId ? (await deps.loadSchoolFacts(school.id, null)).length > 0 : false;
      throw new ResearchError(
        anyFacts && scope.unit
          ? `This school does not have a verified research base for ${scope.unit.name} yet. Researching it live needs Claude, which is not enabled on this server.`
          : NO_RESEARCH_BASE_MESSAGE,
        "no_research_base",
      );
    }
    await emit({
      type: "log",
      message: `${school.shortName} has no verified research base${scope.unit ? ` for ${scope.unit.name}` : ""} yet, so WhyUs is finding and reading its official pages live. The first time takes longer; later students reuse what is confirmed now.`,
    });
    const crawl = await deps.crawlSchool({ school, unit: scope.unit, student, pageSource: deps.pageSource, emit, stages, signal });
    throwIfAborted(signal);
    if (crawl.facts.length) await deps.upsertFacts(crawl.facts, CRAWLER_BUILT_BY);
    pagesRead = crawl.pagesRead;
    pagesBlocked = crawl.pagesBlocked;
    factsRejected = crawl.factsRejected;
    factsConsidered = crawl.facts.length + crawl.factsRejected;
    verifiedFacts = crawl.facts;
  } else {
    let ranked: Candidate[];
    try {
      ranked = normalizeRanking(base, deps.rankFacts(student, base, { unitId, promptText: app.promptText }));
    } catch (err) {
      await emit({ type: "log", message: `Ranking was unavailable (${(err as Error)?.message ?? "error"}); checking facts in research-base order.` });
      ranked = base.map((fact, rank) => ({ fact, score: 0, rank }));
    }
    const pageCount = new Set(base.map((f) => f.sourceUrl)).size;
    await stages.done(
      "discover",
      `${base.length} facts in the ${school.shortName} research base apply to ${scope.unit ? scope.unit.name : school.name}, from ${pageCount} official pages.`,
    );
    await emit({
      type: "log",
      message: `Ranked ${base.length} candidate facts against the activity list and the prompt. Checking the strongest on their live pages first.`,
    });
    throwIfAborted(signal);

    await stages.start("read");
    const outcome = await readAndVerify({ candidates: ranked, school, deps, timing, emit, stages, signal, progress });
    pagesRead = outcome.pagesRead;
    pagesBlocked = outcome.pagesBlocked;
    factsRejected = outcome.rejected;
    factsConsidered = base.length;
    verifiedFacts = outcome.verified.map((c) => c.fact);
    if (outcome.abandoned > 0) {
      await emit({
        type: "log",
        message: `Stopped waiting for ${outcome.abandoned} slow ${outcome.abandoned === 1 ? "page" : "pages"}; ${outcome.abandoned === 1 ? "it is" : "they are"} left out of this dossier.`,
      });
    }
    await stages.done("read", `Read ${outcome.pagesRead} official ${outcome.pagesRead === 1 ? "page" : "pages"}${outcome.pagesBlocked ? `; ${outcome.pagesBlocked} could not be read` : ""}.`);
    await stages.done(
      "verify",
      `${verifiedFacts.length} ${verifiedFacts.length === 1 ? "fact" : "facts"} confirmed on current pages${outcome.rejected ? `; ${outcome.rejected} rejected` : ""}.`,
    );
  }
  throwIfAborted(signal);

  if (verifiedFacts.length < MIN_VERIFIED_FOR_DOSSIER) {
    throw new ResearchError(
      verifiedFacts.length === 0
        ? `None of the candidate facts could be confirmed on ${school.shortName}'s current official pages, so there is no dossier yet. Some school sites block or slow automated reading; try again later.`
        : `Only ${verifiedFacts.length} ${verifiedFacts.length === 1 ? "fact" : "facts"} could be confirmed on ${school.shortName}'s current official pages, which is not enough for a dossier. Some school sites block or slow automated reading; try again later.`,
      "too_few_verified",
    );
  }

  /* match, swap, assemble ------------------------------------------- */
  const others = await loadOtherSchools(app, deps);
  const earlier = await deps.listStudentDossiers(app.studentId);
  const usedLeadAngleKeys = [
    ...new Set(
      earlier
        .filter((d) => d.applicationId !== app.id)
        .map((d) => d.angles.find((a) => a.isLead)?.key)
        .filter((k): k is string => Boolean(k)),
    ),
  ];
  const noBase = others.filter((o) => o.facts.length === 0).map((o) => o.school.shortName);
  const swapDetail =
    others.length === 0
      ? "No other schools on the list yet, so there is nothing to swap against."
      : `Checked each detail against ${joinNames(others.map((o) => o.school.shortName))}.${
          noBase.length
            ? ` ${joinNames(noBase)} ${noBase.length === 1 ? "has" : "have"} no verified research base yet, so ${noBase.length === 1 ? "its" : "their"} results show as unknown.`
            : ""
        }`;

  let matches = 0;
  const matchDetail = (fallback?: number) => {
    const n = matches || fallback || 0;
    return n ? `${n} verified ${n === 1 ? "fact" : "facts"} matched to the activity list.` : undefined;
  };
  const engineEmit = async (event: ResearchEvent) => {
    if (signal?.aborted) return;
    switch (event.type) {
      case "stage":
        await stages.observe(event);
        return;
      case "done":
        return; // the runner announces completion after saving
      case "error":
        await emit({ type: "log", message: event.message });
        return;
      case "match":
        matches++;
        break;
      case "swap":
        if (!stages.isStarted("swap")) {
          await stages.done("match", matchDetail());
          await stages.start("swap");
        }
        break;
      case "angle":
        if (!stages.isStarted("assemble")) {
          await stages.done("match", matchDetail());
          if (!stages.isDone("swap")) await stages.done("swap", swapDetail);
          await stages.start("assemble");
        }
        break;
    }
    await emit(event);
  };

  await stages.start("match");
  const built = await deps.buildDossier(
    {
      dossierId: deps.newId(),
      applicationId: app.id,
      student,
      school,
      unitId,
      prompt: { text: app.promptText, wordLimit: app.wordLimit },
      verifiedFacts,
      otherSchools: others,
      usedLeadAngleKeys,
      term: currentTerm(new Date(deps.now())),
      stats: {
        pagesRead,
        pagesBlocked,
        factsConsidered,
        factsVerified: verifiedFacts.length,
        factsRejected,
        durationMs: deps.now() - started,
      },
    },
    { emit: engineEmit, signal },
  );
  throwIfAborted(signal);
  const dossier = enforceVerified(built, verifiedFacts);
  if (dossier.details.length < built.details.length) {
    await emit({
      type: "log",
      message: `Left out ${built.details.length - dossier.details.length} ${built.details.length - dossier.details.length === 1 ? "detail" : "details"} that ${built.details.length - dossier.details.length === 1 ? "was" : "were"} not confirmed in this run.`,
    });
  }
  await stages.done("match", matchDetail(dossier.details.length));
  if (!stages.isDone("swap")) await stages.done("swap", swapDetail);
  await stages.start("assemble");

  dossier.stats = { ...dossier.stats, durationMs: deps.now() - started };
  await deps.saveDossier(dossier);
  const changed = await withStudentLock(app.studentId, async () => {
    const latest = await deps.listStudentDossiers(app.studentId);
    const list = latest.some((d) => d.id === dossier.id) ? latest : [...latest.filter((d) => d.applicationId !== app.id), dossier];
    const updated = deps.coordinateAngles(list);
    for (const d of updated) await deps.saveDossier(d);
    return updated;
  });
  const final = changed.find((d) => d.id === dossier.id) ?? dossier;
  const leadBefore = dossier.angles.find((a) => a.isLead)?.key;
  const leadAfter = final.angles.find((a) => a.isLead);
  if (leadAfter && leadAfter.key !== leadBefore) {
    await emit({ type: "log", message: "Changed the lead angle so it does not repeat the lead of another school on the list." });
    await emit({ type: "angle", line: leadAfter.line, isLead: true });
  }
  const adjusted = changed.filter((d) => d.id !== dossier.id).map((d) => d.schoolName);
  if (adjusted.length) {
    await emit({ type: "log", message: `Adjusted the lead angle for ${joinNames(adjusted)} so no two schools lead with the same angle.` });
  }
  await stages.done(
    "assemble",
    `${final.details.length} details, ${final.angles.length} angles, and ${final.questions.length} questions. Uniqueness ${Math.round(final.uniquenessScore)}.`,
  );
  return { dossier: final, changed };
}

/* ------------------------------------------------------------------ */
/* Scope                                                               */
/* ------------------------------------------------------------------ */

export function resolveScope(school: School, app: Pick<PipelineApplication, "unitId" | "promptId" | "promptText">): {
  unit: SchoolUnit | undefined;
  detail: string;
  note?: string;
} {
  const chosen = app.unitId ? school.units.find((u) => u.id === app.unitId) : undefined;
  const named = findUnitsInText(school, app.promptText);
  const everyone = `plus opportunities open to all ${school.shortName} undergraduates`;
  if (chosen) {
    const other = !app.promptId ? named.find((u) => u.id !== chosen.id && u.name !== school.name) : undefined;
    return {
      unit: chosen,
      detail: chosen.name === school.name ? `Scoped to all of ${school.name}.` : `Scoped to ${chosen.name}, ${everyone}.`,
      note: other ? `The prompt also mentions ${other.name}; research stays with ${chosen.name}, the unit on this application.` : undefined,
    };
  }
  if (named.length === 1) {
    return { unit: named[0], detail: `The prompt names ${named[0].name}, so research is scoped to it, ${everyone}.` };
  }
  return { unit: undefined, detail: `Scoped to all of ${school.name}.` };
}

/* ------------------------------------------------------------------ */
/* Read and verify                                                     */
/* ------------------------------------------------------------------ */

function normalizeRanking(facts: Fact[], ranked: RankedFact[]): Candidate[] {
  const seen = new Set<string>();
  const sorted = (ranked ?? [])
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r && r.fact && typeof r.fact.id === "string")
    .sort((a, b) => (Number(b.r.score) || 0) - (Number(a.r.score) || 0) || a.i - b.i);
  const out: Candidate[] = [];
  for (const { r } of sorted) {
    if (seen.has(r.fact.id)) continue;
    seen.add(r.fact.id);
    out.push({ fact: r.fact, score: Number(r.score) || 0, rank: out.length });
  }
  for (const fact of facts) {
    if (seen.has(fact.id)) continue;
    seen.add(fact.id);
    out.push({ fact, score: 0, rank: out.length });
  }
  return out;
}

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

function hostKey(url: string): string {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return url;
  }
}

function relativeAge(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  const hours = Math.round(minutes / 60);
  return `${hours} ${hours === 1 ? "hour" : "hours"}`;
}

function pageReason(page: PageSnapshot, via: "direct" | "claude", claudeProblem: string | undefined, nowMs: number): string | undefined {
  if (page.ok) {
    if (via === "claude") return "read through Claude's web fetch tool after a bot challenge";
    if (page.fromCache) {
      const age = nowMs - Date.parse(page.fetchedAt);
      return Number.isFinite(age) ? `using the copy read ${relativeAge(age)} ago` : "using a recent copy";
    }
    return undefined;
  }
  const problem = pageProblem(page);
  if (claudeProblem) return `${problem.replace(/; skipped$/, "")}; ${claudeProblem}; skipped`;
  return problem;
}

function rejectionReason(result: VerificationResult, page: PageSnapshot, fact: Fact): string {
  if (!page.ok) {
    if (page.status === 404 || page.status === 410) return `the page no longer exists (HTTP ${page.status})`;
    if (page.blockedReason === "off-domain-redirect") return "the page now redirects off the school's official domains";
    if (page.blockedReason === "not-official") return "the source is not an official school page";
    return `could not be checked: ${page.host || hostKey(page.url)} ${pageProblem(page).replace(/; skipped$/, "")}`;
  }
  const detail = result.detail ?? "";
  if (detail.startsWith("Quoted text")) return "the quoted text is no longer on the page";
  if (detail.startsWith("Name")) return `"${fact.nameOnPage}" no longer appears on the page`;
  if (detail.includes("redirected off")) return "the page now redirects off the school's official domains";
  if (detail.includes("not on an official")) return "the source is not an official school page";
  return detail ? detail.charAt(0).toLowerCase() + detail.slice(1) : "could not be confirmed on the current page";
}

function failedSnapshot(url: string, err: unknown): PageSnapshot {
  return {
    url,
    finalUrl: url,
    host: hostKey(url),
    status: 0,
    ok: false,
    title: "",
    text: "",
    mainText: "",
    links: [],
    headings: [],
    contentHash: null,
    fetchedAt: new Date().toISOString(),
    ms: 0,
    problem: (err as Error)?.message || "could not be read",
    fromCache: false,
  };
}

interface ReadOutcome {
  verified: Candidate[];
  rejected: number;
  pagesRead: number;
  pagesBlocked: number;
  /** Pages still being read when the phase stopped waiting. */
  abandoned: number;
}

async function readAndVerify(args: {
  candidates: Candidate[];
  school: School;
  deps: PipelineDeps;
  timing: PipelineTiming;
  emit: (event: ResearchEvent) => Promise<void>;
  stages: StageTracker;
  signal?: AbortSignal;
  progress: (p: number) => void;
}): Promise<ReadOutcome> {
  const { candidates, school, deps, timing, stages, signal } = args;
  const phaseStart = deps.now();
  let open = true;
  const emit = async (event: ResearchEvent) => {
    if (open) await args.emit(event);
  };

  // Pages in the order of their best candidate (diversity-aware ranking).
  const byUrl = new Map<string, Candidate[]>();
  const pageOrder: string[] = [];
  for (const c of diversityOrder(candidates, timing.perKindFirstPass)) {
    const url = c.fact.sourceUrl;
    let list = byUrl.get(url);
    if (!list) {
      list = [];
      byUrl.set(url, list);
      pageOrder.push(url);
    }
    list.push(c);
  }
  const kindsNeeded = Math.min(timing.minKinds, new Set(candidates.map((c) => c.fact.kind)).size);
  const target = Math.min(timing.targetVerified, candidates.filter((c) => c.rank < timing.topWindow).length);

  const verified: Candidate[] = [];
  const decided = new Set<string>();
  const scheduled = new Set<string>();
  const hostActive = new Map<string, number>();
  let rejected = 0;
  let pagesRead = 0;
  let pagesBlocked = 0;
  let pagesStarted = 0;
  let inFlight = 0;
  let cursor = 0;
  let claudeLeft = deps.claudeFetch ? timing.maxClaudeFetches : 0;
  const claudeLimit = createLimiter(2);
  let waiters: (() => void)[] = [];
  const wakeAll = () => {
    const list = waiters;
    waiters = [];
    for (const w of list) w();
  };
  const waitForChange = () =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 500);
      waiters.push(() => {
        clearTimeout(timer);
        resolve();
      });
    });

  const verifiedTop = () => verified.reduce((n, c) => n + (c.rank < timing.topWindow ? 1 : 0), 0);
  const enough = () => verifiedTop() >= target && new Set(verified.map((c) => c.fact.kind)).size >= kindsNeeded;
  const report = () => {
    const byCount = target ? verifiedTop() / target : 1;
    const byTime = (deps.now() - phaseStart) / timing.readSoftMs;
    args.progress(STAGE_PROGRESS.read.start + (STAGE_PROGRESS.verify.done - STAGE_PROGRESS.read.start) * Math.min(1, Math.max(byCount, byTime)));
  };

  type Pick = { kind: "page"; url: string } | { kind: "wait" } | { kind: "stop" };
  const pick = (): Pick => {
    if (signal?.aborted || !open) return { kind: "stop" };
    if (deps.now() - phaseStart >= timing.readSoftMs) return { kind: "stop" };
    if (enough() || pagesStarted >= timing.maxPages) return { kind: "stop" };
    while (cursor < pageOrder.length && scheduled.has(pageOrder[cursor])) cursor++;
    if (cursor >= pageOrder.length) return { kind: "stop" };
    let looked = 0;
    for (let i = cursor; i < pageOrder.length && looked < timing.lookahead; i++) {
      const url = pageOrder[i];
      if (scheduled.has(url)) continue;
      looked++;
      if ((hostActive.get(hostKey(url)) ?? 0) < timing.perHost) return { kind: "page", url };
    }
    return { kind: "wait" };
  };

  const processPage = async (url: string) => {
    const cands = (byUrl.get(url) ?? []).filter((c) => !decided.has(c.fact.id));
    for (const c of cands) decided.add(c.fact.id);
    await emit({ type: "page", url, status: "reading" });
    let page: PageSnapshot;
    try {
      page = await deps.pageSource.load(url, { isAllowedUrl: (u) => isOfficialUrl(u, school) });
    } catch (err) {
      if (signal?.aborted) throw err;
      page = failedSnapshot(url, err);
    }
    let via: "direct" | "claude" = "direct";
    let claudeProblem: string | undefined;
    if (!page.ok && page.blockedReason === "bot-challenge" && deps.claudeFetch && claudeLeft > 0 && open) {
      claudeLeft--;
      await emit({ type: "page", url, status: "blocked", ms: page.ms || undefined, reason: "answered with a bot challenge; asking Claude's web fetch tool to read it" });
      await emit({ type: "page", url, status: "reading", reason: "reading through Claude's web fetch tool" });
      const fetcher = deps.claudeFetch;
      const alt = await claudeLimit(() => fetcher(url, school, signal)).catch(
        (err): ClaudeFetchResult => ({ ok: false, problem: (err as Error)?.message ?? "Claude's web fetch tool failed" }),
      );
      if (alt.ok) {
        page = alt.page;
        via = "claude";
      } else claudeProblem = alt.problem;
    }
    const status = pageStatusOf(page);
    if (open) {
      if (status === "read" || status === "cached") pagesRead++;
      else pagesBlocked++;
    }
    await emit({ type: "page", url, title: page.title || undefined, status, ms: page.ms || undefined, reason: pageReason(page, via, claudeProblem, deps.now()) });

    for (const c of cands) {
      let result = verifyAgainstPage(c.fact, page, school);
      if (via === "claude") {
        result = {
          ...result,
          detail: result.status === "verified" ? CLAUDE_FETCH_NOTE : `${result.detail ?? "Not confirmed"} (${CLAUDE_FETCH_NOTE.charAt(0).toLowerCase()}${CLAUDE_FETCH_NOTE.slice(1)})`,
        };
      }
      // The shared research base benefits even if this run has stopped waiting.
      await deps.recordVerification(c.fact.id, result).catch(() => {});
      if (!open) continue;
      if (!stages.isStarted("verify")) await stages.start("verify");
      if (result.status === "verified") {
        const fact: Fact = { ...c.fact, verifiedAt: isoDate(new Date(result.checkedAt)), verification: result };
        verified.push({ ...c, fact });
        await emit({
          type: "fact",
          factId: fact.id,
          title: fact.title,
          kind: fact.kind,
          url: fact.sourceUrl,
          status: "verified",
          quote: fact.quote,
          commonness: fact.commonness,
        });
      } else {
        rejected++;
        await emit({
          type: "fact",
          factId: c.fact.id,
          title: c.fact.title,
          kind: c.fact.kind,
          url: c.fact.sourceUrl,
          status: "rejected",
          reason: rejectionReason(result, page, c.fact),
          commonness: c.fact.commonness,
        });
      }
    }
  };

  const worker = async () => {
    for (;;) {
      const next = pick();
      if (next.kind === "stop") return;
      if (next.kind === "wait") {
        await waitForChange();
        continue;
      }
      const { url } = next;
      const host = hostKey(url);
      scheduled.add(url);
      pagesStarted++;
      inFlight++;
      hostActive.set(host, (hostActive.get(host) ?? 0) + 1);
      try {
        await processPage(url);
      } finally {
        inFlight--;
        hostActive.set(host, Math.max(0, (hostActive.get(host) ?? 1) - 1));
        wakeAll();
        if (open) report();
      }
    }
  };

  const all = Promise.all(Array.from({ length: Math.max(1, timing.concurrency) }, () => worker()));
  all.catch(() => {});
  let hardTimer: ReturnType<typeof setTimeout> | undefined;
  const hardStop = new Promise<"timeout">((resolve) => {
    hardTimer = setTimeout(() => resolve("timeout"), Math.max(0, timing.readHardMs - (deps.now() - phaseStart)));
  });
  try {
    await Promise.race([all.then(() => "done" as const), hardStop, ...(signal ? [whenAborted(signal)] : [])]);
  } finally {
    clearTimeout(hardTimer);
    open = false;
    wakeAll();
  }
  return { verified: [...verified], rejected, pagesRead, pagesBlocked, abandoned: inFlight };
}

/* ------------------------------------------------------------------ */
/* Swap test inputs, invariants, coordination                          */
/* ------------------------------------------------------------------ */

async function loadOtherSchools(app: PipelineApplication, deps: PipelineDeps): Promise<{ school: School; facts: Fact[] }[]> {
  const apps = await deps.listStudentApplications(app.studentId);
  const today = new Date(deps.now());
  const bySchool = new Map<string, { school: School; facts: Map<string, Fact> }>();
  for (const other of apps) {
    if (other.id === app.id || other.schoolId === app.schoolId) continue;
    const school = deps.getSchool(other.schoolId);
    if (!school) continue;
    let entry = bySchool.get(school.id);
    if (!entry) {
      entry = { school, facts: new Map() };
      bySchool.set(school.id, entry);
    }
    const facts = await deps.loadSchoolFacts(school.id, other.unitId);
    for (const f of facts) {
      // Only details confirmed this term count as evidence that an equivalent exists.
      if (f.verification?.status !== "failed" && verifiedThisTerm(f.verifiedAt, today)) entry.facts.set(f.id, f);
    }
  }
  return [...bySchool.values()].map((e) => ({ school: e.school, facts: [...e.facts.values()] }));
}

/**
 * Safety net around the matching engine: a dossier may only contain facts that
 * were confirmed in this run, cited to the page and date of that confirmation.
 */
function enforceVerified(dossier: Dossier, verifiedFacts: Fact[]): Dossier {
  const byId = new Map(verifiedFacts.map((f) => [f.id, f]));
  const details = dossier.details
    .filter((d) => byId.has(d.factId))
    .map((d, i) => {
      const f = byId.get(d.factId)!;
      return { ...d, rank: i + 1, sourceUrl: f.sourceUrl, quote: f.quote, verifiedAt: f.verifiedAt ?? d.verifiedAt };
    });
  return {
    ...dossier,
    details,
    angles: dossier.angles.map((a) => ({ ...a, factIds: a.factIds.filter((id) => byId.has(id)) })),
    questions: dossier.questions.map((q) => (q.factId && !byId.has(q.factId) ? { ...q, factId: undefined } : q)),
  };
}

const lockState = globalThis as unknown as { __whyusStudentLocks?: Map<string, Promise<void>> };

/** Serializes work per student (angle coordination reads and writes all of a student's dossiers). */
export async function withStudentLock<T>(studentId: string, fn: () => Promise<T>): Promise<T> {
  if (!lockState.__whyusStudentLocks) lockState.__whyusStudentLocks = new Map();
  const locks = lockState.__whyusStudentLocks;
  const previous = locks.get(studentId) ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => mine);
  locks.set(studentId, tail);
  await previous;
  try {
    return await fn();
  } finally {
    release();
    if (locks.get(studentId) === tail) locks.delete(studentId);
  }
}
