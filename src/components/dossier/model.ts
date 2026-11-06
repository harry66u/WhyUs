/**
 * Presentation model for dossier briefings.
 *
 * The screen components, the shared view, and the PDF export all read their
 * wording, bands, and ordering from here so every surface says the same thing.
 * Pure functions only: safe in server components, client components, and PDF code.
 */
import { kindLabel, plural } from "@/lib/format";
import { getSchool } from "@/lib/schools/registry";
import type {
  Dossier,
  DossierDetail,
  DossierQuestion,
  EssayAngle,
  SwapResult,
  SwapStatus,
  UniquenessLabel,
} from "@/lib/types";

/* ------------------------------------------------------------------ */
/* Dossier uniqueness score                                            */
/* ------------------------------------------------------------------ */

export type ScoreTone = "accent" | "mid" | "neutral";

export interface ScoreBand {
  min: number;
  max: number;
  label: string;
  tone: ScoreTone;
}

/**
 * Bands for the dossier-level score scale. The dossier score is a rank-weighted
 * mean of detail scores, so the bands use the matching engine's detail
 * thresholds (35 / 55 / 75); the accent appears only in "Distinctive".
 */
export const SCORE_BANDS: readonly ScoreBand[] = [
  { min: 0, max: 35, label: "Common", tone: "neutral" },
  { min: 35, max: 55, label: "Typical", tone: "neutral" },
  { min: 55, max: 75, label: "Uncommon", tone: "mid" },
  { min: 75, max: 100, label: "Distinctive", tone: "accent" },
];

export function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function scoreBand(score: number): ScoreBand {
  const value = clampScore(score);
  for (let i = SCORE_BANDS.length - 1; i >= 0; i--) {
    if (value >= SCORE_BANDS[i].min) return SCORE_BANDS[i];
  }
  return SCORE_BANDS[0];
}

/** Fill tone of a five-segment detail meter; mirrors the UniquenessMeter primitive (70 / 45). */
export function meterTone(score: number): ScoreTone {
  const value = clampScore(score);
  return value >= 70 ? "accent" : value >= 45 ? "mid" : "neutral";
}

/** How much of a band the score fills, 0-1. */
export function bandFill(score: number, band: ScoreBand): number {
  const value = clampScore(score);
  if (value >= band.max) return 1;
  if (value <= band.min) return 0;
  return (value - band.min) / (band.max - band.min);
}

/* ------------------------------------------------------------------ */
/* Details                                                             */
/* ------------------------------------------------------------------ */

/** Details in rank order (the stored order is not trusted). */
export function rankedDetails(dossier: Pick<Dossier, "details">): DossierDetail[] {
  return [...(dossier.details ?? [])].sort((a, b) => a.rank - b.rank);
}

/** The label a detail carries. Overused details always read "Commonly mentioned". */
export function uniquenessLabel(detail: DossierDetail): UniquenessLabel {
  return detail.uniqueness.commonlyMentioned ? "Commonly mentioned" : detail.uniqueness.label;
}

export function isTopRanked(detail: Pick<DossierDetail, "rank">): boolean {
  return detail.rank <= 3;
}

export { kindLabel };

/**
 * Where a detail sits inside the school: the student's own unit, all
 * undergraduates, or another named unit. Null when the scope is unknown.
 */
export function detailScope(
  detail: Pick<DossierDetail, "unitIds">,
  dossier: Pick<Dossier, "schoolId" | "unitId" | "unitName">,
): string | null {
  const ids = detail.unitIds;
  if (!Array.isArray(ids)) return null;
  if (ids.length === 0) return "Open to all undergraduates";
  if (dossier.unitId && ids.includes(dossier.unitId)) {
    return dossier.unitName ?? unitName(dossier.schoolId, dossier.unitId);
  }
  const names = ids.map((id) => unitName(dossier.schoolId, id)).filter((n): n is string => Boolean(n));
  return names.length > 0 ? names.join(", ") : null;
}

function unitName(schoolId: string, unitId: string): string | null {
  return getSchool(schoolId)?.units.find((u) => u.id === unitId)?.name ?? null;
}

const LABEL_ORDER: UniquenessLabel[] = ["Distinctive", "Uncommon", "Typical", "Commonly mentioned"];

/** "2 distinctive, 1 uncommon, 1 commonly mentioned" (zero counts left out). */
export function labelCountsText(details: DossierDetail[]): string | null {
  if (details.length === 0) return null;
  const counts = new Map<UniquenessLabel, number>();
  for (const d of details) counts.set(uniquenessLabel(d), (counts.get(uniquenessLabel(d)) ?? 0) + 1);
  const parts = LABEL_ORDER.filter((l) => counts.get(l)).map((l) => `${counts.get(l)} ${l.toLowerCase()}`);
  return parts.length > 0 ? `${plural(details.length, "detail")}: ${parts.join(", ")}` : null;
}

/* ------------------------------------------------------------------ */
/* Swap test                                                           */
/* ------------------------------------------------------------------ */

export const SWAP_STATUS_LABELS: Record<SwapStatus, string> = {
  equivalent: "Equivalent",
  similar: "Similar",
  none: "No equivalent found",
  unknown: "Not researched yet",
};

/** The text after the school name in a swap row, split so the title can be a link. */
export function swapOutcome(result: SwapResult): { status: string; title: string | null } {
  const title = result.equivalentTitle?.trim() || null;
  switch (result.status) {
    case "equivalent":
      return title ? { status: "Equivalent:", title } : { status: "Has an equivalent", title: null };
    case "similar":
      return title ? { status: "Similar:", title } : { status: "Has something similar", title: null };
    case "none":
      return { status: SWAP_STATUS_LABELS.none, title: null };
    default:
      return { status: SWAP_STATUS_LABELS.unknown, title: null };
  }
}

/** Plain-text version of a swap row, e.g. for screen-reader labels and tests. */
export function swapText(result: SwapResult): string {
  const { status, title } = swapOutcome(result);
  return title ? `${status} ${title}` : status;
}

/* ------------------------------------------------------------------ */
/* Angles and questions                                                */
/* ------------------------------------------------------------------ */

/** Lead angle first, then the others in their stored order. */
export function orderedAngles(angles: EssayAngle[]): EssayAngle[] {
  return [...(angles ?? [])].sort((a, b) => Number(b.isLead) - Number(a.isLead));
}

export interface DetailRef {
  rank: number;
  title: string;
}

/** The ranked details an angle draws on, in rank order. */
export function angleRefs(angle: Pick<EssayAngle, "factIds">, details: DossierDetail[]): DetailRef[] {
  const ids = new Set(angle.factIds ?? []);
  return details.filter((d) => ids.has(d.factId)).map((d) => ({ rank: d.rank, title: d.title }));
}

export function questionRef(question: Pick<DossierQuestion, "factId">, details: DossierDetail[]): DetailRef | null {
  if (!question.factId) return null;
  const d = details.find((x) => x.factId === question.factId);
  return d ? { rank: d.rank, title: d.title } : null;
}

export const AUDIENCE_LABELS: Record<DossierQuestion["audience"], string> = {
  info_session: "Ask at an info session",
  current_student: "Ask a current student",
};

/* ------------------------------------------------------------------ */
/* Header                                                              */
/* ------------------------------------------------------------------ */

export function wordLimitText(limit: number | null | undefined): string {
  return typeof limit === "number" && limit > 0 ? `${limit}-word limit` : "No word limit given";
}

/** Quiet stats line items, e.g. ["14 official pages read", "12 facts verified"]. */
export function statsItems(stats: Pick<Dossier["stats"], "pagesRead" | "factsVerified"> | undefined): string[] {
  if (!stats) return [];
  const items: string[] = [];
  if (Number.isFinite(stats.pagesRead)) items.push(`${plural(stats.pagesRead, "official page")} read`);
  if (Number.isFinite(stats.factsVerified)) items.push(`${plural(stats.factsVerified, "fact")} verified`);
  return items;
}

/** First name only (the briefing never shows more of the student's identity). */
export function firstName(name: string | null | undefined): string | null {
  const first = (name ?? "").trim().split(/\s+/)[0] ?? "";
  return first ? first.slice(0, 40) : null;
}

/* ------------------------------------------------------------------ */
/* Anchors and file names                                              */
/* ------------------------------------------------------------------ */

export function detailAnchor(prefix: string, rank: number): string {
  return `${prefix}-detail-${rank}`;
}

function fileSlug(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

/** "whyus-cornell-dossier.pdf" */
export function dossierPdfFileName(dossier: Pick<Dossier, "schoolId" | "schoolName">): string {
  const slug = fileSlug(dossier.schoolId || "") || fileSlug(dossier.schoolName || "") || "school";
  return `whyus-${slug}-dossier.pdf`;
}
