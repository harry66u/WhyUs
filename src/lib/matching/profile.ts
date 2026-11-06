/**
 * Student profile model for matching: what each activity is about (themes),
 * how deep it goes (hours across grades, leadership), the concrete things it
 * names, and how to refer to it in a plain sentence.
 */
import type { Activity, StudentProfile } from "@/lib/types";
import { THEMES, themeWeight } from "./themes";
import { articleFor, clamp, contentBigrams, contentStems, nounPhraseAround } from "./text";

export interface ActivityProfile {
  id: string;
  index: number;
  activity: Activity;
  title: string;
  /** theme key -> salience (title 1, description 0.9, role 0.7, organization and category 0.5) */
  themes: Map<string, number>;
  /** 0.25-1: estimated total hours across grades, plus leadership. 0.62 when hours are unknown. */
  depth: number;
  /** Estimated total hours, null when the profile has no hours. */
  hours: number | null;
  leadership: boolean;
  /** content stem -> weight */
  tokens: Map<string, number>;
  bigrams: Set<string>;
  /** Text to quote short phrases from (the description, else the title). */
  evidenceText: string;
  /** "your Creek Watch Sensor Network", "your role as a Volunteer Interpreter" */
  ref: string;
  /** Shorter reference for one-line angles. */
  shortRef: string;
  /** Shortest reference, for lines that would otherwise run long. */
  tinyRef: string;
  /** Concrete noun phrases from the description ("solar-powered Arduino sensors", "open data dashboard"). */
  nouns: string[];
}

export interface InterestProfile {
  kind: "interest" | "major";
  index: number;
  text: string;
  themes: Map<string, number>;
  tokens: Map<string, number>;
  bigrams: Set<string>;
}

export interface StudentThemes {
  activities: ActivityProfile[];
  interests: InterestProfile[];
  majors: InterestProfile[];
  /** Every theme in the profile, strongest first, with where it comes from (activity ids, "interests", "majors"). */
  themes: { key: string; weight: number; sources: string[] }[];
}

/**
 * How central a theme is to an activity, by where it appears. Description
 * mentions grow with repetition: a theme named once in passing ("energy and
 * water policy case files") counts less than one the activity is built on.
 */
const FIELD_SALIENCE = { title: 1, role: 0.6, organization: 0.45, category: 0.5 } as const;

function descriptionSalience(mentions: number): number {
  return mentions <= 0 ? 0 : 0.55 + 0.12 * Math.min(3, mentions);
}

/** Common App activity categories that imply a theme the text may not name. */
const CATEGORY_THEMES: [RegExp, string][] = [
  [/\bresearch\b/i, "undergraduate-research"],
  [/\benvironmental\b/i, "environmental-studies"],
  [/\bwork \(paid\)|\binternship|career[- ]oriented/i, "career"],
  [/\bjournalism|publication/i, "journalism"],
  [/\bcomputer|technology\b/i, "computer-science"],
  [/\bathletics\b/i, "athletics"],
  [/^art$|\bart\b(?!s)/i, "visual-arts"],
  [/\bcultural\b/i, "cultural-identity"],
  [/\bforeign exchange\b/i, "study-abroad"],
  [/\bforeign language\b/i, "languages"],
  [/\blgbt/i, "lgbtq"],
  [/\bstudent govt|politics\b/i, "political-science"],
];

/** Rank and position words: they describe responsibility, not subject matter. */
const RANK_WORDS =
  /\b(?:co-?)?(?:founder|founding|captain|president|vice[- ]president|chair(?:person)?|head|lead|leader|director|varsity|junior varsity|jv|member|officer|secretary|treasurer|editor[- ]in[- ]chief|manager|coordinator|organizer|independent|senior|junior)\b/gi;

const LEADERSHIP =
  /\b(?:co-?)?(?:founder|founded|captain|president|chair(?:person)?|head|lead|leader|director|editor[- ]in[- ]chief|organizer|manager|coordinator|section leader|concertmaster|drum major|first chair|principal)\b/i;

const ROLE_NOUN =
  /\b(?:intern|volunteer|interpreter|translator|tutor|mentor|counselor|counsellor|assistant|aide|mechanic|lifeguard|cashier|employee|worker|staff|captain|co-captain|president|member|leader|coordinator|instructor|coach|editor|writer|reporter|researcher|ambassador|representative|delegate|founder|organizer|officer|manager|technician|apprentice|fellow|guide|docent|referee|umpire|server|barista|host|associate|analyst|developer|engineer|clerk|caregiver|babysitter|teacher|trainer|accompanist)s?$/i;

/** Number of school grades an activity spans ("10, 11, 12" -> 3, "9-12" -> 4, "Summer after 11" -> 1). */
export function gradeCount(grades?: string): number {
  if (!grades) return 1;
  const g = grades.toLowerCase();
  const set = new Set<number>();
  for (const m of g.matchAll(/(\d{1,2})\s*(?:-|–|—|to|through)\s*(\d{1,2})/g)) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a >= 6 && b <= 12 && a <= b) for (let i = a; i <= b; i++) set.add(i);
  }
  for (const m of g.matchAll(/\b(9|10|11|12)\b/g)) set.add(Number(m[1]));
  if (/\bpg\b|post-?grad/.test(g)) set.add(13);
  return Math.max(1, set.size);
}

function estimateHours(a: Activity): number | null {
  const h = Number(a.hoursPerWeek);
  if (!Number.isFinite(h) || h <= 0) return null;
  const w = Number(a.weeksPerYear);
  const weeks = Number.isFinite(w) && w > 0 ? Math.min(w, 52) : 30;
  return Math.min(h, 80) * weeks * gradeCount(a.grades);
}

function depthOf(a: Activity, leadership: boolean): { depth: number; hours: number | null } {
  const hours = estimateHours(a);
  let depth = hours == null ? 0.62 : clamp(0.25 + (0.75 * Math.log(1 + hours)) / Math.log(1 + 1200), 0.25, 1);
  if (leadership) depth = Math.min(1, depth + 0.08);
  return { depth, hours };
}

const GLOBAL_PATTERNS = new Map<string, RegExp>();

function countMentions(key: string, source: RegExp, text: string): number {
  if (!text) return 0;
  let re = GLOBAL_PATTERNS.get(key);
  if (!re) {
    re = new RegExp(source.source, "gi");
    GLOBAL_PATTERNS.set(key, re);
  }
  re.lastIndex = 0;
  let n = 0;
  while (re.exec(text)) {
    n++;
    if (re.lastIndex === 0 || n >= 6) break;
  }
  return n;
}

/** Theme salience from short fields (fixed weights) and an optional description (weighted by mentions). */
function themeSalience(fields: [string, number][], description = ""): Map<string, number> {
  const out = new Map<string, number>();
  for (const th of THEMES) {
    let s = descriptionSalience(countMentions(th.key, th.pattern, description));
    for (const [text, w] of fields) if (w > s && text && th.pattern.test(text)) s = w;
    if (s > 0) out.set(th.key, s);
  }
  return out;
}

function tokenWeights(fields: [string, number][]): { tokens: Map<string, number>; bigrams: Set<string> } {
  const tokens = new Map<string, number>();
  const bigrams = new Set<string>();
  for (const [text, w] of fields) {
    if (!text) continue;
    for (const s of contentStems(text)) if ((tokens.get(s) ?? 0) < w) tokens.set(s, w);
    for (const b of contentBigrams(text)) bigrams.add(b);
  }
  return { tokens, bigrams };
}

function endsWithRoleNoun(text: string): boolean {
  return ROLE_NOUN.test(text.trim());
}

/** How a sentence refers to the activity. */
export function activityRefs(a: Activity): { ref: string; shortRef: string; tinyRef: string } {
  const title = a.title.trim().replace(/\s+/g, " ");
  const parts = title.split(/\s*,\s*/);
  if (parts.length >= 2 && parts[0].split(/\s+/).length <= 4 && endsWithRoleNoun(parts[0])) {
    const role = parts[0];
    const org = parts.slice(1).join(", ");
    return { ref: `your role as ${articleFor(role)} ${role} at ${org}`, shortRef: `your work at ${org}`, tinyRef: `your ${role} role` };
  }
  if (title.split(/\s+/).length <= 5 && endsWithRoleNoun(title)) {
    return { ref: `your role as ${articleFor(title)} ${title}`, shortRef: `your work as ${articleFor(title)} ${title}`, tinyRef: `your ${title} role` };
  }
  const words = title.split(/\s+/);
  return { ref: `your ${title}`, shortRef: `your ${title}`, tinyRef: `your ${words.length > 5 ? words.slice(0, 5).join(" ") : title}` };
}

function nounPhrases(text: string, themes: Map<string, number>): string[] {
  const out: string[] = [];
  const keys = [...themes.keys()].sort((a, b) => themeWeight(b) - themeWeight(a) || a.localeCompare(b));
  for (const key of keys) {
    const th = THEMES.find((t) => t.key === key);
    const m = th?.pattern.exec(text);
    if (!m) continue;
    const p = nounPhraseAround(text, m.index, m.index + m[0].length);
    if (p && p.length <= 42 && !out.some((o) => o.toLowerCase() === p.toLowerCase())) out.push(p);
    if (out.length >= 6) break;
  }
  return out;
}

/** "Summer Intern, County Soil and Water Conservation District" -> role part and organization part. */
function splitRoleTitle(title: string): { name: string; org: string } {
  const parts = title.split(/\s*,\s*/);
  if (parts.length >= 2 && parts[0].split(/\s+/).length <= 4 && endsWithRoleNoun(parts[0])) {
    return { name: parts[0], org: parts.slice(1).join(", ") };
  }
  return { name: title, org: "" };
}

function activityProfile(a: Activity, index: number): ActivityProfile {
  const title = (a.title ?? "").trim();
  const description = (a.description ?? "").trim();
  const roleText = (a.role ?? "").replace(RANK_WORDS, " ").replace(/\s+/g, " ").trim();
  const leadership = LEADERSHIP.test(`${a.role ?? ""} ${title}`);
  const titleParts = splitRoleTitle(title);
  const themes = themeSalience(
    [
      [titleParts.name, FIELD_SALIENCE.title],
      [roleText, FIELD_SALIENCE.role],
      [[titleParts.org, a.organization ?? ""].filter(Boolean).join("\n"), FIELD_SALIENCE.organization],
      [a.category ?? "", FIELD_SALIENCE.category],
    ],
    description,
  );
  for (const [re, key] of CATEGORY_THEMES) {
    if (a.category && re.test(a.category) && (themes.get(key) ?? 0) < FIELD_SALIENCE.category) themes.set(key, FIELD_SALIENCE.category);
  }
  const { tokens, bigrams } = tokenWeights([
    [title, 1],
    [description, 0.9],
    [roleText, 0.6],
    [a.organization ?? "", 0.5],
  ]);
  const { depth, hours } = depthOf(a, leadership);
  const { ref, shortRef, tinyRef } = activityRefs({ ...a, title: title || "activity" });
  const evidenceText = description || title;
  return {
    id: a.id,
    index,
    activity: a,
    title,
    themes,
    depth,
    hours,
    leadership,
    tokens,
    bigrams,
    evidenceText,
    ref,
    shortRef,
    tinyRef,
    nouns: description ? nounPhrases(description, themes) : [],
  };
}

function interestProfile(text: string, kind: "interest" | "major", index: number): InterestProfile {
  const t = text.trim();
  const themes = themeSalience([[t, 1]]);
  const { tokens, bigrams } = tokenWeights([[t, 1]]);
  return { kind, index, text: t, themes, tokens, bigrams };
}

/** Themes, depth, and concrete nouns for each activity, plus interest and intended-major themes. */
export function studentThemes(profile: StudentProfile): StudentThemes {
  const activities = (profile.activities ?? [])
    .filter((a) => a && (a.title?.trim() || a.description?.trim()))
    .map((a, i) => activityProfile(a, i));
  const interests = (profile.interests ?? []).filter((s) => s?.trim()).map((s, i) => interestProfile(s, "interest", i));
  const majors = (profile.intendedMajors ?? []).filter((s) => s?.trim()).map((s, i) => interestProfile(s, "major", i));

  const agg = new Map<string, { weight: number; sources: Set<string> }>();
  const bump = (key: string, w: number, source: string) => {
    const cur = agg.get(key) ?? { weight: 0, sources: new Set<string>() };
    cur.weight = Math.max(cur.weight, w);
    cur.sources.add(source);
    agg.set(key, cur);
  };
  for (const a of activities) for (const [k, s] of a.themes) bump(k, s * (0.6 + 0.4 * a.depth), a.id);
  for (const i of interests) for (const [k, s] of i.themes) bump(k, 0.8 * s, "interests");
  for (const m of majors) for (const [k, s] of m.themes) bump(k, 0.8 * s, "majors");
  const themes = [...agg.entries()]
    .map(([key, v]) => ({ key, weight: v.weight * themeWeight(key), sources: [...v.sources] }))
    .sort((a, b) => b.weight - a.weight || a.key.localeCompare(b.key));

  return { activities, interests, majors, themes };
}
