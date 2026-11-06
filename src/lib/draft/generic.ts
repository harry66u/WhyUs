/**
 * Generic sentences: stock phrases admissions readers see in many essays, and
 * sentences that praise the school or talk about "opportunities" and
 * "community" without naming anything that only this school has.
 *
 * A sentence with no specific reference (no named course, person, program,
 * place, number, or other proper noun) is flagged as a whole when it uses a
 * stock phrase, praises the school, or is built from words any school could
 * claim. In a sentence that does name something specific, only the stock
 * phrase itself is flagged.
 */
import {
  CLICHES,
  FUNCTION_WORDS,
  GENERIC_FILLER,
  GENERIC_NOUNS,
  GENERIC_STRUCTURES,
  PRAISE_WORDS,
  type ClicheCategory,
} from "./lexicon";
import { containsWords, normName, tokenize, type Sentence, type TextRange } from "./text";

export interface ClicheHit extends TextRange {
  /** As written in the draft. */
  text: string;
  category: ClicheCategory;
}

export type GenericReason = "cliche" | "praise" | "vague";

export interface GenericFlag {
  sentence: number;
  level: "sentence" | "phrase";
  range: TextRange;
  reason: GenericReason;
  /** Stock phrases found (reason "cliche"). */
  phrases: ClicheHit[];
  /** The sentence is about the school (names it, or says "the university", "your campus"). */
  aboutSchool: boolean;
}

export interface GenericContext {
  /** Indices of sentences that name something specific (claims, other schools). */
  specific: Set<number>;
  /** Normalized names of the current school: name, short name, units, aliases. */
  schoolNames: string[];
}

const CLICHE_RES = CLICHES.map((c) => ({
  re: new RegExp(`(?<![\\p{L}\\p{N}])(?:${c.pattern})(?![\\p{L}\\p{N}])`, "giu"),
  category: c.category,
}));

/** Stock phrases in a span of the draft, longest first where they overlap. */
export function findCliches(text: string, range: TextRange): ClicheHit[] {
  const slice = text.slice(range.start, range.end);
  const hits: ClicheHit[] = [];
  for (const { re, category } of CLICHE_RES) {
    re.lastIndex = 0;
    for (let m = re.exec(slice); m; m = re.exec(slice)) {
      const start = range.start + m.index;
      hits.push({ start, end: start + m[0].length, text: m[0], category });
      if (m[0].length === 0) re.lastIndex++;
    }
  }
  hits.sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start);
  const kept: ClicheHit[] = [];
  for (const h of hits) if (!kept.some((k) => h.start < k.end && k.start < h.end)) kept.push(h);
  return kept.sort((a, b) => a.start - b.start);
}

const SCHOOL_PHRASE = /\b(?:the|this|your|its|their) (?:university|college|school|campus|institution)\b|\bcampus\b/i;

function aboutSchool(sentenceText: string, schoolNames: string[]): boolean {
  if (SCHOOL_PHRASE.test(sentenceText)) return true;
  const n = normName(sentenceText);
  return schoolNames.some((name) => name && containsWords(n, name));
}

/** A digit or a capitalized word that is not the first word, "I", or the school's own name. */
function hasOwnSpecifics(text: string, s: Sentence, schoolTokens: Set<string>): boolean {
  const slice = text.slice(s.start, s.end);
  if (/\d/.test(slice)) return true;
  const tokens = tokenize(text, s.start, s.end);
  return tokens.some((t, i) => {
    if (i === 0 || !t.cap) return false;
    if (/^I(?:['’](?:m|ve|d|ll))?$/.test(t.text)) return false;
    return !schoolTokens.has(t.lower);
  });
}

function contentWords(text: string, s: Sentence, schoolTokens: Set<string>): string[] {
  return tokenize(text, s.start, s.end)
    .map((t) => t.lower)
    .filter((w) => w.length >= 3 && !FUNCTION_WORDS.has(w) && !schoolTokens.has(w) && !/^\d/.test(w));
}

function isGenericWord(w: string): boolean {
  return GENERIC_NOUNS.has(w) || GENERIC_FILLER.has(w) || PRAISE_WORDS.has(w);
}

export function detectGeneric(text: string, sentences: Sentence[], ctx: GenericContext): GenericFlag[] {
  const schoolTokens = new Set(ctx.schoolNames.flatMap((n) => n.split(" ")).filter((t) => t.length >= 3));
  const flags: GenericFlag[] = [];
  for (const s of sentences) {
    const sentenceText = text.slice(s.start, s.end);
    const phrases = findCliches(text, s);
    const school = aboutSchool(sentenceText, ctx.schoolNames);
    const specific = ctx.specific.has(s.index) || hasOwnSpecifics(text, s, schoolTokens);
    if (specific) {
      for (const p of phrases) {
        flags.push({ sentence: s.index, level: "phrase", range: { start: p.start, end: p.end }, reason: "cliche", phrases: [p], aboutSchool: school });
      }
      continue;
    }
    const range = { start: s.start, end: s.end };
    if (phrases.length > 0) {
      flags.push({ sentence: s.index, level: "sentence", range, reason: "cliche", phrases, aboutSchool: school });
      continue;
    }
    const words = contentWords(text, s, schoolTokens);
    const praise = words.some((w) => PRAISE_WORDS.has(w));
    if (school && praise) {
      flags.push({ sentence: s.index, level: "sentence", range, reason: "praise", phrases: [], aboutSchool: true });
      continue;
    }
    const generic = words.filter(isGenericWord).length;
    const ratio = words.length > 0 ? generic / words.length : 0;
    const structure = GENERIC_STRUCTURES.some((re) => re.test(sentenceText));
    if ((school && (structure || (words.length >= 3 && ratio >= 0.7))) || (words.length >= 3 && ratio >= 0.85)) {
      flags.push({ sentence: s.index, level: "sentence", range, reason: "vague", phrases: [], aboutSchool: school });
    }
  }
  return flags;
}
