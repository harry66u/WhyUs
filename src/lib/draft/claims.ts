/**
 * Deterministic extraction of school-specific claims from a draft: course
 * codes, "Professor X" / "Dr. X", capitalized names of labs, centers, programs,
 * clubs and the like, quoted names, named majors, place names, and acronyms.
 *
 * Extraction only finds spans; whether a claim is confirmed, belongs to another
 * school, or cannot be confirmed is decided in check.ts.
 */
import {
  CONNECTORS,
  COMMON_ACRONYMS,
  HEAD_NOUNS,
  LEADING_HEADS,
  NOT_COURSE_PREFIXES,
  PLACE_NOUNS,
  PLACE_PREFIXES,
} from "./lexicon";
import { tokenize, type Sentence, type Token } from "./text";

export type ClaimKind = "course" | "person" | "name" | "quoted" | "major" | "place" | "acronym";

export interface Claim {
  kind: ClaimKind;
  start: number;
  /** Exclusive. */
  end: number;
  /** As written in the draft. */
  text: string;
  /** What to look up: a course code ("ENGS 37"), a person's name without the title, an official name. */
  query: string;
  sentence: number;
  origin: "pattern" | "llm";
  /** Name in possessive form right before the claim ("Dartmouth" in "Dartmouth's Magnuson Center"). */
  possessor?: string;
}

export interface ExtractOptions {
  /** Lowercase course subject prefixes known at the schools on the list ("engs", "cee"). */
  knownPrefixes: Set<string>;
}

/* ------------------------------------------------------------------ */
/* Course codes                                                         */
/* ------------------------------------------------------------------ */

const CODE_RE = /\b([A-Z]{2,8}(?:&[A-Z]{1,3})?)(?:([  -])(\d{1,4}[A-Z]?(?:\.\d{1,3})?)|(\d{2,4}[A-Z]?(?:\.\d{1,3})?))\b/g;

function yearLike(num: string): boolean {
  if (!/^\d{4}$/.test(num)) return false;
  const n = Number(num);
  return n >= 1900 && n <= 2099;
}

/** "ENGS 37", "ENGS-37", "engs37" -> "engs 37". */
export function codeKey(code: string): string {
  const m = /^\s*([A-Za-z]{2,8}(?:&[A-Za-z]{1,3})?)[\s -]*(\d{1,4}[A-Za-z]?(?:\.\d{1,3})?)\s*$/.exec(code);
  if (!m) return code.trim().toLowerCase();
  return `${m[1].toLowerCase()} ${m[2].toLowerCase()}`;
}

export function codePrefix(code: string): string {
  return codeKey(code).split(" ")[0];
}

function courseCodes(text: string, sentences: Sentence[], opts: ExtractOptions): Claim[] {
  const out: Claim[] = [];
  for (const s of sentences) {
    const slice = text.slice(s.start, s.end);
    CODE_RE.lastIndex = 0;
    for (let m = CODE_RE.exec(slice); m; m = CODE_RE.exec(slice)) {
      const prefix = m[1];
      const spaced = m[3] !== undefined;
      const num = spaced ? m[3] : m[4];
      const lower = prefix.toLowerCase();
      const known = opts.knownPrefixes.has(lower);
      if (!known) {
        if (!spaced) continue;
        if (NOT_COURSE_PREFIXES.has(lower) || COMMON_ACRONYMS.has(lower)) continue;
        if (yearLike(num)) continue;
        // Part of a longer all-caps phrase ("WINNER OF ROUND 2"), not a course code.
        if (/[A-Z]{2,}\s+$/.test(slice.slice(0, m.index))) continue;
      }
      const start = s.start + m.index;
      const raw = m[0];
      out.push({ kind: "course", start, end: start + raw.length, text: raw, query: `${prefix} ${num}`, sentence: s.index, origin: "pattern" });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Token helpers                                                        */
/* ------------------------------------------------------------------ */

const NOT_NAME = new Set(["i", "i'm", "i've", "i'd", "i'll", "i’m", "i’ve", "i’d", "i’ll"]);

/** Possessives that are part of an official name ("Women's Center", "President's Fellowship"). */
const POSSESSIVE_NAME_WORDS = new Set(
  "women men children people students student veterans workers president presidents dean deans provost chancellor governor mayor master".split(" "),
);

/** Head nouns that take an "in"/"on" tail: "Program in Environmental Studies", "Initiative on Cities". */
const IN_TAIL_HEADS = new Set(["program", "programs", "center", "centre", "institute", "initiative", "lab", "laboratory", "seminar", "fellowship"]);

function gapText(text: string, a: Token, b: Token): string {
  return text.slice(a.end, b.start);
}

function spaceOnly(gap: string): boolean {
  return /^[ \t ]+$/.test(gap) || /^[ \t ]*\n[ \t ]*$/.test(gap);
}

/** Two tokens belong to one name when only spaces separate them (or ". " after an initial). */
function joinable(text: string, a: Token, b: Token): boolean {
  const gap = gapText(text, a, b);
  if (spaceOnly(gap)) return !a.possessive || POSSESSIVE_NAME_WORDS.has(a.lower);
  if (/^\.[ \t ]+$/.test(gap)) return /^\p{Lu}$/u.test(a.text) || /^(?:st|mt|ft)$/i.test(a.text);
  return false;
}

function isNameWord(t: Token): boolean {
  if (NOT_NAME.has(t.text.toLowerCase())) return false;
  if (/^\d/.test(t.text)) return false;
  return t.cap || t.acronym;
}

function isConnector(t: Token): boolean {
  return !t.cap && CONNECTORS.has(t.lower);
}

function isHead(t: Token): boolean {
  return !isConnector(t) && HEAD_NOUNS.has(t.lower);
}

function spanOf(text: string, tokens: Token[]): { start: number; end: number; text: string } {
  const first = tokens[0];
  const last = tokens[tokens.length - 1];
  const end = last.possessive ? last.end - 2 : last.end;
  return { start: first.start, end, text: text.slice(first.start, end) };
}

/** The possessive name right before token `i` ("Dartmouth's" before "Magnuson"), if any. */
function possessorBefore(text: string, tokens: Token[], i: number): string | undefined {
  const prev = tokens[i - 1];
  if (!prev || !prev.possessive || !prev.cap || !spaceOnly(gapText(text, prev, tokens[i]))) return undefined;
  const names: Token[] = [prev];
  // "University of Michigan's": name words joined by "of" or "the" only ("Ithaca and Cornell's" names two things).
  for (let k = i - 2; k >= 0 && names.length < 6; k--) {
    const t = tokens[k];
    const ok = isNameWord(t) || (isConnector(t) && (t.lower === "of" || t.lower === "the"));
    if (!ok || !spaceOnly(gapText(text, t, tokens[k + 1]))) break;
    names.unshift(t);
  }
  while (names.length > 1 && isConnector(names[0])) names.shift();
  return spanOf(text, names).text;
}

/* ------------------------------------------------------------------ */
/* People                                                               */
/* ------------------------------------------------------------------ */

/** "Professor X" (any case), "Prof. X", "Dr. X", "Doctor X" (capitalized only). */
function titleKind(t: Token): "professor" | "abbrev" | "doctor" | null {
  if (t.lower === "professor" || t.lower === "professors") return "professor";
  if (t.lower === "prof" || t.lower === "dr") return "abbrev";
  if (t.text === "Doctor") return "doctor";
  return null;
}

function people(text: string, s: Sentence, tokens: Token[]): Claim[] {
  const out: Claim[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const kind = titleKind(tokens[i]);
    if (!kind) continue;
    const title = tokens[i];
    let k = i + 1;
    let first = true;
    while (k < tokens.length) {
      const gap = gapText(text, tokens[k - 1], tokens[k]);
      const gapOk = first ? (kind === "abbrev" ? /^\.?[ \t ]+$/.test(gap) : /^[ \t ]+$/.test(gap)) : /^[ \t ]+$/.test(gap);
      if (!gapOk) break;
      const name: Token[] = [];
      let j = k;
      while (j < tokens.length && name.length < 4 && isNameWord(tokens[j]) && !isHead(tokens[j])) {
        if (name.length > 0 && !joinable(text, name[name.length - 1], tokens[j])) break;
        name.push(tokens[j]);
        j++;
        if (name[name.length - 1].possessive) break;
      }
      if (name.length > 0 && /^emerit(?:us|a)$/i.test(name[0].text)) name.shift();
      if (name.length === 0) break;
      const span = spanOf(text, name);
      const start = first ? title.start : name[0].start;
      out.push({ kind: "person", start, end: span.end, text: text.slice(start, span.end), query: span.text, sentence: s.index, origin: "pattern" });
      first = false;
      const after = tokens[j];
      if (after && after.lower === "and" && !after.cap && tokens[j + 1] && isNameWord(tokens[j + 1]) && !name[name.length - 1].possessive) {
        k = j + 1;
        continue;
      }
      break;
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Capitalized names                                                    */
/* ------------------------------------------------------------------ */

interface Run {
  tokens: Token[];
  /** Index of the run's first token within the sentence's tokens. */
  at: number;
}

function capitalizedRuns(text: string, tokens: Token[]): Run[] {
  const runs: Run[] = [];
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (!isNameWord(t)) {
      i++;
      continue;
    }
    // A capitalized first word only starts a name when the next word is capitalized too
    // ("Magnuson Center hosts", not "Studying at the Magnuson Center").
    if (i === 0) {
      const next = tokens[1];
      if (!next || !isNameWord(next) || !joinable(text, t, next)) {
        i++;
        continue;
      }
    }
    let j = i;
    while (j + 1 < tokens.length && j - i < 11) {
      const next = tokens[j + 1];
      if (!joinable(text, tokens[j], next)) break;
      // "Outing Club and Ledyard Canoe Club" are two names.
      if ((next.lower === "and" || next.text === "&") && isHead(tokens[j])) break;
      if (isNameWord(next) || isConnector(next)) j++;
      else break;
    }
    while (j > i && isConnector(tokens[j])) j--;
    for (const part of splitAtAnd(tokens.slice(i, j + 1))) runs.push({ tokens: part.tokens, at: i + part.offset });
    i = j + 1;
  }
  return runs;
}

/** A complete name: a head noun plus at least one other name word ("the Irving Institute", not "Society"). */
function completeName(tokens: Token[]): boolean {
  const content = tokens.filter((t) => !isConnector(t) && !/^(?:the|a|an)$/i.test(t.text));
  return content.some(isHead) && content.some((t) => !isHead(t));
}

/**
 * "Magnuson Center for Entrepreneurship and the Irving Institute" names two
 * things; "Irving Institute for Energy and Society" names one.
 */
function splitAtAnd(run: Token[]): { tokens: Token[]; offset: number }[] {
  for (let k = 1; k < run.length - 1; k++) {
    const t = run[k];
    if (!(t.lower === "and" || t.text === "&") || t.cap) continue;
    const left = run.slice(0, k);
    let r = k + 1;
    while (r < run.length && /^(?:the|a|an)$/i.test(run[r].text)) r++;
    const right = run.slice(r);
    if (right.length > 0 && completeName(left) && completeName(right)) {
      return [{ tokens: left, offset: 0 }, ...splitAtAnd(right).map((p) => ({ tokens: p.tokens, offset: p.offset + r }))];
    }
  }
  return [{ tokens: run, offset: 0 }];
}

/** The named thing inside a capitalized run: a lab, center, program, club, or place. */
function entityFromRun(run: Token[]): { tokens: Token[]; kind: "name" | "place" } | null {
  let tokens = run;
  while (tokens.length > 0 && (isConnector(tokens[0]) || /^(?:the|a|an)$/i.test(tokens[0].text))) tokens = tokens.slice(1);
  if (tokens.length === 0) return null;

  let h = -1;
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (isHead(tokens[i])) {
      h = i;
      break;
    }
  }
  if (h >= 0) {
    let end = h;
    const tail = tokens[h + 1];
    const tailOk = tail && !tail.cap && (tail.lower === "of" || tail.lower === "for" || ((tail.lower === "in" || tail.lower === "on") && IN_TAIL_HEADS.has(tokens[h].lower)));
    if (tailOk && h + 2 < tokens.length) {
      let k = h + 2;
      while (k < tokens.length && (isNameWord(tokens[k]) || (isConnector(tokens[k]) && ["of", "and", "&", "the", "for"].includes(tokens[k].lower)))) k++;
      while (k - 1 > h + 1 && isConnector(tokens[k - 1])) k--;
      if (k - 1 > h + 1) end = k - 1;
    }
    const named = tokens.slice(0, end + 1);
    const others = named.filter((t) => !isConnector(t) && !isHead(t));
    if (others.length > 0) return { tokens: named, kind: "name" };
  }
  // Leading head with no head at the end: "Institute of Arctic Studies", "College of Engineering".
  // The name stops at "at", "in", "on" ("School of Engineering at Example University").
  if (tokens.length >= 3 && LEADING_HEADS.has(tokens[0].lower) && !tokens[1].cap && (tokens[1].lower === "of" || tokens[1].lower === "for")) {
    let k = 2;
    while (k < tokens.length && (isNameWord(tokens[k]) || (isConnector(tokens[k]) && ["of", "and", "&", "the", "for"].includes(tokens[k].lower)))) k++;
    while (k - 1 > 1 && isConnector(tokens[k - 1])) k--;
    if (k > 2) return { tokens: tokens.slice(0, k), kind: "name" };
  }
  const content = tokens.filter((t) => !isConnector(t));
  if (content.length >= 2) {
    const last = content[content.length - 1];
    if (PLACE_NOUNS.has(last.lower) || PLACE_PREFIXES.has(content[0].lower)) return { tokens, kind: "place" };
  }
  return null;
}

const MAJOR_WORDS = new Set(["major", "majors", "minor", "minors", "concentration", "concentrations", "track", "certificate"]);
const MAJOR_IN_RE =
  /\b(?:major(?:ing|s)?|minor(?:ing|s)?|concentrat(?:e|ing|ion)|double[- ]major(?:ing)?|degree|bachelor['’]?s?(?: of (?:arts|science))?|B\.?[AS]\.?)\s+in\s+(?:the\s+)?$/i;

function names(text: string, s: Sentence, tokens: Token[]): Claim[] {
  const out: Claim[] = [];
  for (const run of capitalizedRuns(text, tokens)) {
    const runTokens = run.tokens;
    if (titleKind(runTokens[0])) continue; // people are extracted separately
    const possessor = possessorBefore(text, tokens, run.at);
    const after = tokens[run.at + runTokens.length];
    const majorIn = MAJOR_IN_RE.test(text.slice(s.start, runTokens[0].start));
    const majorAfter = Boolean(after && !after.cap && MAJOR_WORDS.has(after.lower) && joinable(text, runTokens[runTokens.length - 1], after));
    if (majorIn || majorAfter) {
      const trimmed = runTokens.slice(Math.max(0, runTokens.findIndex((t) => !/^(?:the|a|an)$/i.test(t.text))));
      const content = trimmed.filter((t) => !isConnector(t));
      if (content.length >= 2) {
        const span = spanOf(text, trimmed);
        out.push({ kind: "major", ...span, query: span.text, sentence: s.index, origin: "pattern", ...(possessor ? { possessor } : {}) });
        continue;
      }
    }
    const entity = entityFromRun(runTokens);
    if (!entity) continue;
    const span = spanOf(text, entity.tokens);
    out.push({ kind: entity.kind, ...span, query: span.text, sentence: s.index, origin: "pattern", ...(possessor ? { possessor } : {}) });
  }
  return out;
}

/** Standalone acronyms ("DALI", "URAD", "SIPs"): reported only when they match a known detail. */
function acronyms(text: string, s: Sentence, tokens: Token[]): Claim[] {
  const out: Claim[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const plain = t.text.replace(/['’]s$/i, "");
    if (!/^[A-Z]{3,8}s?$/.test(plain)) continue;
    const letters = /[A-Z]s$/.test(plain) ? plain.slice(0, -1) : plain;
    if (letters.length < 3 || COMMON_ACRONYMS.has(letters.toLowerCase())) continue;
    const prev = tokens[i - 1];
    const next = tokens[i + 1];
    if ((prev && isNameWord(prev) && joinable(text, prev, t)) || (next && isNameWord(next) && joinable(text, t, next))) continue;
    if (next && /^\d/.test(next.text)) continue; // a course code
    out.push({ kind: "acronym", start: t.start, end: t.start + plain.length, text: plain, query: letters, sentence: s.index, origin: "pattern" });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Quoted names                                                         */
/* ------------------------------------------------------------------ */

const QUOTE_RE = /“([^”\n]{2,90})”|"([^"\n]{2,90})"/g;

function quotedNames(text: string, sentences: Sentence[]): Claim[] {
  const out: Claim[] = [];
  QUOTE_RE.lastIndex = 0;
  for (let m = QUOTE_RE.exec(text); m; m = QUOTE_RE.exec(text)) {
    const inner = m[1] ?? m[2] ?? "";
    // Speech and quoted sentences end in punctuation; names do not.
    if (/[.!?]\s*$/.test(inner)) continue;
    const lead = inner.length - inner.trimStart().length;
    const content = inner.trim().replace(/[,;:]+$/, "");
    if (/\b(?:I|I['’]m|my|me|we|you)\b/.test(content)) continue;
    const words = content.split(/\s+/).filter(Boolean);
    if (words.length === 0 || words.length > 10) continue;
    const significant = words.filter((w) => !CONNECTORS.has(w.toLowerCase()));
    if (significant.length === 0 || !/^[\p{Lu}\p{N}]/u.test(words[0])) continue;
    const capped = significant.filter((w) => /^[\p{Lu}\p{N}]/u.test(w)).length;
    if (capped / significant.length < 0.6) continue;
    if (words.length === 1 && !/\p{Lu}.*\p{Lu}/u.test(words[0])) continue;
    const start = m.index + 1 + lead;
    const end = start + content.length;
    const sentence = sentences.find((x) => start >= x.start && end <= x.end);
    if (!sentence) continue;
    out.push({ kind: "quoted", start, end, text: content, query: content, sentence: sentence.index, origin: "pattern" });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* All claims                                                           */
/* ------------------------------------------------------------------ */

const KIND_PRIORITY: Record<ClaimKind, number> = { course: 6, person: 5, quoted: 4, major: 3, name: 2, place: 1, acronym: 0 };

/**
 * Remove overlapping claims: the higher-priority kind wins, then the longer span.
 * Returns claims sorted by position.
 */
export function resolveOverlaps(claims: Claim[]): Claim[] {
  const sorted = [...claims].sort(
    (a, b) => KIND_PRIORITY[b.kind] - KIND_PRIORITY[a.kind] || b.end - b.start - (a.end - a.start) || a.start - b.start,
  );
  const kept: Claim[] = [];
  for (const c of sorted) {
    if (kept.some((k) => c.start < k.end && k.start < c.end)) continue;
    kept.push(c);
  }
  return kept.sort((a, b) => a.start - b.start);
}

/** Every claim pattern over the draft's sentences, overlaps resolved. */
export function extractClaims(text: string, sentences: Sentence[], opts: ExtractOptions): Claim[] {
  const found: Claim[] = [...courseCodes(text, sentences, opts), ...quotedNames(text, sentences)];
  for (const s of sentences) {
    const tokens = tokenize(text, s.start, s.end);
    found.push(...people(text, s, tokens), ...names(text, s, tokens), ...acronyms(text, s, tokens));
  }
  return resolveOverlaps(found);
}
