/**
 * Name index over a school's verified facts, used to confirm claims in a
 * draft (and to recognize another school's details).
 *
 * Every fact contributes its official names: course codes, the name on the
 * page, the title (with and without a parenthetical or the school's own name),
 * acronyms in parentheses, and people. Matching is tolerant of case,
 * punctuation, articles and possessives, and of a shorter or slightly longer
 * form of the official name, but not of misspellings: a near miss is reported
 * as "could not confirm", never silently accepted.
 */
import type { Fact, School } from "@/lib/types";
import { codeKey, codePrefix, type Claim } from "./claims";
import { COMMON_ACRONYMS, COMMON_NAME_WORDS, CONNECTORS, GENERIC_UNIT_WORDS, HEAD_NOUNS } from "./lexicon";
import { containsWords, editDistance, findNormalized, norm, normName, type NormalizedText } from "./text";

/** Normalized form that keeps a leading article ("the dartmouth"). */
function normalizeTitle(s: string): string {
  return norm(s);
}

function atSentenceStart(text: string, start: number): boolean {
  const before = text.slice(0, start).trimEnd();
  return before.length === 0 || /[.!?:;"“(\n]$/.test(before);
}

export type EntryKind = "code" | "person" | "name" | "acronym";

export interface NameEntry {
  kind: EntryKind;
  /** Normalized key (codeKey for course codes). */
  key: string;
  display: string;
  fact: Fact;
  /** Specific enough to identify this school when it appears in a draft for another school. */
  distinctive: boolean;
  /**
   * Names that are only a title with an article ("The Dartmouth", "The Stretch"):
   * they count only when written exactly so, and not at the start of a sentence.
   */
  exactCase?: boolean;
}

export interface FactIndex {
  school: School;
  facts: Fact[];
  entries: NameEntry[];
  byKey: Map<string, NameEntry[]>;
  /** Course subject prefixes, lowercase ("engs"). */
  prefixes: Set<string>;
  /** Normalized verbatim quotes, for phrases that appear on a fact's source page. */
  quotes: { fact: Fact; text: string }[];
  /** Tokens of the school's own name ("dartmouth"). */
  schoolTokens: Set<string>;
}

export interface FactMatch {
  fact: Fact;
  entry: NameEntry | null;
  via: "name" | "quote";
}

const CODE_IN_TITLE = /\b([A-Z]{2,8}(?:&[A-Z]{1,3})?)[  -]?(\d{1,4}[A-Z]?(?:\.\d{1,3})?)\b/g;

/** Extra words a student may add around an official name ("the Dartmouth Cycling Club" for "Dartmouth Cycling"). */
const ALLOWED_EXTRA = new Set([
  ...CONNECTORS,
  "club",
  "team",
  "program",
  "lab",
  "laboratory",
  "center",
  "centre",
  "society",
  "group",
  "organization",
  "ensemble",
  "studio",
  "project",
  "initiative",
  "college",
  "university",
]);

/** Tokens that name the school itself ("dartmouth", "penn", "upenn"). */
export function schoolNameTokens(school: School): Set<string> {
  const out = new Set<string>();
  const add = (s: string | undefined) => {
    for (const t of normName(s ?? "").split(" ")) if (t.length >= 3 && !GENERIC_UNIT_WORDS.has(t) && !CONNECTORS.has(t)) out.add(t);
  };
  add(school.name);
  add(school.shortName);
  for (const d of school.officialDomains ?? []) add(d.split(".")[0]);
  return out;
}

function tokensOf(key: string): string[] {
  return key ? key.split(" ") : [];
}

/** Name tokens without initials ("carl e renshaw" -> carl, renshaw). */
function personTokens(key: string): string[] {
  return tokensOf(key).filter((t) => t.length > 1);
}

function hasDistinctiveToken(tokens: string[]): boolean {
  return tokens.some((t) => t.length >= 3 && !/^\d+$/.test(t) && !COMMON_NAME_WORDS.has(t) && !CONNECTORS.has(t) && !HEAD_NOUNS.has(t));
}

function acronymLike(s: string): boolean {
  return /^[A-Z][A-Z0-9&+]{1,9}s?$/.test(s) && /[A-Z].*[A-Z]/.test(s);
}

/** Every official name of a fact, with its kind. */
function variantsOf(fact: Fact, school: School): { kind: EntryKind; display: string; stripped?: boolean }[] {
  const out: { kind: EntryKind; display: string; stripped?: boolean }[] = [];
  const title = (fact.title ?? "").trim();
  const onPage = (fact.nameOnPage ?? "").trim();
  const shorts = [school.shortName, school.name].filter(Boolean).map((s) => s.trim());

  if (fact.kind === "course") {
    for (const source of [title, onPage]) {
      CODE_IN_TITLE.lastIndex = 0;
      for (let m = CODE_IN_TITLE.exec(source); m; m = CODE_IN_TITLE.exec(source)) out.push({ kind: "code", display: `${m[1]} ${m[2]}` });
    }
    const plain = title.replace(/^[A-Z]{2,8}(?:&[A-Z]{1,3})?[  -]?\d{1,4}[A-Z]?(?:\.\d{1,3})?\s*[:\-–—]?\s*/, "").trim();
    if (plain && plain !== title) out.push({ kind: "name", display: plain });
    return out;
  }

  const person = (display: string) => {
    if (!display) return;
    out.push({ kind: "person", display });
    // "Carl E. Renshaw" is also written "Carl Renshaw".
    const plain = display.replace(/\s+\p{Lu}\.(?=\s)/gu, "").trim();
    if (plain !== display && plain.split(/\s+/).length >= 2) out.push({ kind: "person", display: plain });
  };
  if (fact.kind === "faculty") person(title.split(",")[0].trim());
  for (const p of fact.people ?? []) person(p.trim());
  if (fact.kind === "faculty") return out;

  const names = new Set<string>([onPage, title]);
  const noParen = title.replace(/\s*\([^)]*\)\s*$/, "").trim();
  names.add(noParen);
  const paren = /\(([^)]+)\)\s*$/.exec(title)?.[1]?.trim();
  if (paren && acronymLike(paren)) out.push({ kind: "acronym", display: paren.replace(/(?<=[A-Z])s$/, "") });
  for (const n of [...names]) {
    for (const s of shorts) {
      const at = new RegExp(`\\s+(?:at|of)\\s+${escapeRe(s)}$`, "i");
      if (at.test(n)) names.add(n.replace(at, "").trim());
    }
  }
  for (const n of names) {
    if (!n) continue;
    if (acronymLike(n)) {
      out.push({ kind: "acronym", display: n.replace(/(?<=[A-Z])s$/, "") });
      continue;
    }
    out.push({ kind: "name", display: n });
    for (const s of shorts) {
      const lead = new RegExp(`^${escapeRe(s)}(?:['’]s)?\\s+`, "i");
      if (lead.test(n)) {
        const rest = n.replace(lead, "").trim();
        if (rest.split(/\s+/).length >= 2) out.push({ kind: "name", display: rest, stripped: true });
      }
    }
  }
  return out;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The school's own names, normalized ("dartmouth", "dartmouth college"): never a fact's name on their own. */
function selfNames(school: School): Set<string> {
  return new Set([school.name, school.shortName, ...(school.officialDomains ?? []).map((d) => d.split(".")[0])].map((s) => normName(s ?? "")).filter(Boolean));
}

export function buildFactIndex(school: School, facts: Fact[]): FactIndex {
  const schoolTokens = schoolNameTokens(school);
  const self = selfNames(school);
  const entries: NameEntry[] = [];
  const seen = new Set<string>();
  const prefixes = new Set<string>();
  const quotes: { fact: Fact; text: string }[] = [];
  // Most recently verified first, so ties resolve to the freshest citation.
  const ordered = [...facts].sort((a, b) => (b.verifiedAt ?? "").localeCompare(a.verifiedAt ?? "") || a.id.localeCompare(b.id));
  for (const fact of ordered) {
    if (fact.quote) quotes.push({ fact, text: normName(fact.quote) });
    for (const v of variantsOf(fact, school)) {
      let key = v.kind === "code" ? codeKey(v.display) : normName(v.display);
      if (!key) continue;
      let exactCase = false;
      if (v.kind === "name") {
        const bare = v.display.replace(/^(?:the|a|an)\s+/i, "");
        const articled = bare !== v.display;
        const single = tokensOf(key).length === 1;
        if (articled && (single || self.has(key))) {
          // "The Dartmouth" (a newspaper) is not "Dartmouth"; "The Stretch" is not "stretch".
          key = normalizeTitle(v.display);
          exactCase = true;
        } else if (self.has(key) || (single && !/\p{Lu}.*\p{Lu}/u.test(bare))) {
          continue;
        }
      }
      const tokens = tokensOf(key);
      const dedupe = `${v.kind}|${key}|${fact.id}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      if (v.kind === "code") prefixes.add(codePrefix(v.display));
      let distinctive = false;
      switch (v.kind) {
        case "code":
          distinctive = true;
          break;
        case "person":
          distinctive = personTokens(key).length >= 2;
          break;
        case "acronym":
          distinctive = key.replace(/ /g, "").length >= 4 && !COMMON_ACRONYMS.has(key.replace(/ /g, ""));
          break;
        case "name": {
          const namesSchool = tokens.some((t) => schoolTokens.has(t));
          const restricted = fact.kind === "course" || fact.kind === "major" || fact.kind === "location";
          distinctive = namesSchool || (!restricted && !v.stripped && hasDistinctiveToken(tokens));
          break;
        }
      }
      if (exactCase) distinctive = false;
      entries.push({ kind: v.kind, key, display: v.display, fact, distinctive, ...(exactCase ? { exactCase } : {}) });
    }
  }
  const byKey = new Map<string, NameEntry[]>();
  for (const e of entries) {
    const list = byKey.get(e.key);
    if (list) list.push(e);
    else byKey.set(e.key, [e]);
  }
  return { school, facts: ordered, entries, byKey, prefixes, quotes, schoolTokens };
}

/* ------------------------------------------------------------------ */
/* Matching claims                                                      */
/* ------------------------------------------------------------------ */

function quoteMatch(idx: FactIndex, key: string): FactMatch | null {
  for (const q of idx.quotes) if (containsWords(q.text, key)) return { fact: q.fact, entry: null, via: "quote" };
  return null;
}

function multisetMinus(a: string[], b: string[]): string[] {
  const rest = [...b];
  const out: string[] = [];
  for (const t of a) {
    const i = rest.indexOf(t);
    if (i >= 0) rest.splice(i, 1);
    else out.push(t);
  }
  return out;
}

/** The fact a claim names at this school, if any. */
export function matchHere(claim: Pick<Claim, "kind" | "query">, idx: FactIndex): FactMatch | null {
  if (claim.kind === "course") {
    const key = codeKey(claim.query);
    const hit = (idx.byKey.get(key) ?? []).find((e) => e.kind === "code");
    if (hit) return { fact: hit.fact, entry: hit, via: "name" };
    return quoteMatch(idx, key);
  }

  const key = normName(claim.query);
  if (!key) return null;
  const tokens = tokensOf(key);

  if (claim.kind === "person") {
    const want = personTokens(key);
    const people = idx.entries.filter((e) => e.kind === "person");
    const full = people.find((e) => personTokens(e.key).join(" ") === want.join(" "));
    if (full) return { fact: full.fact, entry: full, via: "name" };
    if (want.length === 1) {
      const last = people.find((e) => personTokens(e.key).at(-1) === want[0]);
      if (last) return { fact: last.fact, entry: last, via: "name" };
      return null;
    }
    return want.length >= 2 ? quoteMatch(idx, key) : null;
  }

  const exact = (idx.byKey.get(key) ?? []).find((e) => e.kind !== "code");
  if (exact) return { fact: exact.fact, entry: exact, via: "name" };
  if (claim.kind === "acronym") return null;

  let best: { entry: NameEntry; score: number } | null = null;
  for (const e of idx.entries) {
    if (e.kind !== "name") continue;
    const et = tokensOf(e.key);
    let score = 0;
    if (tokens.length >= 2 && et.length > tokens.length && containsWords(e.key, key)) {
      // A shorter form of the official name ("Irving Institute").
      const coverage = tokens.length / et.length;
      if (coverage >= 0.5 || hasDistinctiveToken(tokens)) score = 2 + coverage;
    } else if (et.length >= 2 && tokens.length > et.length && containsWords(key, e.key)) {
      // The official name plus the school's name or a generic noun ("Dartmouth Cycling Club").
      const extra = multisetMinus(tokens, et);
      if (extra.every((t) => ALLOWED_EXTRA.has(t) || idx.schoolTokens.has(t))) score = 3;
    }
    if (score > 0 && (!best || score > best.score || (score === best.score && e.key.length > best.entry.key.length))) best = { entry: e, score };
  }
  if (best) return { fact: best.entry.fact, entry: best.entry, via: "name" };
  return tokens.length >= 2 ? quoteMatch(idx, key) : null;
}

/** A fact whose name differs from the claim by a small misspelling, for pointing to the closest official page. */
export function nearMiss(claim: Pick<Claim, "kind" | "query">, idx: FactIndex): Fact | null {
  if (claim.kind === "course") return null;
  const key = normName(claim.query);
  const tokens = claim.kind === "person" ? personTokens(key) : tokensOf(key);
  if (tokens.length === 0) return null;
  for (const e of idx.entries) {
    if (e.kind === "code") continue;
    let et = e.kind === "person" ? personTokens(e.key) : tokensOf(e.key);
    if (claim.kind === "person" && tokens.length === 1 && e.kind === "person") et = et.slice(-1);
    if (et.length !== tokens.length) continue;
    let diffs = 0;
    let close = true;
    for (let i = 0; i < et.length && close; i++) {
      if (et[i] === tokens[i]) continue;
      diffs++;
      const a = et[i];
      const b = tokens[i];
      const allowed = Math.max(a.length, b.length) >= 7 ? 2 : 1;
      if (Math.min(a.length, b.length) < 4 || editDistance(a, b, allowed) > allowed) close = false;
    }
    if (close && diffs === 1) return e.fact;
  }
  return null;
}

/**
 * The fact a claim names at another school, judged strictly: exact course
 * codes whose subject the current school does not use, full names of people,
 * and distinctive official names.
 */
export function matchElsewhere(claim: Pick<Claim, "kind" | "query">, idx: FactIndex, currentPrefixes: Set<string>): FactMatch | null {
  if (claim.kind === "course") {
    const key = codeKey(claim.query);
    if (currentPrefixes.has(codePrefix(claim.query))) return null;
    const hit = (idx.byKey.get(key) ?? []).find((e) => e.kind === "code");
    return hit ? { fact: hit.fact, entry: hit, via: "name" } : null;
  }
  const key = normName(claim.query);
  if (!key) return null;
  if (claim.kind === "person") {
    const want = personTokens(key);
    if (want.length < 2) return null;
    const hit = idx.entries.find((e) => e.kind === "person" && e.distinctive && personTokens(e.key).join(" ") === want.join(" "));
    return hit ? { fact: hit.fact, entry: hit, via: "name" } : null;
  }
  const exact = (idx.byKey.get(key) ?? []).find((e) => e.kind !== "code" && e.distinctive);
  if (exact) return { fact: exact.fact, entry: exact, via: "name" };
  if (claim.kind === "acronym") return null;
  const tokens = tokensOf(key);
  for (const e of idx.entries) {
    if (e.kind !== "name" || !e.distinctive) continue;
    const et = tokensOf(e.key);
    if (et.length >= 2 && tokens.length > et.length && containsWords(key, e.key)) return { fact: e.fact, entry: e, via: "name" };
    if (tokens.length >= 2 && et.length > tokens.length && containsWords(e.key, key) && hasDistinctiveToken(tokens) && tokens.length / et.length >= 0.5) {
      return { fact: e.fact, entry: e, via: "name" };
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Scanning a draft for known names                                     */
/* ------------------------------------------------------------------ */

export interface KnownHit {
  start: number;
  end: number;
  entry: NameEntry;
}

const SIGNIFICANT = /[\p{L}\p{N}][\p{L}\p{N}'’.\-]*/gu;

/** Small words that stay lowercase inside official names ("Campus as Lab", "Trip to the Sea"). */
const SMALL_WORDS = new Set([...CONNECTORS, "as", "with", "a", "an"]);

/** The draft's words for a hit are written as a name (capitalized), not as ordinary words. */
function writtenAsName(original: string, entry: NameEntry): boolean {
  if (entry.kind === "acronym") return /^[A-Z0-9&+.\- ]+s?$/.test(original) && /[A-Z]{2}/.test(original);
  const words = original.match(SIGNIFICANT) ?? [];
  const significant = words.filter((w) => !SMALL_WORDS.has(w.toLowerCase()));
  if (significant.length === 0) return false;
  return significant.every((w) => /^[\p{Lu}\p{N}]/u.test(w));
}

/**
 * Official names of `idx`'s facts that appear in the draft, written as names.
 * A hit that is only the end of a longer capitalized name ("Lincoln High Outing
 * Club") does not count. Course codes are found by the claim extractor instead.
 */
export function scanKnownNames(text: string, hay: NormalizedText, idx: FactIndex, opts: { distinctiveOnly: boolean }): KnownHit[] {
  const hits: KnownHit[] = [];
  for (const entry of idx.entries) {
    if (entry.kind === "code") continue;
    if (opts.distinctiveOnly && !entry.distinctive) continue;
    for (const r of findNormalized(hay, entry.key, 20)) {
      // Ranges stop before a possessive ("Club's" -> "Club"): the apostrophe folds to a space.
      const end = r.end;
      const original = text.slice(r.start, end);
      if (entry.exactCase ? original !== entry.display || atSentenceStart(text, r.start) : !writtenAsName(original, entry)) continue;
      const before = /(\p{Lu}[\p{L}'’\-]*)[ \t ]+$/u.exec(text.slice(Math.max(0, r.start - 40), r.start));
      if (before && entry.kind !== "person" && !/^(?:The|A|An)$/.test(before[1]) && !idx.schoolTokens.has(normName(before[1]))) {
        // "Cornell's Outing Club" belongs to whoever is named in the possessive.
        if (/['’]s$/.test(before[1])) continue;
        // Preceded by another capitalized word: part of a longer, different name, unless at a sentence start.
        const prevChar = text.slice(0, r.start - before[0].length).trimEnd().slice(-1);
        if (prevChar && !/[.!?:;"“(]/.test(prevChar)) continue;
      }
      hits.push({ start: r.start, end, entry });
    }
  }
  // Longest first, then position; drop hits inside a longer one.
  hits.sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start);
  const kept: KnownHit[] = [];
  for (const h of hits) if (!kept.some((k) => h.start < k.end && k.start < h.end)) kept.push(h);
  return kept.sort((a, b) => a.start - b.start);
}
