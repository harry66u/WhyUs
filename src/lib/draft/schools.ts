/**
 * Mentions of the other schools on the student's list: school names, the
 * nickname in an official domain ("upenn"), distinctive unit names ("Wharton",
 * "Ross School of Business"), and the town a school is in. Everything comes
 * from the school registry; generic unit names ("School of Engineering") and
 * names the current school also uses are never treated as another school.
 */
import type { School } from "@/lib/types";
import { COMMON_ACRONYMS, CONNECTORS, GENERIC_UNIT_WORDS, US_STATES, US_STATES_TWO_WORDS } from "./lexicon";
import { containsWords, findNormalized, normName, type NormalizedText, type TextRange } from "./text";

export type SchoolRefKind = "school" | "nickname" | "unit" | "city";

export interface SchoolRef extends TextRange {
  school: School;
  kind: SchoolRefKind;
  /** As written in the draft. */
  text: string;
  /** For units: the unit's official name. */
  unitName?: string;
  /** Low: a town, an acronym, or a one-word unit name that could mean something else. */
  confidence: "high" | "low";
}

interface RefPattern {
  school: School;
  kind: SchoolRefKind;
  key: string;
  raw: string;
  caseSensitive: boolean;
  confidence: "high" | "low";
  unitName?: string;
  /** Only "at Michigan": the bare name is also a state. */
  atOnly?: boolean;
  /** One-word unit names count only on their own, not inside a longer name or at a sentence start. */
  standaloneOnly?: boolean;
}

export interface RefOptions {
  /** Places the student lives or went to school (never flagged as another school's town). */
  ignorePlaces: string[];
  /** Course subject prefixes at the current school (an acronym that is also a prefix is not a unit). */
  currentPrefixes: Set<string>;
}

function splitPlaces(city: string): string[] {
  return city
    .split(/\s*(?:,|&|\/|\band\b)\s*/i)
    .map((c) => c.trim())
    .filter(Boolean);
}

/** Every normalized name the current school answers to (never another school's name). */
export function ownNames(school: School): Set<string> {
  const out = new Set<string>();
  const add = (s: string | undefined) => {
    const k = normName(s ?? "");
    if (k) out.add(k);
  };
  add(school.name);
  add(school.shortName);
  for (const d of school.officialDomains ?? []) add(d.split(".")[0]);
  for (const u of school.units ?? []) {
    add(u.name);
    add(u.shortName);
    for (const a of u.aliases ?? []) add(a);
  }
  for (const c of splitPlaces(school.city ?? "")) add(c);
  return out;
}

function isStateName(key: string): boolean {
  return US_STATES.has(key) || US_STATES_TWO_WORDS.has(key);
}

export function buildRefPatterns(current: School, others: School[], opts: RefOptions): RefPattern[] {
  const own = ownNames(current);
  const ignore = opts.ignorePlaces.map((p) => normName(p)).filter(Boolean);
  const out: RefPattern[] = [];
  const seen = new Set<string>();
  const push = (p: RefPattern) => {
    const id = `${p.school.id}|${p.caseSensitive ? p.raw : p.key}`;
    if (!p.key || seen.has(id) || own.has(p.key)) return;
    seen.add(id);
    out.push(p);
  };

  for (const school of others) {
    if (school.id === current.id) continue;
    push({ school, kind: "school", key: normName(school.name), raw: school.name, caseSensitive: false, confidence: "high" });
    const shortKey = normName(school.shortName);
    if (shortKey && shortKey !== normName(school.name)) {
      const state = isStateName(shortKey);
      push({ school, kind: "school", key: shortKey, raw: school.shortName, caseSensitive: false, confidence: state ? "low" : "high", atOnly: state });
    }
    for (const domain of school.officialDomains ?? []) {
      const label = normName(domain.split(".")[0]);
      if (label.length >= 4 && label !== shortKey && !isStateName(label)) {
        push({ school, kind: "nickname", key: label, raw: label, caseSensitive: false, confidence: "high" });
      }
    }
    for (const unit of school.units ?? []) {
      for (const candidate of [unit.name, unit.shortName ?? "", ...(unit.aliases ?? [])]) {
        const raw = candidate.trim();
        const key = normName(raw);
        if (!key) continue;
        const tokens = key.split(" ");
        if (tokens.every((t) => GENERIC_UNIT_WORDS.has(t) || CONNECTORS.has(t))) continue;
        if (tokens.length === 1) {
          if (/^[A-Z][A-Z&]{1,7}$/.test(raw)) {
            const lower = raw.toLowerCase();
            if (raw.replace(/&/g, "").length < 3 || COMMON_ACRONYMS.has(lower) || opts.currentPrefixes.has(lower)) continue;
            push({ school, kind: "unit", key, raw, caseSensitive: true, confidence: "low", unitName: unit.name });
          } else if (/^\p{Lu}/u.test(raw) && raw.length >= 4) {
            push({ school, kind: "unit", key, raw, caseSensitive: false, confidence: "low", unitName: unit.name, standaloneOnly: true });
          }
          continue;
        }
        push({ school, kind: "unit", key, raw, caseSensitive: false, confidence: "high", unitName: unit.name });
      }
    }
    for (const city of splitPlaces(school.city ?? "")) {
      const key = normName(city);
      if (!key || ignore.some((p) => containsWords(p, key))) continue;
      push({ school, kind: "city", key, raw: city, caseSensitive: false, confidence: "low" });
    }
  }
  return out;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’.\-]*/gu;

function writtenAsName(original: string): boolean {
  const words = original.match(WORD) ?? [];
  const significant = words.filter((w) => !CONNECTORS.has(w.toLowerCase()));
  return significant.length > 0 && significant.every((w) => /^[\p{Lu}\p{N}]/u.test(w));
}

function atSentenceStart(text: string, start: number): boolean {
  const before = text.slice(0, start).trimEnd();
  return before.length === 0 || /[.!?:;"“(\n]$/.test(before);
}

/** The words on either side are capitalized and joined by spaces: part of a longer name ("Diana Ross Hall"). */
function capitalizedNeighbor(text: string, start: number, end: number): boolean {
  const before = /(\S+)([ \t ]+)$/.exec(text.slice(Math.max(0, start - 60), start));
  if (before && /^\p{Lu}/u.test(before[1]) && /\p{L}$/u.test(before[1]) && !atSentenceStart(text, start - before[0].length)) return true;
  return /^[ \t ]+\p{Lu}/u.test(text.slice(end, end + 40));
}

/** Mentions of other schools in the draft, longest first where they overlap. */
export function findSchoolRefs(text: string, hay: NormalizedText, patterns: RefPattern[]): SchoolRef[] {
  const found: SchoolRef[] = [];
  for (const p of patterns) {
    const ranges: TextRange[] = [];
    if (p.caseSensitive) {
      const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(p.raw)}(?![\\p{L}\\p{N}])`, "gu");
      for (const m of text.matchAll(re)) ranges.push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
    } else {
      ranges.push(...findNormalized(hay, p.key, 50));
    }
    for (const r of ranges) {
      const original = text.slice(r.start, r.end);
      if (!p.caseSensitive && p.kind !== "nickname" && !writtenAsName(original)) continue;
      // "Penn State", "Michigan State": a different school.
      if (/^[ \t ]+State\b/.test(text.slice(r.end, r.end + 8))) continue;
      if (p.atOnly && !/\bat[ \t ]+$/i.test(text.slice(Math.max(0, r.start - 6), r.start))) continue;
      if (p.standaloneOnly && (atSentenceStart(text, r.start) || capitalizedNeighbor(text, r.start, r.end))) continue;
      found.push({ start: r.start, end: r.end, school: p.school, kind: p.kind, text: original, unitName: p.unitName, confidence: p.confidence });
    }
  }
  // Keep the longest mention where several overlap; the same span may name more than one school ("SEAS").
  found.sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start);
  const kept: SchoolRef[] = [];
  for (const f of found) {
    const clash = kept.find((k) => f.start < k.end && k.start < f.end);
    if (!clash) kept.push(f);
    else if (clash.start === f.start && clash.end === f.end && clash.school.id !== f.school.id) kept.push(f);
  }
  return kept.sort((a, b) => a.start - b.start || a.school.id.localeCompare(b.school.id));
}
