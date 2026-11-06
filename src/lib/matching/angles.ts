/**
 * Essay angles: one-line ideas, never drafted prose.
 *
 * Candidates come from the bases the details cite: the details grounded in one
 * activity (at most two, see select.ts), or in the student's stated interests or
 * intended majors, form a group; each specific theme those details share with
 * the group's source is a candidate angle. Key: "<activityId>|<themeKey>"
 * (interest and major angles use the pseudo-ids "interests" and "majors").
 *
 * Strength (comparable across a student's schools, used by coordinateAngles):
 * relevance to the intended majors and to the prompt (academic angles first
 * when the prompt asks about the academic program or a specific college; the
 * unit's own core themes count more there), the fit and substance of the
 * supporting details, their uniqueness, and the specificity of the theme.
 *
 * Lines name the activity and at most two details, framed by a theme-specific
 * through-line ("Building instruments that answer real questions: from your
 * Creek Watch Sensor Network to CEE 4795."). Angles shown together never share
 * a detail, and secondary angles point in a different direction from the lead.
 */
import type { EssayAngle, FactKind } from "@/lib/types";
import { throughLine } from "./framing";
import type { ActivityProfile, InterestProfile } from "./profile";
import type { ActivityLink, Basis, BasisKind, InterestLink, PromptFocus, ScoredFact } from "./rank";
import { isHobbyTheme } from "./rank";
import { themeGroup, themeLabel, themeWeight, type ThemeGroup } from "./themes";
import { capitalizeFirst, joinList } from "./text";

export const MAX_ANGLE_LENGTH = 160;

export interface AngleCandidate {
  key: string;
  activityId: string | null;
  theme: string;
  factIds: string[];
  themes: string[];
  /** Strength: comparable across a student's dossiers. */
  score: number;
  line: string;
  /** False for hobby angles (jazz, cycling) and angles with no academic detail behind them. */
  academic?: boolean;
}

export interface RankedDetail {
  scored: ScoredFact;
  rank: number;
  /** The basis this detail's fit sentence cites (from selection); undefined: its best basis. */
  cite?: Basis | null;
}

/** Angle as stored on a dossier, with the strength and academic flag cross-school coordination reads. */
export type ScoredEssayAngle = EssayAngle & { strength?: number; academic?: boolean };

export interface AngleContext {
  focus?: Pick<PromptFocus, "mode" | "themes">;
  /** Theme keys of the student's intended majors. */
  majorThemes?: Set<string>;
  /** Theme groups of the student's intended majors. */
  majorGroups?: Set<ThemeGroup>;
  /** theme -> share (0-1) of the unit-scoped candidate facts that are about it: the unit's core subjects. */
  unitThemes?: Map<string, number>;
}

function rankWeight(rank: number): number {
  return Math.max(0.6, 1.1 - 0.05 * (rank - 1));
}

/**
 * How well a kind of detail can carry an essay angle: courses, labs, programs,
 * and people anchor an argument; amenities, places, and traditions support one.
 * (Kept for callers; per-fact substance lives in features.ts.)
 */
export const KIND_SUBSTANCE: Record<FactKind, number> = {
  course: 1,
  major: 0.95,
  faculty: 1,
  lab: 1,
  center: 0.95,
  program: 1,
  organization: 0.9,
  facility: 0.75,
  location: 0.8,
  tradition: 0.75,
};

/** Groups whose themes count as related to an intended major in that group. */
const RELATED_GROUPS: Record<ThemeGroup, ThemeGroup[]> = {
  environment: ["environment", "engineering", "place", "science"],
  engineering: ["engineering", "environment", "computing", "science", "place"],
  place: ["place", "environment", "society", "engineering"],
  computing: ["computing", "engineering", "science"],
  science: ["science", "environment", "health", "engineering"],
  health: ["health", "science", "society"],
  society: ["society", "civic", "place", "global"],
  humanities: ["humanities", "society", "arts"],
  arts: ["arts", "humanities"],
  business: ["business", "society"],
  civic: ["civic", "society"],
  outdoors: ["outdoors"],
  global: ["global", "society", "civic"],
  identity: ["identity", "society", "civic"],
  academic: [],
};

/* ------------------------------------------------------------------ */
/* Lines                                                                */
/* ------------------------------------------------------------------ */

/** Fact names for a line: "ENGS 42 (Watershed Hydrology) and ENGS 28". */
function factNames(details: RankedDetail[], long: boolean[]): string {
  return joinList(details.map((d, i) => (long[i] ? d.scored.features.longName : d.scored.features.name)));
}

function fitToLength(line: string): string {
  if (line.length <= MAX_ANGLE_LENGTH) return line;
  return `${line.slice(0, MAX_ANGLE_LENGTH - 1).replace(/[\s,;:]+\S*$/, "")}.`;
}

/**
 * One line, idea only: a theme-specific through-line, then the activity and at
 * most two details. "Measurement that changes what a town decides about its
 * water: from your Creek Watch Sensor Network to Jacqueline Gerson and CEE 4795."
 */
export function ideaLine(theme: string, from: string, fromShort: string, details: RankedDetail[], variant = 0): string {
  const through = capitalizeFirst(throughLine(theme, variant));
  const two = details.slice(0, 2);
  const attempts: [string, RankedDetail[], boolean[]][] = [
    [from, two, [true, true]],
    [from, two, [true, false]],
    [from, two, [false, false]],
    [fromShort, two, [false, false]],
    [from, two.slice(0, 1), [true]],
    [from, two.slice(0, 1), [false]],
    [fromShort, two.slice(0, 1), [true]],
    [fromShort, two.slice(0, 1), [false]],
  ];
  for (const [src, ds, long] of attempts) {
    const line = ds.length > 0 ? `${through}: from ${src} to ${factNames(ds, long)}.` : `${through}: building on ${src}.`;
    if (line.length <= MAX_ANGLE_LENGTH) return line;
  }
  // Very long names: the detail and the activity carry the idea without the framing.
  const first = two[0];
  if (first) {
    const bare = `${capitalizeFirst(fromShort)} and ${first.scored.features.name}.`;
    if (bare.length <= MAX_ANGLE_LENGTH) return bare;
  }
  return fitToLength(`${through}: building on ${fromShort}.`);
}

/** Earlier line format, kept for callers: "Water resources: from your Creek Watch Sensor Network to ENGS 42 and ENGS 28." */
export function angleLine(topic: string, from: string, fromShort: string, details: RankedDetail[]): string {
  const attempts: [string, RankedDetail[], boolean[]][] = [
    [from, details.slice(0, 2), [true, true]],
    [from, details.slice(0, 2), [true, false]],
    [from, details.slice(0, 2), [false, false]],
    [from, details.slice(0, 1), [true]],
    [from, details.slice(0, 1), [false]],
    [fromShort, details.slice(0, 1), [false]],
  ];
  for (const [src, ds, long] of attempts) {
    const line = ds.length > 0 ? `${topic}: from ${src} to ${factNames(ds, long)}.` : `${topic}: build on ${src}.`;
    if (line.length <= MAX_ANGLE_LENGTH) return line;
  }
  return fitToLength(`${topic}: from ${fromShort}.`);
}

/* ------------------------------------------------------------------ */
/* Candidates                                                           */
/* ------------------------------------------------------------------ */

interface Member {
  detail: RankedDetail;
  link: ActivityLink | InterestLink;
  /** The detail's cited (primary) theme. */
  primary: string;
  /** Citable themes the detail shares with this group's source. */
  themes: string[];
}

interface Group {
  head: string;
  kind: BasisKind;
  activity: ActivityProfile | null;
  members: Member[];
}

function citeOf(d: RankedDetail): Basis | null {
  if (d.cite !== undefined) return d.cite;
  return d.scored.bases?.[0] ?? null;
}

function sourcePhrase(g: Group, theme: string, short: boolean): string {
  if (g.activity) return short ? g.activity.tinyRef : g.activity.shortRef;
  const src = (g.members.find((m) => m.themes.includes(theme))?.link.source ?? g.members[0]?.link.source) as InterestProfile | undefined;
  if (g.kind === "major") return `your plan to study ${src?.text ?? themeLabel(theme).toLowerCase()}`;
  return `your interest in ${src?.text ?? themeLabel(theme).toLowerCase()}`;
}

function majorRelevance(theme: string, support: Member[], ctx: AngleContext): number {
  const keys = ctx.majorThemes;
  if (!keys || keys.size === 0) return 1;
  if (keys.has(theme)) return 1.15;
  if (support.some((m) => [...m.detail.scored.features.central].some((k) => keys.has(k)))) return 1.1;
  const g = themeGroup(theme);
  const groups = ctx.majorGroups ?? new Set<ThemeGroup>();
  if (g && [...groups].some((mg) => RELATED_GROUPS[mg]?.includes(g))) return 1;
  return 0.8;
}

function promptRelevance(theme: string, academic: boolean, support: Member[], ctx: AngleContext): number {
  const mode = ctx.focus?.mode ?? "open";
  let p: number;
  switch (mode) {
    case "academic":
      p = academic ? 1.1 : 0.55;
      // The unit's core subjects, and details scoped to the unit, answer "why this college".
      p *= 1 + 0.35 * (ctx.unitThemes?.get(theme) ?? 0);
      if (support.some((m) => m.detail.scored.unit === "unit" && (m.detail.scored.fact.unitIds ?? []).length > 0)) p *= 1.08;
      break;
    case "mixed":
      p = academic ? 1.05 : 0.75;
      break;
    case "community":
      p = 1;
      break;
    default:
      p = academic ? 1.05 : 0.8;
  }
  if (ctx.focus?.themes?.includes(theme)) p *= 1.08;
  return p;
}

/**
 * Candidate angles from the selected details, strongest first. `uniqueness`
 * (fact id -> 0-100) lets angles built on distinctive details rank higher.
 */
export function angleCandidates(details: RankedDetail[], uniqueness: Map<string, number> = new Map(), ctx: AngleContext = {}): AngleCandidate[] {
  const groups = new Map<string, Group>();
  for (const d of details) {
    const cite = citeOf(d);
    if (!cite) continue;
    const gk = cite.kind === "activity" ? `a:${cite.sourceId}` : cite.keyHead;
    let g = groups.get(gk);
    if (!g) {
      g = { head: cite.keyHead, kind: cite.kind, activity: cite.kind === "activity" ? (cite.link as ActivityLink).source : null, members: [] };
      groups.set(gk, g);
    }
    g.members.push({ detail: d, link: cite.link, primary: cite.theme, themes: cite.themes.length ? cite.themes : [cite.theme] });
  }

  const majors = ctx.majorGroups ?? new Set<ThemeGroup>();
  const out: AngleCandidate[] = [];
  const lineFor = new Map<AngleCandidate, (variant: number) => string>();
  for (const g of groups.values()) {
    const themes = new Set<string>();
    for (const m of g.members) for (const t of m.themes) themes.add(t);
    for (const theme of themes) {
      const contribution = (m: Member) =>
        m.link.citedFit * (m.primary === theme ? 1 : 0.75) * (0.5 + 0.5 * m.detail.scored.features.substance) * rankWeight(m.detail.rank);
      const support = g.members
        .filter((m) => m.themes.includes(theme))
        .map((m) => ({ m, c: contribution(m) }))
        .sort((a, b) => b.c - a.c || a.m.detail.rank - b.m.detail.rank);
      // An angle runs through what at least one detail is cited for, not a passing overlap.
      if (!support.some((x) => x.m.primary === theme)) continue;
      const top = support.slice(0, 2);
      const members = top.map((x) => x.m);
      const base = top[0].c + (top[1] ? 0.6 * top[1].c : 0);
      const depth = g.activity ? 0.8 + 0.2 * g.activity.depth : g.kind === "major" ? 0.8 : 0.72;
      const spec = 0.85 + 0.1 * Math.min(1.5, themeWeight(theme)) + (0.05 * members.reduce((n, m) => n + m.detail.scored.features.specificity, 0)) / members.length;
      const uniq = members.reduce((n, m) => n + (uniqueness.get(m.detail.scored.fact.id) ?? 60), 0) / members.length;
      const academic = !isHobbyTheme(theme, majors) && members.some((m) => m.detail.scored.academic);
      const score =
        base *
        (1 + 0.2 * (members.length - 1)) *
        depth *
        spec *
        (0.6 + 0.4 * (uniq / 100)) *
        majorRelevance(theme, members, ctx) *
        promptRelevance(theme, academic, members, ctx);
      const lineDetails = members.map((m) => m.detail);
      const related = new Map<string, number>();
      for (const m of members) m.themes.forEach((t, i) => t !== theme && related.set(t, (related.get(t) ?? 0) + 1 / (i + 1)));
      const build = (variant: number) => ideaLine(theme, sourcePhrase(g, theme, false), sourcePhrase(g, theme, true), lineDetails, variant);
      const candidate: AngleCandidate = {
        key: `${g.head}|${theme}`,
        activityId: g.activity?.id ?? null,
        theme,
        factIds: lineDetails.map((d) => d.scored.fact.id),
        themes: [theme, ...[...related.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k]) => k).slice(0, 2)],
        score,
        line: build(0),
        academic,
      };
      lineFor.set(candidate, build);
      out.push(candidate);
    }
  }
  // Activity angles before interest and major angles at equal strength.
  out.sort((a, b) => b.score - a.score || Number(b.activityId != null) - Number(a.activityId != null) || a.key.localeCompare(b.key));
  // Two angles on one theme (from different activities) get different framings.
  const seen = new Map<string, number>();
  for (const c of out) {
    const n = seen.get(c.theme) ?? 0;
    seen.set(c.theme, n + 1);
    if (n > 0) c.line = (lineFor.get(c) ?? (() => c.line))(n);
  }
  return out;
}

/** Fallback angles (one per detail theme): used when the details support too few angles that do not share a detail. */
export function fallbackCandidates(details: RankedDetail[], schoolShortName: string, existing: Set<string>): AngleCandidate[] {
  const out: AngleCandidate[] = [];
  for (const d of details) {
    const theme =
      citeOf(d)?.theme ??
      [...d.scored.features.themes.entries()].sort((a, b) => b[1] * themeWeight(b[0]) - a[1] * themeWeight(a[0]) || a[0].localeCompare(b[0]))[0]?.[0];
    if (!theme) continue;
    const key = `school|${theme}`;
    if (existing.has(key) || out.some((o) => o.key === key)) continue;
    const through = capitalizeFirst(throughLine(theme));
    let line = `${through}: what ${d.scored.features.longName} would add at ${schoolShortName}.`;
    if (line.length > MAX_ANGLE_LENGTH) line = `${through}: what ${d.scored.features.name} would add at ${schoolShortName}.`;
    if (line.length > MAX_ANGLE_LENGTH) continue;
    out.push({ key, activityId: null, theme, factIds: [d.scored.fact.id], themes: [theme], score: 0.1 * d.scored.score, line, academic: d.scored.academic });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Choosing the shown angles                                            */
/* ------------------------------------------------------------------ */

export interface UsedLeads {
  keys: Set<string>;
  activities: Set<string>;
  themes: Set<string>;
}

export function usedLeadsFrom(keys: string[]): UsedLeads {
  const used: UsedLeads = { keys: new Set(), activities: new Set(), themes: new Set() };
  for (const k of keys ?? []) {
    if (!k) continue;
    used.keys.add(k);
    const [a, t] = k.split("|");
    if (a && !["interests", "majors", "school"].includes(a)) used.activities.add(a);
    if (t) used.themes.add(t);
  }
  return used;
}

/**
 * How a lead is valued: an angle built on something the student did leads
 * before one built on a stated interest, and an academic angle before an
 * extracurricular one (jazz, cycling) unless nothing academic of reasonable
 * strength (about a third as strong) is left.
 */
export function leadWeight(c: Pick<AngleCandidate, "activityId" | "academic" | "key">): number {
  const own = c.activityId ? 1 : /^school\|/.test(c.key) ? 0.2 : 0.3;
  return own * (c.academic === false ? 0.3 : 1);
}

function leadScore(c: AngleCandidate, used: UsedLeads): number {
  let v = c.score * leadWeight(c);
  if (used.keys.has(c.key)) v *= 0.01;
  if (c.activityId && used.activities.has(c.activityId)) v *= 0.55;
  if (used.themes.has(c.theme)) v *= 0.75;
  return v;
}

const sharesFacts = (a: Pick<AngleCandidate, "factIds">, taken: Set<string>) => a.factIds.some((id) => taken.has(id));

/** Lead first, then one or two more that share no detail with it; the rest are kept as options for cross-school coordination. */
export function chooseAngles(cands: AngleCandidate[], used: UsedLeads): { shown: AngleCandidate[]; options: AngleCandidate[] } {
  if (cands.length === 0) return { shown: [], options: [] };
  const byLead = [...cands].sort((a, b) => leadScore(b, used) - leadScore(a, used) || b.score - a.score || a.key.localeCompare(b.key));
  const lead = byLead[0];
  const shown = [lead];
  const taken = new Set(lead.factIds);
  const rest = cands.filter((c) => c !== lead);
  for (;;) {
    if (shown.length >= 3) break;
    const sameActivity = (c: AngleCandidate) => c.activityId != null && shown.some((s) => s.activityId === c.activityId);
    const sameTheme = (c: AngleCandidate) => shown.some((s) => s.theme === c.theme);
    const score2 = (c: AngleCandidate) => {
      let v = c.score * (c.activityId ? 1 : 0.8) * (c.academic === false ? 0.7 : 1);
      if (sameActivity(c)) v *= 0.4;
      if (sameTheme(c)) v *= 0.5;
      if (used.keys.has(c.key)) v *= 0.8;
      return v;
    };
    const eligible = rest.filter((c) => !sharesFacts(c, taken) && !(sameActivity(c) && sameTheme(c)));
    if (eligible.length === 0) break;
    eligible.sort((a, b) => score2(b) - score2(a) || b.score - a.score || a.key.localeCompare(b.key));
    const next = eligible[0];
    // A third angle must add a new direction and carry some weight.
    if (shown.length >= 2 && (score2(next) < 0.3 * lead.score || sameActivity(next) || sameTheme(next))) break;
    shown.push(next);
    for (const id of next.factIds) taken.add(id);
    rest.splice(rest.indexOf(next), 1);
  }
  // Alternates for cross-school coordination: the best angle for every activity
  // not already shown (so another school's lead never leaves this one stuck), then the strongest rest.
  rest.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
  const options: AngleCandidate[] = [];
  const covered = new Set(shown.map((c) => c.activityId ?? c.key));
  for (const c of rest) {
    const id = c.activityId ?? c.key;
    if (!covered.has(id)) {
      covered.add(id);
      options.push(c);
    }
  }
  for (const c of rest) if (options.length < 12 && !options.includes(c)) options.push(c);
  return { shown, options: options.slice(0, 14) };
}

export function toEssayAngle(c: AngleCandidate, isLead: boolean): ScoredEssayAngle {
  return {
    key: c.key,
    line: c.line,
    factIds: [...c.factIds],
    activityIds: c.activityId ? [c.activityId] : [],
    themes: [...c.themes],
    isLead,
    strength: Math.round(c.score * 10_000) / 10_000,
    academic: c.academic !== false,
  };
}
