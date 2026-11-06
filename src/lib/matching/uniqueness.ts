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

export function scoreUniqueness(fact: Fact, swap: SwapResult[], specificity: number): UniquenessResult {
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
  if (commonness === "common") score = Math.min(score, 34);
  score = Math.round(Math.max(0, Math.min(100, score)));
  const label = uniquenessLabel(score, commonness);
  const commonlyMentioned = commonness === "common" || label === "Commonly mentioned";

  const first = commonnessPhrase(fact);
  const second = swapPhrase(swap);
  let reason = second ? `${first}; ${second}.` : `${first}.`;
  if (reason.length > 200 && second) reason = `${first}.`;
  return { score, label, commonlyMentioned, reason };
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
