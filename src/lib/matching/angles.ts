/**
 * Essay angles: one-line ideas, never drafted prose.
 *
 * Candidates come from (activity x theme) clusters: a cluster is supported by
 * the selected details whose connection to that activity runs through that
 * theme. Key: "<activityId>|<themeKey>" (interest and major clusters use the
 * pseudo-ids "interests" and "majors"). The lead angle avoids keys already used
 * as leads in the student's other dossiers and prefers activities and themes
 * that no other dossier leads with.
 */
import type { EssayAngle, FactKind } from "@/lib/types";
import type { ActivityProfile, InterestProfile } from "./profile";
import type { ScoredFact } from "./rank";
import { MIN_LINK_FIT } from "./rank";
import { themeLabel, themeWeight } from "./themes";
import { joinList } from "./text";

export const MAX_ANGLE_LENGTH = 160;

export interface AngleCandidate {
  key: string;
  activityId: string | null;
  theme: string;
  factIds: string[];
  themes: string[];
  score: number;
  line: string;
}

export interface RankedDetail {
  scored: ScoredFact;
  rank: number;
}

interface Cluster {
  key: string;
  theme: string;
  activity: ActivityProfile | null;
  source: InterestProfile | null;
  support: Map<string, { value: number; detail: RankedDetail }>;
  related: Map<string, number>;
}

function rankWeight(rank: number): number {
  return Math.max(0.6, 1.1 - 0.05 * (rank - 1));
}

/**
 * How well a kind of detail can carry an essay angle: courses, labs, programs,
 * and people anchor an argument; amenities, places, and traditions support one.
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

function pickThemes(themes: { key: string; value: number }[]): { key: string; value: number }[] {
  const specific = themes.filter((t) => themeWeight(t.key) >= 0.75);
  return (specific.length > 0 ? specific : themes).slice(0, 2);
}

/** Fact names for a line: "ENGS 42 (Watershed Hydrology) and ENGS 28". */
function factNames(details: RankedDetail[], long: boolean[]): string {
  return joinList(details.map((d, i) => (long[i] ? d.scored.features.longName : d.scored.features.name)));
}

function sourcePhrase(c: Cluster, short: boolean): string {
  if (c.activity) return short ? c.activity.tinyRef : c.activity.shortRef;
  if (c.source?.kind === "major") return `your plan to study ${c.source.text}`;
  return `your interest in ${c.source?.text ?? themeLabel(c.theme).toLowerCase()}`;
}

/** One line, idea only: "Water resources: from your Creek Watch Sensor Network to ENGS 42 (Watershed Hydrology) and ENGS 28." */
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
  const fallback = `${topic}: from ${fromShort}.`;
  return fallback.length <= MAX_ANGLE_LENGTH ? fallback : `${fallback.slice(0, MAX_ANGLE_LENGTH - 1).replace(/\s+\S*$/, "")}.`;
}

/**
 * Candidate angles from the selected details, strongest first. `uniqueness`
 * (fact id -> 0-100) lets angles built on distinctive details rank higher.
 */
export function angleCandidates(details: RankedDetail[], uniqueness: Map<string, number> = new Map()): AngleCandidate[] {
  const clusters = new Map<string, Cluster>();
  const touch = (key: string, theme: string, activity: ActivityProfile | null, source: InterestProfile | null): Cluster => {
    let c = clusters.get(key);
    if (!c) {
      c = { key, theme, activity, source, support: new Map(), related: new Map() };
      clusters.set(key, c);
    }
    return c;
  };

  for (const d of details) {
    const s = d.scored;
    // The fact's central themes: an angle may run through a secondary link only via one of these.
    const central = new Set(
      [...s.features.themes.entries()]
        .map(([k, v]) => [k, v * themeWeight(k)] as const)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 2)
        .map(([k]) => k),
    );
    const links = s.links.filter((l) => l.fit >= Math.max(0.25, MIN_LINK_FIT)).slice(0, 2);
    links.forEach((link, li) => {
      // A secondary link joins an angle only when it is strong and runs through
      // one of the fact's central themes (not a passing mention).
      if (li > 0 && link.fit < 0.45) return;
      const total = link.themes.reduce((n, t) => n + t.value, 0) || 1;
      for (const t of pickThemes(link.themes)) {
        if (li > 0 && (!central.has(t.key) || (s.features.themes.get(t.key) ?? 0) < 0.75)) continue;
        const c = touch(`${link.source.id}|${t.key}`, t.key, link.source, null);
        const value = link.fit * (0.4 + 0.6 * (t.value / total)) * rankWeight(d.rank);
        const prev = c.support.get(s.fact.id);
        if (!prev || prev.value < value) c.support.set(s.fact.id, { value, detail: d });
        for (const o of link.themes) if (o.key !== t.key) c.related.set(o.key, (c.related.get(o.key) ?? 0) + o.value);
      }
    });
    for (const side of [s.interest, s.major]) {
      if (!side || side.fit < 0.3) continue;
      const t = pickThemes(side.themes)[0];
      if (!t) continue;
      const pseudo = side.source.kind === "major" ? "majors" : "interests";
      const c = touch(`${pseudo}|${t.key}`, t.key, null, side.source);
      const value = 0.6 * side.fit * rankWeight(d.rank);
      const prev = c.support.get(s.fact.id);
      if (!prev || prev.value < value) c.support.set(s.fact.id, { value, detail: d });
    }
  }

  // Interest and major angles only for themes no activity angle already covers.
  const activityThemes = new Set([...clusters.values()].filter((c) => c.activity).map((c) => c.theme));
  const out: AngleCandidate[] = [];
  for (const c of clusters.values()) {
    if (!c.activity && activityThemes.has(c.theme)) continue;
    const support = [...c.support.values()].sort((a, b) => b.value - a.value || a.detail.rank - b.detail.rank);
    // Keep supporting details that carry real weight next to the strongest one.
    const top = support.filter((x, i) => i === 0 || x.value >= 0.45 * support[0].value).slice(0, 3);
    const base = top.reduce((n, x) => n + x.value, 0);
    const depth = c.activity ? 0.8 + 0.2 * c.activity.depth : 0.75;
    const specificity = 0.85 + 0.1 * Math.min(1.5, themeWeight(c.theme));
    const uniq = top.reduce((n, x) => n + (uniqueness.get(x.detail.scored.fact.id) ?? 60), 0) / Math.max(1, top.length);
    const substance = top.reduce((n, x) => n + (KIND_SUBSTANCE[x.detail.scored.fact.kind] ?? 0.9), 0) / Math.max(1, top.length);
    const score = base * (1 + 0.3 * Math.min(2, top.length - 1)) * depth * specificity * (0.6 + 0.4 * (uniq / 100)) * substance;
    const topic = themeLabel(c.theme);
    const lineDetails = top.map((x) => x.detail);
    const line = angleLine(topic, sourcePhrase(c, false), sourcePhrase(c, true), lineDetails);
    const related = [...c.related.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k]) => k);
    out.push({
      key: c.key,
      activityId: c.activity?.id ?? null,
      theme: c.theme,
      factIds: top.map((x) => x.detail.scored.fact.id),
      themes: [c.theme, ...related.slice(0, 2)],
      score,
      line,
    });
  }
  // Activity angles before interest and major angles at equal strength.
  return out.sort((a, b) => b.score - a.score || Number(b.activityId != null) - Number(a.activityId != null) || a.key.localeCompare(b.key));
}

/** Fallback when the details support fewer than two angles: one per detail theme. */
export function fallbackCandidates(details: RankedDetail[], schoolShortName: string, existing: Set<string>): AngleCandidate[] {
  const out: AngleCandidate[] = [];
  for (const d of details) {
    const theme = [...d.scored.features.themes.entries()].sort((a, b) => b[1] * themeWeight(b[0]) - a[1] * themeWeight(a[0]) || a[0].localeCompare(b[0]))[0]?.[0];
    if (!theme) continue;
    const key = `school|${theme}`;
    if (existing.has(key) || out.some((o) => o.key === key)) continue;
    const name = d.scored.features.longName;
    let line = `${themeLabel(theme)}: what ${name} would add to your time at ${schoolShortName}.`;
    if (line.length > MAX_ANGLE_LENGTH) line = `${themeLabel(theme)}: what ${d.scored.features.name} would add at ${schoolShortName}.`;
    if (line.length > MAX_ANGLE_LENGTH) continue;
    out.push({ key, activityId: null, theme, factIds: [d.scored.fact.id], themes: [theme], score: 0.1 * d.scored.score, line });
  }
  return out;
}

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

function leadScore(c: AngleCandidate, used: UsedLeads): number {
  // A lead built on something the student did beats one built on a stated interest.
  let v = c.activityId ? c.score : 0.4 * c.score;
  if (used.keys.has(c.key)) v *= 0.01;
  if (c.activityId && used.activities.has(c.activityId)) v *= 0.55;
  if (used.themes.has(c.theme)) v *= 0.75;
  return v;
}

/** Lead first, then one or two more; the rest are kept as options for cross-school coordination. */
export function chooseAngles(cands: AngleCandidate[], used: UsedLeads): { shown: AngleCandidate[]; options: AngleCandidate[] } {
  if (cands.length === 0) return { shown: [], options: [] };
  const byLead = [...cands].sort((a, b) => leadScore(b, used) - leadScore(a, used) || b.score - a.score || a.key.localeCompare(b.key));
  const lead = byLead[0];
  const shown = [lead];
  const rest = cands.filter((c) => c !== lead);
  while (shown.length < 3 && rest.length > 0) {
    const distinct = (c: AngleCandidate) =>
      (!c.activityId || !shown.some((s) => s.activityId === c.activityId)) && !shown.some((s) => s.theme === c.theme);
    const score2 = (c: AngleCandidate) => {
      let v = c.activityId ? c.score : 0.8 * c.score;
      if (!distinct(c)) v *= 0.35;
      if (used.keys.has(c.key)) v *= 0.8;
      return v;
    };
    rest.sort((a, b) => score2(b) - score2(a) || b.score - a.score || a.key.localeCompare(b.key));
    const next = rest[0];
    // A third angle must add a new direction and carry some weight.
    if (shown.length >= 2 && (score2(next) < 0.3 * lead.score || !distinct(next))) break;
    shown.push(next);
    rest.splice(0, 1);
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
  for (const c of rest) if (options.length < 8 && !options.includes(c)) options.push(c);
  return { shown, options: options.slice(0, 10) };
}

export function toEssayAngle(c: AngleCandidate, isLead: boolean): EssayAngle {
  return {
    key: c.key,
    line: c.line,
    factIds: [...c.factIds],
    activityIds: c.activityId ? [c.activityId] : [],
    themes: [...c.themes],
    isLead,
  };
}
