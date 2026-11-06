/**
 * Scoring facts against a student. Pure and deterministic.
 *
 * fit (0-1): how directly a fact connects to the student's actual activities
 *   (shared themes weighted by theme specificity, how central the theme is to
 *   the activity and to the fact, plus shared distinctive words), scaled by the
 *   activity's depth; interests and intended majors fill part of the remainder.
 * score (0-1): fit adjusted for ranking: commonly mentioned details are pushed
 *   down, specific ones (course codes, named people and labs) up, facts scoped
 *   to the applicant's unit up, and facts matching what the prompt asks about up.
 *   Facts scoped only to other units are left out entirely.
 */
import type { Fact } from "@/lib/types";
import { factFeatures, type FactFeatures, type KindFamily } from "./features";
import type { ActivityProfile, InterestProfile, StudentThemes } from "./profile";
import { detectThemes, themeWeight } from "./themes";
import { clamp } from "./text";

export interface ThemeShare {
  key: string;
  value: number;
}

export interface Link<T> {
  source: T;
  /** 0-1 */
  fit: number;
  /** Weighted shared-theme mass before saturation. */
  raw: number;
  /** Shared themes, largest contribution first. */
  themes: ThemeShare[];
  /** Shared distinctive stems, rarest first. */
  tokens: string[];
}

export type ActivityLink = Link<ActivityProfile>;
export type InterestLink = Link<InterestProfile>;

export interface ScoredFact {
  fact: Fact;
  features: FactFeatures;
  /** 0-1 connection strength (no commonness or specificity adjustment). */
  fit: number;
  /** 0-1 ranking score. */
  score: number;
  /** Activities this fact connects to, strongest first. */
  links: ActivityLink[];
  interest: InterestLink | null;
  major: InterestLink | null;
  /** Shared themes, strongest contribution first. */
  themes: string[];
  /** "unit": scoped to the applicant's unit; "all": open to every undergraduate (or no unit chosen). */
  unit: "unit" | "all";
}

export interface ScoreOptions {
  unitId: string | null;
  promptText?: string;
}

/** Minimum link fit for an activity to count as connected to a fact. */
export const MIN_LINK_FIT = 0.18;

const COMMONNESS_MULT: Record<string, number> = { common: 0.6, moderate: 0.86, rare: 1 };

/**
 * Mild prior by kind: amenities, places, and traditions support an essay but
 * rarely carry it, so at equal fit a course, lab, or program ranks first.
 */
const KIND_PRIOR: Partial<Record<Fact["kind"], number>> = { facility: 0.93, location: 0.95, tradition: 0.92 };

type IdfFn = (stem: string) => number;

/** Normalized inverse document frequency over a pool of facts (0-1). Small pools are smoothed. */
export function idfOver(features: FactFeatures[]): IdfFn {
  const df = new Map<string, number>();
  for (const f of features) for (const s of f.tokens.keys()) df.set(s, (df.get(s) ?? 0) + 1);
  const n = Math.max(features.length, 24);
  const max = Math.log((n + 1) / 0.5);
  return (s) => {
    const d = df.get(s) ?? 0;
    if (d === 0) return 0;
    return clamp(Math.log((n + 1) / (d + 0.5)) / max);
  };
}

interface Matchable {
  themes: Map<string, number>;
  tokens: Map<string, number>;
  bigrams: Set<string>;
}

const MIN_TOKEN_IDF = 0.6;
const THEME_DECAY = [1, 0.7, 0.45, 0.3, 0.2];

export function linkTo<T extends Matchable>(src: T, f: FactFeatures, idf: IdfFn, depthFactor = 1): Link<T> | null {
  const themes: ThemeShare[] = [];
  for (const [key, sa] of src.themes) {
    const sf = f.themes.get(key);
    if (!sf) continue;
    themes.push({ key, value: themeWeight(key) * sa * sf });
  }
  themes.sort((a, b) => b.value - a.value || a.key.localeCompare(b.key));
  // Diminishing returns: a broad fact that touches many themes should not outrank a focused one.
  let raw = 0;
  themes.forEach((t, i) => {
    raw += t.value * (THEME_DECAY[i] ?? 0.15);
  });

  let tok = 0;
  const tokens: string[] = [];
  for (const [s, wa] of src.tokens) {
    const wf = f.tokens.get(s);
    if (!wf) continue;
    const i = idf(s);
    if (i < MIN_TOKEN_IDF) continue;
    tok += wa * wf * i;
    tokens.push(s);
  }
  for (const b of src.bigrams) if (f.bigrams.has(b)) tok += 0.5;
  tokens.sort((a, b) => idf(b) - idf(a) || a.localeCompare(b));
  if (raw === 0 && tok === 0) return null;

  const themeFit = 1 - Math.exp(-raw / 2);
  const tokenFit = Math.min(0.3, 0.12 * tok) * (raw > 0 ? 1 : 0.6);
  const fit = clamp((themeFit + tokenFit) * depthFactor);
  return { source: src, fit, raw, themes, tokens };
}

interface PromptInfo {
  academic: boolean;
  community: boolean;
  place: boolean;
  themes: string[];
}

export function promptInfo(text = ""): PromptInfo {
  const t = text.toLowerCase();
  return {
    academic:
      /\b(?:academic\w*|intellectual\w*|curricul\w*|courses?|classes|majors?|minors?|stud(?:y|ies|ying)|learn\w*|research\w*|professors?|faculty|departments?|field of study|disciplines?|program of study)\b/.test(t),
    community:
      /\b(?:communit\w*|campus life|student life|extracurricular\w*|clubs?|organizations?|traditions?|culture|engag\w*|contribut\w*|belong\w*|outside (?:of )?the classroom)\b/.test(t),
    place: /\b(?:location|city|town|surround\w*|region|neighborhoods?|place|setting)\b/.test(t),
    themes: detectThemes(text),
  };
}

function promptMultiplier(info: PromptInfo, features: FactFeatures): number {
  const fam: KindFamily = features.family;
  const academic = fam === "course" || fam === "study" || fam === "research";
  const communal = fam === "group" || fam === "tradition" || fam === "place" || fam === "program";
  let m = 1;
  if (info.academic && academic) m *= 1.04;
  if (info.community && communal) m *= 1.04;
  if (info.place && fam === "place") m *= 1.04;
  if (info.academic && !info.community && (fam === "group" || fam === "tradition")) m *= 0.95;
  if (info.community && !info.academic && (fam === "course" || fam === "study")) m *= 0.95;
  let shared = 0;
  for (const k of info.themes) if (features.themes.has(k)) shared++;
  return m * (1 + 0.04 * Math.min(2, shared));
}

/** "unit" | "all" | null (scoped only to other units: not eligible). */
export function unitScope(fact: Fact, unitId: string | null): "unit" | "all" | null {
  const units = fact.unitIds ?? [];
  if (units.length === 0 || !unitId) return "all";
  return units.includes(unitId) ? "unit" : null;
}

function bestLink<T>(links: (Link<T> | null)[]): Link<T> | null {
  let best: Link<T> | null = null;
  for (const l of links) if (l && (!best || l.fit > best.fit)) best = l;
  return best;
}

/** Score every eligible fact for this student. Sorted by score (desc), ties by fact id. */
export function scoreFacts(student: StudentThemes, facts: Fact[], opts: ScoreOptions): ScoredFact[] {
  const eligible: { fact: Fact; unit: "unit" | "all"; features: FactFeatures }[] = [];
  const seen = new Set<string>();
  for (const fact of [...facts].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!fact || seen.has(fact.id)) continue;
    seen.add(fact.id);
    const unit = unitScope(fact, opts.unitId);
    if (!unit) continue;
    eligible.push({ fact, unit, features: factFeatures(fact) });
  }
  const idf = idfOver(eligible.map((e) => e.features));
  const prompt = promptInfo(opts.promptText ?? "");

  const out: ScoredFact[] = eligible.map(({ fact, unit, features }) => {
    const links = student.activities
      .map((a) => linkTo(a, features, idf, 0.6 + 0.4 * a.depth))
      .filter((l): l is ActivityLink => l != null && l.fit >= MIN_LINK_FIT / 2)
      .sort((a, b) => b.fit - a.fit || a.source.index - b.source.index);
    const interest = bestLink(student.interests.map((i) => linkTo(i, features, idf)));
    const major = bestLink(student.majors.map((m) => linkTo(m, features, idf)));

    const best = links[0]?.fit ?? 0;
    const second = links[1]?.fit ?? 0;
    const act = Math.min(1, best + 0.15 * second);
    const fit = clamp(act + (1 - act) * (0.5 * (interest?.fit ?? 0) + 0.3 * (major?.fit ?? 0)));

    const mult =
      (COMMONNESS_MULT[fact.commonness] ?? COMMONNESS_MULT.moderate) *
      (KIND_PRIOR[fact.kind] ?? 1) *
      (1 + 0.08 * features.specificity) *
      (unit === "unit" ? 1.06 : 1) *
      promptMultiplier(prompt, features);
    // Normalized so that only an exceptional fact with every bonus reaches 1.
    const score = clamp((fit * mult) / 1.12);

    const contrib = new Map<string, number>();
    const addThemes = (themes: ThemeShare[], w: number) => {
      for (const t of themes) contrib.set(t.key, (contrib.get(t.key) ?? 0) + t.value * w);
    };
    links.slice(0, 2).forEach((l, i) => addThemes(l.themes, i === 0 ? 1 : 0.5));
    if (interest) addThemes(interest.themes, 0.4);
    if (major) addThemes(major.themes, 0.3);
    const themes = [...contrib.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k]) => k);

    return { fact, features, fit, score, links, interest, major, themes, unit };
  });

  return out.sort((a, b) => b.score - a.score || a.fact.id.localeCompare(b.fact.id));
}

/** Activities meaningfully connected to a scored fact (strongest first, at most three). */
export function connectedActivityIds(s: ScoredFact): string[] {
  const best = s.links[0]?.fit ?? 0;
  return s.links
    .filter((l) => l.fit >= MIN_LINK_FIT && l.fit >= 0.5 * best)
    .slice(0, 3)
    .map((l) => l.source.id);
}
