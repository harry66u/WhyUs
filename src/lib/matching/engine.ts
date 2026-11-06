/**
 * Matching engine: ranks verified facts against a student's actual activities,
 * runs the swap test, scores uniqueness, proposes essay angles (ideas only),
 * picks questions, and assembles the dossier.
 *
 * CONTRACT (implemented by the matching module):
 * - Works with no API key (deterministic engine). When Claude is available it
 *   may improve explanations, angles, and questions, but must fall back to the
 *   deterministic result on any error.
 * - Never writes essay prose. Angles are one-line ideas.
 * - Never introduces a fact that is not one of the verified candidates.
 *
 * Building blocks (all pure and deterministic):
 *   profile.ts     studentThemes(): activity themes, depth, concrete nouns
 *   features.ts    per-fact themes by field, names, specificity
 *   rank.ts        scoreFacts(): fit and ranking score
 *   select.ts      6-8 diverse details
 *   explain.ts     one plain fit sentence per detail
 *   swap.ts        swapTest() against the other schools on the list
 *   uniqueness.ts  per-detail and per-dossier uniqueness
 *   angles.ts      angle candidates, lead choice, one-line ideas
 *   questions.ts   exactly three questions
 *   coordinate.ts  coordinateAngles() across a student's dossiers
 *   llm.ts         optional Claude pass with strict validation
 */
import {
  RESEARCH_POLICY_NOTE,
  type Dossier,
  type DossierDetail,
  type EssayAngle,
  type Fact,
  type ResearchEvent,
  type School,
  type StudentProfile,
} from "@/lib/types";
import {
  angleCandidates,
  chooseAngles,
  fallbackCandidates,
  toEssayAngle,
  usedLeadsFrom,
  type AngleCandidate,
  type AngleContext,
  type RankedDetail,
} from "./angles";
import { explainFit } from "./explain";
import { improveWithClaude, vocabularyFor, type DraftForClaude } from "./llm";
import { studentThemes } from "./profile";
import { pickQuestions } from "./questions";
import { connectedActivityIds, majorGroups, promptFocus, scoreFacts, type ScoredFact } from "./rank";
import { selectDetails } from "./select";
import { swapTest } from "./swap";
import { round } from "./text";
import { dossierUniqueness, scoreUniqueness } from "./uniqueness";

export { swapTest, isVerifiedFact, type OtherSchool } from "./swap";
export { studentThemes, type StudentThemes, type ActivityProfile } from "./profile";
export { coordinateAngles } from "./coordinate";
export { uniquenessLabel } from "./uniqueness";

export interface RankedFact {
  fact: Fact;
  score: number; // 0-1, how directly it connects to this student's activities and interests
  activityIds: string[];
  themes: string[];
}

export interface RankOptions {
  unitId: string | null;
  promptText?: string;
  limit?: number;
}

/**
 * Preliminary ranking used to choose which facts to verify live.
 * Facts scoped only to other units are left out. Sorted best first; ties by fact id.
 */
export function rankFacts(student: StudentProfile, facts: Fact[], opts: RankOptions): RankedFact[] {
  const scored = scoreFacts(studentThemes(student), facts ?? [], { unitId: opts.unitId, promptText: opts.promptText });
  const ranked = scored.map((s) => ({
    fact: s.fact,
    score: round(s.score, 4),
    activityIds: connectedActivityIds(s),
    themes: s.themes.slice(0, 5),
  }));
  return opts.limit != null && opts.limit >= 0 ? ranked.slice(0, opts.limit) : ranked;
}

export interface BuildDossierInput {
  dossierId: string;
  applicationId: string;
  student: StudentProfile;
  school: School;
  unitId: string | null;
  prompt: { text: string; wordLimit: number | null };
  /** Facts that were confirmed on live official pages during this run. */
  verifiedFacts: Fact[];
  /** The other schools on the student's list with their research bases (for the swap test). */
  otherSchools: { school: School; facts: Fact[] }[];
  /** Angle keys already used as leads in the student's other dossiers. */
  usedLeadAngleKeys: string[];
  term: string;
  stats: Omit<Dossier["stats"], "engine">;
}

export type BuildStage = "match" | "swap" | "assemble";

export interface BuildHooks {
  emit?: (event: ResearchEvent) => void | Promise<void>;
  signal?: AbortSignal;
  /**
   * Optional: called as the engine moves through the match, swap, and assemble
   * stages, so the caller can record stage events at the right moments.
   */
  onStage?: (stage: BuildStage, status: "start" | "done") => void | Promise<void>;
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw signal.reason instanceof Error ? signal.reason : new Error("Dossier build was cancelled");
  }
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The most recent date this fact was confirmed on its live page, or null. */
function verifiedDay(f: Fact): string | null {
  const days: string[] = [];
  if (f.verifiedAt && ISO_DAY.test(f.verifiedAt.slice(0, 10))) days.push(f.verifiedAt.slice(0, 10));
  if (f.verification?.status === "verified" && f.verification.checkedAt) {
    const d = f.verification.checkedAt.slice(0, 10);
    if (ISO_DAY.test(d)) days.push(d);
  }
  return days.sort().pop() ?? null;
}

/** Verified facts for this school only, one per id, each with a confirmation date. */
function usableFacts(input: BuildDossierInput): { facts: Fact[]; verifiedOn: Map<string, string> } {
  const verifiedOn = new Map<string, string>();
  const facts: Fact[] = [];
  for (const f of input.verifiedFacts ?? []) {
    if (!f || f.schoolId !== input.school.id || verifiedOn.has(f.id)) continue;
    if (f.verification?.status === "failed" || f.verification?.status === "unreachable") continue;
    const day = verifiedDay(f);
    if (!day) continue;
    verifiedOn.set(f.id, day);
    facts.push(f);
  }
  return { facts, verifiedOn };
}

function unitNameOf(school: School, unitId: string | null): string | null {
  if (!unitId) return null;
  return school.units?.find((u) => u.id === unitId)?.name ?? null;
}

/**
 * Names a prompt may use for the applicant's unit, when the unit is a college
 * or school inside the university (not the whole school): "Duffield
 * Engineering", "the College", "Wharton".
 */
function unitNamesFor(school: School, unitId: string | null): string[] {
  const unit = unitId ? school.units?.find((u) => u.id === unitId) : undefined;
  if (!unit || unit.name === school.name) return [];
  const schoolNames = new Set([school.name, school.shortName].map((n) => n.toLowerCase()));
  return [unit.name, unit.shortName ?? "", ...(unit.aliases ?? [])].filter((n) => n && n.trim().length >= 3 && !schoolNames.has(n.toLowerCase()));
}

/** Share of the unit-scoped facts that are about each theme: the unit's core subjects. */
function unitThemeShares(scored: ScoredFact[]): Map<string, number> {
  const unitFacts = scored.filter((s) => s.unit === "unit" && (s.fact.unitIds ?? []).length > 0);
  const counts = new Map<string, number>();
  for (const s of unitFacts) for (const k of s.features.central) counts.set(k, (counts.get(k) ?? 0) + 1);
  const out = new Map<string, number>();
  if (unitFacts.length < 3) return out;
  for (const [k, n] of counts) out.set(k, n / unitFacts.length);
  return out;
}

export async function buildDossier(input: BuildDossierInput, hooks: BuildHooks = {}): Promise<Dossier> {
  const { signal } = hooks;
  const emit = async (event: ResearchEvent) => {
    if (hooks.emit) await hooks.emit(event);
  };
  const stage = async (s: BuildStage, status: "start" | "done") => {
    if (hooks.onStage) await hooks.onStage(s, status);
  };
  throwIfAborted(signal);

  const unitName = unitNameOf(input.school, input.unitId);
  const focus = promptFocus(input.prompt?.text ?? "", unitNamesFor(input.school, input.unitId));
  const { facts, verifiedOn } = usableFacts(input);
  const student = studentThemes(input.student);
  const scored = scoreFacts(student, facts, { unitId: input.unitId, focus });
  if (scored.length === 0) {
    throw new Error(
      `No verified facts are available for ${input.school.name}${unitName ? ` (${unitName})` : ""} yet, so there is nothing to build a dossier from.`,
    );
  }

  // Swap test and uniqueness for every candidate first, so that selection can
  // favor uncommon details (cheap: verified facts x other schools' facts).
  const swapById = new Map(scored.map((s) => [s.fact.id, swapTest(s.fact, input.otherSchools ?? [])]));
  const uniqueById = new Map(
    scored.map((s) => [s.fact.id, scoreUniqueness(s.fact, swapById.get(s.fact.id) ?? [], s.features.specificity, s.features.substance)]),
  );
  const value = (s: (typeof scored)[number]) => s.score * (0.72 + 0.28 * ((uniqueById.get(s.fact.id)?.score ?? 50) / 100));

  /* Match ----------------------------------------------------------- */
  await stage("match", "start");
  const selected = selectDetails(scored, { min: 6, max: 8, value, focus });
  const ranked: RankedDetail[] = selected.map((s, i) => ({ scored: s, rank: i + 1, cite: s.cite }));
  const explanations = ranked.map((d) => explainFit(d.scored, d.cite ?? null));
  const fitScore = (d: RankedDetail) => round(d.cite ? d.cite.fit : 0.5 * d.scored.fit, 2);
  for (let i = 0; i < ranked.length; i++) {
    throwIfAborted(signal);
    const s = ranked[i].scored;
    const named = explanations[i].activityId ? student.activities.find((a) => a.id === explanations[i].activityId) : undefined;
    await emit({
      type: "match",
      factId: s.fact.id,
      title: s.fact.title,
      ...(named ? { activityTitle: named.title } : {}),
      score: fitScore(ranked[i]),
      sentence: explanations[i].sentence,
    });
  }
  await stage("match", "done");

  /* Swap test ------------------------------------------------------- */
  await stage("swap", "start");
  const swaps = ranked.map((d) => swapById.get(d.scored.fact.id) ?? []);
  for (let i = 0; i < ranked.length; i++) {
    throwIfAborted(signal);
    const f = ranked[i].scored.fact;
    await emit({
      type: "swap",
      factId: f.id,
      title: f.title,
      results: swaps[i].map((r) => ({
        schoolId: r.schoolId,
        schoolName: r.schoolName,
        status: r.status,
        ...(r.equivalentTitle ? { equivalentTitle: r.equivalentTitle } : {}),
      })),
    });
  }
  await stage("swap", "done");

  /* Assemble -------------------------------------------------------- */
  await stage("assemble", "start");
  const details: DossierDetail[] = ranked.map((d, i) => {
    const s = d.scored;
    const f = s.fact;
    const explanation = explanations[i];
    let activityIds: string[] = [];
    if (explanation.basis === "activity" && explanation.activityId) {
      activityIds = [explanation.activityId, ...connectedActivityIds(s).filter((id) => id !== explanation.activityId)].slice(0, 3);
    }
    const cited = d.cite?.themes ?? [];
    return {
      factId: f.id,
      rank: d.rank,
      kind: f.kind,
      title: f.title,
      summary: f.summary,
      quote: f.quote,
      sourceUrl: f.sourceUrl,
      sourceTitle: f.sourceTitle,
      verifiedAt: verifiedOn.get(f.id) ?? "",
      unitIds: [...(f.unitIds ?? [])],
      fit: {
        sentence: explanation.sentence,
        activityIds,
        themes: [...cited, ...s.themes.filter((t) => !cited.includes(t))].slice(0, 4),
        score: fitScore(d),
      },
      uniqueness: uniqueById.get(f.id) ?? scoreUniqueness(f, swaps[i], s.features.specificity, s.features.substance),
      swap: swaps[i],
    };
  });

  const angleContext: AngleContext = {
    focus,
    majorThemes: new Set(student.majors.flatMap((m) => [...m.themes.keys()])),
    majorGroups: majorGroups(student),
    unitThemes: unitThemeShares(scored),
  };
  let candidates: AngleCandidate[] = angleCandidates(ranked, new Map(details.map((d) => [d.factId, d.uniqueness.score])), angleContext);
  const fallback = fallbackCandidates(ranked, input.school.shortName || input.school.name, new Set(candidates.map((c) => c.key)));
  if (candidates.length < 2) candidates = [...candidates, ...fallback];
  const chosen = chooseAngles(candidates, usedLeadsFrom(input.usedLeadAngleKeys ?? []));
  const shown = [...chosen.shown];
  // Every dossier shows at least two angles that share no detail: a single-detail angle fills in when needed.
  if (shown.length === 1) {
    const taken = new Set(shown[0].factIds);
    const extra = fallback.find((c) => !c.factIds.some((id) => taken.has(id)) && !shown.some((x) => x.key === c.key));
    if (extra) shown.push(extra);
  }
  const shownKeys = new Set(shown.map((c) => c.key));
  const options = [...chosen.options.filter((c) => !shownKeys.has(c.key)), ...fallback.filter((c) => !shownKeys.has(c.key) && !chosen.options.includes(c))].slice(0, 20);
  let angles: EssayAngle[] = shown.map((c, i) => toEssayAngle(c, i === 0));
  let angleOptions: EssayAngle[] = options.map((c) => toEssayAngle(c, false));
  let questions = pickQuestions(ranked, { seed: input.school.id });

  /* Optional Claude pass ---------------------------------------------- */
  let engine: Dossier["stats"]["engine"] = "deterministic";
  throwIfAborted(signal);
  const draft = draftForClaude(input, unitName, ranked, details, [...angles, ...angleOptions], questions, explanations, student);
  const improved = await improveWithClaude(draft, vocabularyFor(draft, input.school, input.student), { signal });
  throwIfAborted(signal);
  if (improved) {
    engine = "llm";
    for (const d of details) {
      const s = improved.sentences.get(d.factId);
      if (s) d.fit.sentence = s;
    }
    const relabel = (a: EssayAngle): EssayAngle => ({ ...a, line: improved.lines.get(a.key) ?? a.line });
    angles = angles.map(relabel);
    angleOptions = angleOptions.map(relabel);
    if (improved.questions) questions = improved.questions;
  }

  for (const a of angles) await emit({ type: "angle", line: a.line, isLead: a.isLead });
  await stage("assemble", "done");

  return {
    id: input.dossierId,
    applicationId: input.applicationId,
    studentId: input.student.id,
    schoolId: input.school.id,
    schoolName: input.school.name,
    unitId: input.unitId,
    unitName,
    prompt: { text: input.prompt?.text ?? "", wordLimit: input.prompt?.wordLimit ?? null },
    generatedAt: new Date().toISOString(),
    term: input.term,
    uniquenessScore: dossierUniqueness(details),
    details,
    angles,
    angleOptions,
    questions,
    policyNote: RESEARCH_POLICY_NOTE,
    stats: { ...input.stats, engine },
  };
}

function draftForClaude(
  input: BuildDossierInput,
  unitName: string | null,
  ranked: RankedDetail[],
  details: DossierDetail[],
  angles: EssayAngle[],
  questions: Dossier["questions"],
  explanations: ReturnType<typeof explainFit>[],
  student: ReturnType<typeof studentThemes>,
): DraftForClaude {
  const titleOf = (id: string) => student.activities.find((a) => a.id === id)?.title ?? "";
  return {
    school: input.school.name,
    unit: unitName,
    prompt: input.prompt?.text ?? "",
    student: {
      activities: (input.student.activities ?? []).map((a) => ({
        id: a.id,
        title: a.title,
        ...(a.role ? { role: a.role } : {}),
        ...(a.organization ? { organization: a.organization } : {}),
        description: a.description,
      })),
      interests: input.student.interests ?? [],
      intendedMajors: input.student.intendedMajors ?? [],
    },
    details: ranked.map((d, i) => {
      const f = d.scored.fact;
      const e = explanations[i];
      const interest = (e.basis === "interest" || e.basis === "major") && d.cite ? d.cite.sourceId : null;
      return {
        factId: f.id,
        kind: f.kind,
        title: f.title,
        nameOnPage: f.nameOnPage,
        summary: f.summary,
        hook: f.hook,
        quote: f.quote,
        activityTitles: details[i].fit.activityIds.map(titleOf).filter(Boolean),
        interest,
        sentence: details[i].fit.sentence,
      };
    }),
    angles: angles.map((a) => ({
      key: a.key,
      activityTitle: a.activityIds[0] ? titleOf(a.activityIds[0]) || null : null,
      theme: a.themes[0] ?? "",
      factIds: a.factIds,
      line: a.line,
    })),
    questions,
  };
}
