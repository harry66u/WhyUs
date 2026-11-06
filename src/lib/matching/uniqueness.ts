/**
 * Uniqueness: how likely a detail is to make an essay specific to this school.
 *
 * Per detail (0-100), from three signals:
 * - commonness: how often applicants cite it (corpus rating by the researcher);
 * - swap test: whether the other schools on the student's list have an
 *   equivalent (schools with no research base are not counted either way);
 * - specificity: course codes, named people, named labs and groups.
 * Commonly cited details are capped below 35 and labeled "Commonly mentioned".
 *
 * Per dossier: rank-weighted mean of its details (rank 1 counts most).
 */
import type { Commonness, DossierDetail, Fact, SwapResult, UniquenessLabel } from "@/lib/types";
import { joinList, tidy } from "./text";

const BASE: Record<Commonness, number> = { rare: 82, moderate: 62, common: 30 };

export function uniquenessLabel(score: number, commonness: Commonness): UniquenessLabel {
  if (commonness === "common" || score < 35) return "Commonly mentioned";
  if (score >= 75) return "Distinctive";
  if (score >= 55) return "Uncommon";
  return "Typical";
}

/** The researcher's commonness note, minus remarks meant for the research team ("useful for the swap test"). */
export function publicCommonnessReason(raw: string | undefined): string {
  const clauses = (raw ?? "")
    .split(/(?<=[.;])\s+/)
    .map((c) => tidy(c.replace(/;$/, "")))
    .filter((c) => c && !/swap test|corpus|research agent|research base|for testing|useful for|equivalents?\b|placeholder|todo/i.test(c));
  const out = clauses.join("; ");
  return out.length <= 140 ? out : "";
}

function commonnessPhrase(fact: Fact): string {
  const reason = publicCommonnessReason(fact.commonnessReason);
  if (reason && fact.commonness !== "rare") return reason;
  switch (fact.commonness) {
    case "common":
      return "Many applicants cite this";
    case "moderate":
      return "Known, but not widely cited";
    default:
      return "A specific detail few applicants mention";
  }
}

function names(results: SwapResult[]): string {
  return joinList(results.map((r) => r.schoolName), "or");
}

function swapPhrase(swap: SwapResult[]): string {
  if (swap.length === 0) return "";
  const known = swap.filter((r) => r.status !== "unknown");
  if (known.length === 0) return "the other schools on your list have not been researched yet";
  const eq = known.filter((r) => r.status === "equivalent");
  const sim = known.filter((r) => r.status === "similar");
  if (eq.length === 0 && sim.length === 0) {
    return known.length <= 3 ? `no equivalent found at ${names(known)}` : `no equivalent found at the ${known.length} other schools researched`;
  }
  if (eq.length === 0) {
    if (sim.length === 1) {
      const r = sim[0];
      return `${r.schoolName} has something similar${r.equivalentTitle && r.equivalentTitle.length <= 60 ? ` (${r.equivalentTitle})` : ""}`;
    }
    return `${sim.length} of your other schools have something similar`;
  }
  if (eq.length === 1) {
    const r = eq[0];
    return `${r.schoolName} has an equivalent${r.equivalentTitle && r.equivalentTitle.length <= 60 ? ` (${r.equivalentTitle})` : ""}`;
  }
  return eq.length === known.length ? `every other school researched has an equivalent` : `${eq.length} of ${known.length} other schools researched have an equivalent`;
}

export interface UniquenessResult {
  score: number;
  label: UniquenessLabel;
  commonlyMentioned: boolean;
  reason: string;
}

/** Below this substance a detail is an amenity, service, collection, or place: never "Distinctive" on rarity alone. */
export const LOW_SUBSTANCE = 0.6;
/** Highest score a low-substance detail can reach ("Uncommon" at most). */
const LOW_SUBSTANCE_CAP = 64;

/**
 * Per-detail uniqueness. `substance` (0-1, default 1) is the detail's
 * essay-worthiness (features.ts): a rare bike map is uncommon, not distinctive,
 * because rarity alone does not make something worth building an essay on.
 */
export function scoreUniqueness(fact: Fact, swap: SwapResult[], specificity: number, substance = 1): UniquenessResult {
  const commonness: Commonness = fact.commonness in BASE ? fact.commonness : "moderate";
  const base = BASE[commonness];
  const spec = 6 * Math.max(0, Math.min(1, specificity));
  const known = swap.filter((r) => r.status !== "unknown");
  let score: number;
  if (known.length > 0) {
    const eq = known.filter((r) => r.status === "equivalent").length;
    const sim = known.filter((r) => r.status === "similar").length;
    const swapScore = 100 * (1 - (eq + 0.5 * sim) / known.length);
    score = 0.55 * base + 0.45 * swapScore + spec;
  } else {
    score = base + spec;
  }
  const sub = Number.isFinite(substance) ? Math.max(0, Math.min(1, substance)) : 1;
  score *= 0.8 + 0.2 * sub;
  const lowSubstance = sub < LOW_SUBSTANCE;
  if (lowSubstance) score = Math.min(score, LOW_SUBSTANCE_CAP);
  if (commonness === "common") score = Math.min(score, 34);
  score = Math.round(Math.max(0, Math.min(100, score)));
  const label = uniquenessLabel(score, commonness);
  const commonlyMentioned = commonness === "common" || label === "Commonly mentioned";

  const first = lowSubstance ? amenityPhrase(fact) : commonnessPhrase(fact);
  const second = swapPhrase(swap);
  let reason = second ? `${first}; ${second}.` : `${first}.`;
  if (reason.length > 200 && second) reason = `${first}.`;
  return { score, label, commonlyMentioned, reason };
}

/** Why a rare but low-substance detail is not rated distinctive. */
function amenityPhrase(fact: Fact): string {
  const what =
    fact.kind === "location"
      ? "A place or local resource"
      : /\b(?:collections?|archives?|sheet music|manuscripts|museums?)\b/i.test(`${fact.title} ${fact.summary}`)
        ? "A collection"
        : /\b(?:library|advis\w*|services?|software|support)\b/i.test(`${fact.title} ${fact.summary} ${fact.hook}`)
          ? "A campus service"
          : "A campus amenity";
  return `${what}: useful color, but rarely what an essay rests on`;
}

/** Rank-weighted mean of detail uniqueness (rank 1 counts most). 0 when there are no details. */
export function dossierUniqueness(details: Pick<DossierDetail, "rank" | "uniqueness">[]): number {
  let num = 0;
  let den = 0;
  for (const d of details) {
    const w = 1 / Math.sqrt(Math.max(1, d.rank));
    num += w * d.uniqueness.score;
    den += w;
  }
  return den > 0 ? Math.round(num / den) : 0;
}
