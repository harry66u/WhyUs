/**
 * Scoring facts against a student. Pure and deterministic.
 *
 * fit (0-1): how directly a fact connects to the student's actual activities
 *   (shared themes weighted by theme specificity, how central the theme is to
 *   the activity and to the fact, plus shared distinctive words), scaled by the
 *   activity's depth; interests and intended majors fill part of the remainder.
 *   Generic shared themes (volunteering, education, leadership, careers...)
 *   count for little, and a theme mentioned only in passing on either side
 *   counts less than one the activity or the fact is about.
 * bases: the ways a fact may be cited in a fit sentence. A detail may cite an
 *   activity only when they share a specific theme that is central to both
 *   (see `citableShare`); otherwise it may cite a stated interest or intended
 *   major that shares one, or it has no basis and should not be presented as a match.
 * score (0-1): fit adjusted for ranking: commonly mentioned details are pushed
 *   down; substantive ones (courses, labs, faculty, programs) up and amenities
 *   down; specific ones (course codes, named people and labs) up; facts scoped
 *   to the applicant's unit up (strongly when the prompt is about the academic
 *   program or a specific college); facts matching what the prompt asks about up.
 *   Facts scoped only to other units are left out entirely.
 */
import type { Fact } from "@/lib/types";
import { FIELD_STRENGTH, factFeatures, type FactFeatures, type KindFamily } from "./features";
import type { ActivityProfile, InterestProfile, StudentThemes } from "./profile";
import { GENERIC_THEMES, HOBBY_GROUPS, SPECIFIC_THEME_WEIGHT, detectThemes, sameThemeFamily, themeGroup, themeWeight, type ThemeGroup } from "./themes";
import { clamp } from "./text";

export interface ThemeShare {
  key: string;
  value: number;
  /** True when this shared theme may carry a cited connection (see `citableShare`). */
  citable?: boolean;
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
  /** Shared themes that may carry a cited connection, strongest first. Empty: this link cannot be cited. */
  specific: ThemeShare[];
  /** 0-1 connection strength through the citable themes only (0 when there are none). */
  citedFit: number;
}

export type ActivityLink = Link<ActivityProfile>;
export type InterestLink = Link<InterestProfile>;

export type BasisKind = "activity" | "interest" | "major";

/** One way a fit sentence may ground a detail: an activity, a stated interest, or an intended major. */
export interface Basis {
  kind: BasisKind;
  /** Activity id, or the interest / intended-major text. */
  sourceId: string;
  /** Head of the angle key: the activity id, or "interests" / "majors". */
  keyHead: string;
  /**
   * Primary theme: the most specific of the strongest citable shared themes
   * ("environmental-policy" over "public-policy" when both are strong).
   */
  theme: string;
  /** Citable shared themes, primary first. */
  themes: string[];
  /**
   * Other themes this basis may be filed under when its primary theme is taken
   * (nearly as strong, and not the same topic at another breadth: never "music" for a "jazz" link).
   */
  alternatives: string[];
  /** 0-1 connection strength through this basis. */
  fit: number;
  /** fit x preference (activities over interests over intended majors). */
  value: number;
  link: ActivityLink | InterestLink;
}

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
  /** Ways this fact may be cited, best first (activities before interests and majors at similar strength). */
  bases: Basis[];
  /**
   * Counts as an academic detail for this student and prompt: academic by kind
   * and content, and not merely a hobby connection (a jazz course for a student
   * who plans to study engineering is an extracurricular interest).
   */
  academic: boolean;
}

export interface ScoreOptions {
  unitId: string | null;
  promptText?: string;
  /** Names a prompt may use for the applicant's unit when it is a college or school inside the university. */
  unitNames?: string[];
  /** Precomputed prompt focus (wins over promptText and unitNames). */
  focus?: PromptFocus;
}

/** Minimum link fit for an activity to count as connected to a fact. */
export const MIN_LINK_FIT = 0.18;

/** Preference among bases of similar strength: the student's own activities first. */
export const BASIS_PREFERENCE: Record<BasisKind, number> = { activity: 1, interest: 0.8, major: 0.75 };

/**
 * An activity link at least this strong is cited before any interest or
 * intended major: a detail cites what the student did whenever a specific
 * theme connects them, and falls back to a stated interest only otherwise.
 */
export const ACTIVITY_FIRST_FIT = 0.25;

/** A detail may be filed under another of its themes when that theme is at least this strong relative to the strongest. */
const NEAR_TOP = 0.6;

const COMMONNESS_MULT: Record<string, number> = { common: 0.6, moderate: 0.86, rare: 1 };

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
/** Minimum salience of a theme on the student's side for it to carry a citation (a description mention qualifies). */
const MIN_CITABLE_SALIENCE = 0.5;

/**
 * May this shared theme carry "this detail connects to that activity"?
 * - not a generic mode of involvement (volunteering, teaching, leading, careers...);
 * - central to the fact (named in its title, or among its strongest summary/hook themes);
 * - present on the student's side beyond an organization name or category;
 * - specific (weight >= 1.1), or a broader subject (weight 1.0) that both sides
 *   are about (the activity's title or role, and the fact's title, summary, or hook).
 */
export function citableShare(key: string, studentSalience: number, factStrength: number, f: FactFeatures): boolean {
  if (GENERIC_THEMES.has(key)) return false;
  if (!f.central.has(key)) return false;
  if (studentSalience < MIN_CITABLE_SALIENCE) return false;
  const w = themeWeight(key);
  if (w >= SPECIFIC_THEME_WEIGHT) return true;
  return w >= 1 && studentSalience >= 0.75 && factStrength >= FIELD_STRENGTH.lead - 1e-9;
}

function saturate(raw: number, tok: number, depthFactor: number): number {
  const themeFit = 1 - Math.exp(-raw / 2);
  const tokenFit = Math.min(0.3, 0.12 * tok) * (raw > 0 ? 1 : 0.6);
  return clamp((themeFit + tokenFit) * depthFactor);
}

function decayed(shares: ThemeShare[]): number {
  let raw = 0;
  shares.forEach((t, i) => {
    raw += t.value * (THEME_DECAY[i] ?? 0.15);
  });
  return raw;
}

export function linkTo<T extends Matchable>(src: T, f: FactFeatures, idf: IdfFn, depthFactor = 1): Link<T> | null {
  const themes: ThemeShare[] = [];
  for (const [key, sa] of src.themes) {
    const sf = f.themes.get(key);
    if (!sf) continue;
    const citable = citableShare(key, sa, sf, f);
    // Generic and passing overlaps color a connection but cannot carry one.
    const discount = citable ? 1 : GENERIC_THEMES.has(key) ? 0.3 : 0.6;
    themes.push({ key, value: themeWeight(key) * sa * sf * discount, citable });
  }
  themes.sort((a, b) => b.value - a.value || a.key.localeCompare(b.key));
  // Diminishing returns: a broad fact that touches many themes should not outrank a focused one.
  const raw = decayed(themes);

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

  const specific = themes.filter((t) => t.citable);
  const citedRaw = decayed(specific);
  return {
    source: src,
    fit: saturate(raw, tok, depthFactor),
    raw,
    themes,
    tokens,
    specific,
    citedFit: citedRaw > 0 ? saturate(citedRaw, tok, depthFactor) : 0,
  };
}

/* ------------------------------------------------------------------ */
/* Prompt focus                                                         */
/* ------------------------------------------------------------------ */

export type PromptMode = "academic" | "mixed" | "community" | "open";

export interface PromptFocus {
  /** Asks about academics: the curriculum, courses, majors, research, what the student would study or learn. */
  academic: boolean;
  /** Asks about community, campus life, activities outside the classroom. */
  community: boolean;
  /** Asks about the place: the location, city, surroundings. */
  place: boolean;
  /** Asks about one college or school inside the university (names it, or says "the specific college or school"). */
  unit: boolean;
  /**
   * academic: the academic program or a specific college (most details academic, unit-scoped first);
   * mixed: academics and community; community: community only; open: neither ("Why us?").
   */
  mode: PromptMode;
  /** Themes the prompt names, most specific first. */
  themes: string[];
}

const ACADEMIC_PROMPT =
  /\b(?:academic\w*|intellectual\w*|curricul\w*|courses?|classes|majors?|minors?|stud(?:y|ies|ying)|learn\w*|research\w*|professors?|faculty|departments?|field of study|disciplines?|program of study|curio\w*|discover\w*|education)\b/i;
const COMMUNITY_PROMPT =
  /\b(?:communit\w*|campus life|student life|extracurricular\w*|clubs?|organizations?|traditions?|culture|engag\w*|contribut\w*|belong\w*|outside (?:of )?the classroom|campus environment)\b/i;
const PLACE_PROMPT = /\b(?:location|city|town|surround\w*|region|neighborhoods?|place|setting|campus environment)\b/i;
/** Generic ways a prompt points at one college or school. */
const UNIT_PROMPT = /\b(?:college or school|school or college|specific (?:undergraduate )?(?:college|school)|(?:college|school) to which you are applying)\b/i;
/** Proper names of a unit: "the College", "College of Arts and Sciences", "School of Engineering", "Duffield Engineering". */
const UNIT_NAME = /(?:\b[Tt]he College\b(?! of)|\b(?:College|School) of [A-Z]|\b[A-Z][a-z]+ Engineering\b)/;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** What the prompt asks about. `unitNames`: names of the applicant's unit when it is a college or school inside the university. */
export function promptFocus(text = "", unitNames: string[] = []): PromptFocus {
  const t = text ?? "";
  const academic = ACADEMIC_PROMPT.test(t);
  const community = COMMUNITY_PROMPT.test(t);
  const place = PLACE_PROMPT.test(t);
  // Unit names match as written ("the College" is a unit; "the college's" in a whole-school prompt is not).
  const named = unitNames.some((n) => n && n.trim().length >= 3 && new RegExp(`\\b${escapeRe(n.trim())}\\b`).test(t));
  const unit = UNIT_PROMPT.test(t) || UNIT_NAME.test(t) || named;
  const mode: PromptMode = (academic || unit) && !community ? "academic" : academic && community ? "mixed" : community ? "community" : "open";
  return { academic, community, place, unit, mode, themes: detectThemes(t) };
}

/** Kept for callers of the earlier API: the same analysis as `promptFocus`. */
export function promptInfo(text = ""): PromptFocus {
  return promptFocus(text);
}

/** How strongly each mode prefers unit-scoped, academic, and substantive details. */
const MODE_WEIGHTS: Record<PromptMode, { unit: number; nonAcademic: number; amenity: number }> = {
  academic: { unit: 1.2, nonAcademic: 0.78, amenity: 0.72 },
  mixed: { unit: 1.08, nonAcademic: 0.95, amenity: 0.85 },
  community: { unit: 1.03, nonAcademic: 1.04, amenity: 0.9 },
  open: { unit: 1.06, nonAcademic: 0.95, amenity: 0.85 },
};

function promptMultiplier(focus: PromptFocus, features: FactFeatures): number {
  const fam: KindFamily = features.family;
  const academic = fam === "course" || fam === "study" || fam === "research";
  const communal = fam === "group" || fam === "tradition" || fam === "place" || fam === "program";
  let m = 1;
  if (focus.academic && academic) m *= 1.04;
  if (focus.community && communal) m *= 1.04;
  if (focus.place && fam === "place") m *= 1.04;
  let shared = 0;
  for (const k of focus.themes) if (features.themes.has(k)) shared++;
  return m * (1 + 0.04 * Math.min(2, shared));
}

/** "unit" | "all" | null (scoped only to other units: not eligible). */
export function unitScope(fact: Fact, unitId: string | null): "unit" | "all" | null {
  const units = fact.unitIds ?? [];
  if (units.length === 0 || !unitId) return "all";
  return units.includes(unitId) ? "unit" : null;
}

/** Theme groups of the student's intended majors (a music major's jazz course is academic). */
export function majorGroups(student: StudentThemes): Set<ThemeGroup> {
  const out = new Set<ThemeGroup>();
  for (const m of student.majors) {
    for (const k of m.themes.keys()) {
      const g = themeGroup(k);
      if (g) out.add(g);
    }
  }
  return out;
}

/** A hobby theme for this student: arts or outdoors, unless an intended major is in that area. */
export function isHobbyTheme(key: string, majors: Set<ThemeGroup>): boolean {
  const g = themeGroup(key);
  return Boolean(g && HOBBY_GROUPS.has(g) && !majors.has(g));
}

function bestLink<T>(links: (Link<T> | null)[]): Link<T> | null {
  let best: Link<T> | null = null;
  for (const l of links) if (l && (!best || l.fit > best.fit)) best = l;
  return best;
}

/**
 * Citable shares in primary order. Specific themes (weight >= 1.1) come first,
 * ordered by strength weighted once more by specificity, so a narrow theme that
 * is nearly as strong wins ("water policy" files under environmental policy, not
 * public policy) while a theme the activity only mentions in passing does not
 * outrank one it is named for. Broader subject themes (weight 1.0, central on
 * both sides) follow: they carry a citation only when nothing specific does.
 */
export function primaryOrder(specific: ThemeShare[]): ThemeShare[] {
  const narrow = (t: ThemeShare) => (themeWeight(t.key) >= SPECIFIC_THEME_WEIGHT ? 0 : 1);
  return [...specific].sort(
    (a, b) => narrow(a) - narrow(b) || b.value * themeWeight(b.key) - a.value * themeWeight(a.key) || b.value - a.value || a.key.localeCompare(b.key),
  );
}

function basesFor(links: ActivityLink[], interests: InterestLink[], majors: InterestLink[]): Basis[] {
  const out: Basis[] = [];
  const push = (kind: BasisKind, link: ActivityLink | InterestLink, sourceId: string, keyHead: string) => {
    if (link.specific.length === 0 || link.citedFit < MIN_LINK_FIT) return;
    const ordered = primaryOrder(link.specific);
    const theme = ordered[0].key;
    const top = link.specific[0].value;
    const narrowPrimary = themeWeight(theme) >= SPECIFIC_THEME_WEIGHT;
    out.push({
      kind,
      sourceId,
      keyHead,
      theme,
      themes: ordered.map((t) => t.key),
      // Nearly as strong, a different topic, and as specific as the primary.
      alternatives: ordered
        .slice(1)
        .filter((t) => t.value >= NEAR_TOP * top && !sameThemeFamily(t.key, theme) && (!narrowPrimary || themeWeight(t.key) >= SPECIFIC_THEME_WEIGHT))
        .map((t) => t.key),
      fit: link.citedFit,
      value: link.citedFit * BASIS_PREFERENCE[kind],
      link,
    });
  };
  for (const l of links) push("activity", l, l.source.id, l.source.id);
  for (const l of interests) push("interest", l, l.source.text, "interests");
  for (const l of majors) push("major", l, l.source.text, "majors");
  const tier = (b: Basis) => (b.kind === "activity" && b.fit >= ACTIVITY_FIRST_FIT ? 0 : 1);
  const order: Record<BasisKind, number> = { activity: 0, interest: 1, major: 2 };
  return out.sort((a, b) => tier(a) - tier(b) || b.value - a.value || order[a.kind] - order[b.kind] || a.sourceId.localeCompare(b.sourceId));
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
  const focus = opts.focus ?? promptFocus(opts.promptText ?? "", opts.unitNames ?? []);
  const weights = MODE_WEIGHTS[focus.mode];
  const majors = majorGroups(student);

  const out: ScoredFact[] = eligible.map(({ fact, unit, features }) => {
    const links = student.activities
      .map((a) => linkTo(a, features, idf, 0.6 + 0.4 * a.depth))
      .filter((l): l is ActivityLink => l != null && l.fit >= MIN_LINK_FIT / 2)
      .sort((a, b) => b.fit - a.fit || a.source.index - b.source.index);
    const interestLinks = student.interests.map((i) => linkTo(i, features, idf)).filter((l): l is InterestLink => l != null);
    const majorLinks = student.majors.map((m) => linkTo(m, features, idf)).filter((l): l is InterestLink => l != null);
    const interest = bestLink(interestLinks);
    const major = bestLink(majorLinks);
    const bases = basesFor(links, interestLinks, majorLinks);

    const best = links[0]?.fit ?? 0;
    const second = links[1]?.fit ?? 0;
    const act = Math.min(1, best + 0.15 * second);
    const fit = clamp(act + (1 - act) * (0.5 * (interest?.fit ?? 0) + 0.3 * (major?.fit ?? 0)));

    // A detail whose only real connection is a hobby (jazz, cycling) is not academic for this student.
    const hobbyOnly = [...features.central].length > 0 && [...features.central].every((k) => isHobbyTheme(k, majors));
    const academic = features.academic && !hobbyOnly;
    // Nothing specific connects it: it may still fill out a dossier, but it is not a match.
    const grounded = bases.length > 0 ? 1 : 0.55;

    const mult =
      (COMMONNESS_MULT[fact.commonness] ?? COMMONNESS_MULT.moderate) *
      (0.5 + 0.5 * features.substance) *
      (features.amenity ? weights.amenity : 1) *
      (academic ? 1 : weights.nonAcademic) *
      (1 + 0.08 * features.specificity) *
      (unit === "unit" && (fact.unitIds ?? []).length > 0 ? weights.unit : 1) *
      promptMultiplier(focus, features) *
      grounded;
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

    return { fact, features, fit, score, links, interest, major, themes, unit, bases, academic };
  });

  return out.sort((a, b) => b.score - a.score || a.fact.id.localeCompare(b.fact.id));
}

/** Activities meaningfully and citably connected to a scored fact (strongest first, at most three). */
export function connectedActivityIds(s: ScoredFact): string[] {
  const cited = s.links.filter((l) => l.specific.length > 0 && l.citedFit >= MIN_LINK_FIT);
  const best = cited[0]?.citedFit ?? 0;
  return [...cited]
    .sort((a, b) => b.citedFit - a.citedFit || a.source.index - b.source.index)
    .filter((l) => l.citedFit >= 0.5 * best)
    .slice(0, 3)
    .map((l) => l.source.id);
}
