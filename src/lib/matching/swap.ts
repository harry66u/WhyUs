/**
 * Swap test: for one detail, does something equivalent exist at each of the
 * other schools on the student's list?
 *
 * - equivalent: a verified fact of a compatible kind with the same focus (strong
 *   theme overlap or shared title words), or naming the same everyday campus
 *   thing ("outing club", "makerspace", "jazz ensemble", ...).
 * - similar: comparable but clearly different (partial overlap).
 * - none: that school's verified research has nothing comparable.
 * - unknown: that school has no verified research base yet (never claim "none").
 *
 * Only facts that were verified (or are not known to have failed) count.
 */
import type { Fact, School, SwapResult, SwapStatus } from "@/lib/types";
import { factFeatures, type FactFeatures, type KindFamily } from "./features";
import { themeWeight } from "./themes";

export interface OtherSchool {
  school: School;
  facts: Fact[];
}

const COMPAT: Record<KindFamily, Partial<Record<KindFamily, number>>> = {
  course: { course: 1, study: 0.55, program: 0.45, research: 0.35 },
  study: { study: 1, course: 0.55, program: 0.5 },
  research: { research: 1, facility: 0.6, program: 0.55, course: 0.35 },
  facility: { facility: 1, research: 0.6, group: 0.4, program: 0.4, place: 0.35 },
  group: { group: 1, program: 0.6, tradition: 0.45, facility: 0.4 },
  program: { program: 1, group: 0.6, research: 0.55, study: 0.5, course: 0.45, place: 0.45, tradition: 0.4, facility: 0.4 },
  tradition: { tradition: 1, group: 0.45, program: 0.4, place: 0.4 },
  place: { place: 1, program: 0.45, tradition: 0.4, facility: 0.35, research: 0.35 },
};

export function familyCompat(a: KindFamily, b: KindFamily): number {
  return COMPAT[a]?.[b] ?? COMPAT[b]?.[a] ?? 0.25;
}

/** A fact counts for the swap test unless its last verification failed or it was never verified. */
export function isVerifiedFact(f: Fact): boolean {
  if (f.verification?.status === "failed") return false;
  return Boolean(f.verifiedAt) || f.verification?.status === "verified";
}

interface Prepared {
  school: School;
  facts: { fact: Fact; features: FactFeatures }[];
  /** document frequency of title and summary/hook stems across this school's facts */
  df: Map<string, number>;
  n: number;
}

const prepared = new WeakMap<OtherSchool[], { sig: string; schools: Prepared[] }>();

function prepare(others: OtherSchool[]): Prepared[] {
  const sig = others.map((o) => `${o.school.id}:${o.facts?.length ?? 0}:${o.facts?.[0]?.id ?? ""}`).join("|");
  const hit = prepared.get(others);
  if (hit && hit.sig === sig) return hit.schools;
  const out = others.map(({ school, facts }) => {
    const usable = (facts ?? [])
      .filter((f) => f && f.schoolId === school.id && isVerifiedFact(f))
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((fact) => ({ fact, features: factFeatures(fact) }));
    const df = new Map<string, number>();
    for (const { features } of usable) {
      for (const [s, w] of features.tokens) if (w >= 0.78) df.set(s, (df.get(s) ?? 0) + 1);
    }
    return { school, facts: usable, df, n: usable.length };
  });
  prepared.set(others, { sig, schools: out });
  return out;
}

interface ThemeOverlap {
  /** share of this fact's theme mass the other fact covers */
  coverageA: number;
  /** share of the other fact's theme mass this fact covers */
  coverageB: number;
  jaccard: number;
  /** this fact's theme mass (thin facts cannot be called equivalent on themes alone) */
  massA: number;
}

function themeOverlap(a: FactFeatures, b: FactFeatures): ThemeOverlap {
  let shared = 0;
  let sumA = 0;
  let sumB = 0;
  let union = 0;
  const keys = new Set([...a.themes.keys(), ...b.themes.keys()]);
  for (const k of keys) {
    const w = themeWeight(k);
    const wa = w * (a.themes.get(k) ?? 0);
    const wb = w * (b.themes.get(k) ?? 0);
    shared += Math.min(wa, wb);
    sumA += wa;
    sumB += wb;
    union += Math.max(wa, wb);
  }
  return {
    coverageA: sumA > 0 ? shared / sumA : 0,
    coverageB: sumB > 0 ? shared / sumB : 0,
    jaccard: union > 0 ? shared / union : 0,
    massA: sumA,
  };
}

/**
 * How much of this fact's title the other fact's title shares, weighting rare
 * words most (words common across the other school's facts say little).
 * Words found only in the other fact's summary or hook count half.
 */
function titleOverlap(a: FactFeatures, b: FactFeatures, df: Map<string, number>, n: number): number {
  let total = 0;
  let hit = 0;
  for (const s of a.titleStems) {
    const d = df.get(s) ?? 0;
    const w = Math.log((Math.max(n, 12) + 1) / (d + 0.5));
    total += w;
    if (b.titleStems.has(s)) hit += w;
    else if ((b.tokens.get(s) ?? 0) >= 0.78) hit += 0.5 * w;
  }
  return total > 0 ? hit / total : 0;
}

export interface SwapMatch {
  status: SwapStatus;
  similarity: number;
  fact?: Fact;
}

const RANK: Record<SwapStatus, number> = { equivalent: 2, similar: 1, none: 0, unknown: -1 };

function judge(a: FactFeatures, b: FactFeatures, school: Prepared): { status: SwapStatus; sim: number } {
  const compat = familyCompat(a.family, b.family);
  const t = themeOverlap(a, b);
  const title = titleOverlap(a, b, school.df, school.n);
  const sameThing = [...a.equivalence].some((k) => b.equivalence.has(k));
  const themeSim = 0.4 * t.coverageA + 0.6 * t.jaccard;
  let sim = compat * (0.65 * themeSim + 0.35 * title);
  if (sameThing) sim = Math.max(sim, compat >= 0.6 ? 0.75 : 0.45);
  const mutual = Math.min(t.coverageA, t.coverageB);
  if (compat >= 0.6 && (sameThing || (sim >= 0.5 && mutual >= 0.5 && t.massA >= 1.2))) return { status: "equivalent", sim };
  if (sameThing || sim >= 0.28 || (compat >= 0.45 && mutual >= 0.4)) return { status: "similar", sim };
  return { status: "none", sim };
}

function compare(a: FactFeatures, school: Prepared): SwapMatch {
  if (school.n === 0) return { status: "unknown", similarity: 0 };
  let best: SwapMatch = { status: "none", similarity: 0 };
  for (const { fact, features: b } of school.facts) {
    const { status, sim } = judge(a, b, school);
    if (RANK[status] > RANK[best.status] || (RANK[status] === RANK[best.status] && sim > best.similarity + 1e-9)) {
      best = { status, similarity: sim, fact: status === "none" ? undefined : fact };
    }
  }
  return best;
}

/**
 * Swap test for one fact against the other schools on the student's list.
 * Returns one result per other school, in the order given.
 */
export function swapTest(fact: Fact, otherSchools: OtherSchool[]): SwapResult[] {
  const a = factFeatures(fact);
  return prepare(otherSchools)
    .filter((p) => p.school.id !== fact.schoolId)
    .map((p) => {
      const m = compare(a, p);
      const result: SwapResult = { schoolId: p.school.id, schoolName: p.school.shortName || p.school.name, status: m.status };
      if (m.fact && (m.status === "equivalent" || m.status === "similar")) {
        result.equivalentTitle = m.fact.title;
        result.equivalentUrl = m.fact.sourceUrl;
      }
      return result;
    });
}
