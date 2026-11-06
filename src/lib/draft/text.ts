/**
 * Text primitives for the draft checker.
 *
 * - The word-count rule (stated in the UI): groups of characters separated by
 *   spaces or line breaks, i.e. /\S+/ tokens.
 * - Paragraph and sentence segmentation with character ranges into the draft
 *   exactly as the student pasted it, so every flag can be highlighted in place.
 * - A normalizer that folds case, accents, quotes, and punctuation while keeping
 *   a map back to original offsets, for tolerant phrase search.
 * - A word tokenizer with offsets, used by claim extraction.
 *
 * Pure and dependency-free: the server check and the browser (live word count,
 * highlight rendering) share this file.
 */

export const WORD_COUNT_RULE = "Words are counted as groups of characters separated by spaces or line breaks.";

/** Longest draft accepted for one check (far above any supplemental essay). */
export const MAX_DRAFT_CHARS = 20_000;

/** Number of /\S+/ tokens: the rule stated in the UI. */
export function countWords(text: string): number {
  const m = (text ?? "").match(/\S+/g);
  return m ? m.length : 0;
}

export interface TextRange {
  start: number;
  /** Exclusive. */
  end: number;
}

export interface Paragraph extends TextRange {
  index: number;
}

export interface Sentence extends TextRange {
  index: number;
  paragraph: number;
}

export interface Segmentation {
  paragraphs: Paragraph[];
  sentences: Sentence[];
}

/* ------------------------------------------------------------------ */
/* Segmentation                                                        */
/* ------------------------------------------------------------------ */

/** Words that end in a period without ending the sentence ("Dr. Keller", "St. Louis"). */
const ABBREVIATIONS = new Set(
  `dr mr mrs ms mx prof profs sr jr st mt ft vs approx dept depts univ inc ltd corp ave rd blvd jan feb mar apr jun jul aug sep sept
oct nov dec u.s u.k a.m p.m ph.d gov sen rep gen col capt lt sgt rev hon pres fig vol cf al e.g i.e`.split(/\s+/),
);

/** Abbreviations that take a number after them ("No. 5", "pp. 12"). */
const NUMBER_ABBREVIATIONS = new Set(["no", "nos", "pp", "p", "ch", "sec"]);

/** A single line break that only wraps a sentence onto the next line (hard-wrapped text). */
function isSoftWrap(previousLine: string, nextLine: string): boolean {
  if (/[.!?:;…"”’')\]]$/.test(previousLine)) return false;
  return /^[\p{Ll}(]/u.test(nextLine);
}

function splitParagraphs(text: string): TextRange[] {
  const out: TextRange[] = [];
  let current: TextRange | null = null;
  let previous: string | null = null;
  let lineStart = 0;
  while (lineStart <= text.length) {
    const nl = text.indexOf("\n", lineStart);
    const lineEnd = nl === -1 ? text.length : nl;
    const raw = text.slice(lineStart, lineEnd);
    const trimmed = raw.trim();
    if (!trimmed) {
      if (current) out.push(current);
      current = null;
      previous = null;
    } else {
      const start = lineStart + (raw.length - raw.trimStart().length);
      const end = lineStart + raw.trimEnd().length;
      if (current && previous !== null && isSoftWrap(previous, trimmed)) {
        current.end = end;
      } else {
        if (current) out.push(current);
        current = { start, end };
      }
      previous = trimmed;
    }
    if (nl === -1) break;
    lineStart = nl + 1;
  }
  if (current) out.push(current);
  return out;
}

const BOUNDARY_RE = /([.!?…]+)(["”’')\]]*)(\s+)/g;

function splitSentences(text: string, para: TextRange): TextRange[] {
  const s = text.slice(para.start, para.end);
  const out: TextRange[] = [];
  let start = 0;
  BOUNDARY_RE.lastIndex = 0;
  for (let m = BOUNDARY_RE.exec(s); m; m = BOUNDARY_RE.exec(s)) {
    const punct = m[1];
    const closeEnd = m.index + punct.length + m[2].length;
    const next = s.slice(m.index + m[0].length, m.index + m[0].length + 1);
    if (!next || !/[\p{Lu}\p{N}"“‘'(\[]/u.test(next)) continue;
    if (punct === ".") {
      const before = /([\p{L}][\p{L}.]*)$/u.exec(s.slice(start, m.index));
      const word = before ? before[1].toLowerCase().replace(/\.+$/, "") : "";
      if (ABBREVIATIONS.has(word)) continue;
      if (NUMBER_ABBREVIATIONS.has(word) && /\p{N}/u.test(next)) continue;
      // An initial inside a name: "Carl E. Renshaw".
      if (before && /^\p{Lu}$/u.test(before[1])) continue;
    }
    if (closeEnd > start) out.push({ start: para.start + start, end: para.start + closeEnd });
    start = m.index + m[0].length;
  }
  if (start < s.length) {
    const rest = s.slice(start);
    const end = start + rest.trimEnd().length;
    if (end > start) out.push({ start: para.start + start, end: para.start + end });
  }
  return out;
}

/**
 * Paragraphs (blank lines, or single line breaks that start a new line of
 * thought) and sentences, as ranges into `text`. Ranges never include
 * surrounding whitespace.
 */
export function segmentDraft(text: string): Segmentation {
  const paragraphs: Paragraph[] = [];
  const sentences: Sentence[] = [];
  for (const range of splitParagraphs(text ?? "")) {
    const p: Paragraph = { ...range, index: paragraphs.length };
    paragraphs.push(p);
    for (const r of splitSentences(text, range)) sentences.push({ ...r, index: sentences.length, paragraph: p.index });
  }
  return { paragraphs, sentences };
}

/** The sentence that contains `offset`, if any. */
export function sentenceAt(sentences: Sentence[], offset: number): Sentence | undefined {
  let lo = 0;
  let hi = sentences.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const s = sentences[mid];
    if (offset < s.start) hi = mid - 1;
    else if (offset >= s.end) lo = mid + 1;
    else return s;
  }
  return undefined;
}

/* ------------------------------------------------------------------ */
/* Normalization with an offset map                                     */
/* ------------------------------------------------------------------ */

export interface NormalizedText {
  /** Lowercase letters and digits separated by single spaces ("&" becomes "and"). */
  text: string;
  /** map[i] = index in the original text of normalized character i. */
  map: number[];
}

const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;
const DIGIT = /\p{N}/u;

/**
 * Fold text for tolerant matching: case, accents, ligatures, curly quotes,
 * hyphens and other punctuation all collapse to single spaces; "&" reads as
 * "and"; a period between digits is kept so "ENGS 85.16" stays one number.
 */
export function normalizeWithMap(input: string): NormalizedText {
  const out: string[] = [];
  const map: number[] = [];
  let space = true;
  const push = (c: string, i: number) => {
    if (c === " ") {
      if (!space) {
        out.push(" ");
        map.push(i);
        space = true;
      }
      return;
    }
    out.push(c);
    map.push(i);
    space = false;
  };
  const src = input ?? "";
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === "&") {
      push(" ", i);
      for (const c of "and") push(c, i);
      push(" ", i);
      continue;
    }
    if (ch === "." && i > 0 && DIGIT.test(src[i - 1]) && DIGIT.test(src[i + 1] ?? "")) {
      push(".", i);
      continue;
    }
    const folded = ch.normalize("NFKD").replace(/\p{M}/gu, "");
    if (!folded) continue;
    for (const c of folded) push(LETTER_OR_DIGIT.test(c) ? c.toLowerCase() : " ", i);
  }
  if (out.length > 0 && out[out.length - 1] === " ") {
    out.pop();
    map.pop();
  }
  return { text: out.join(""), map };
}

/** Normalized form of a name or phrase (no offset map). */
export function norm(input: string): string {
  return normalizeWithMap(input).text;
}

/** Normalized name without a leading article and without a trailing possessive "s". */
export function normName(input: string): string {
  return norm(input)
    .replace(/^(?:the|a|an) /, "")
    .replace(/ s$/, "");
}

/** Whole-word occurrences of an already normalized needle, as ranges into the original text. */
export function findNormalized(hay: NormalizedText, needle: string, limit = 50): TextRange[] {
  const out: TextRange[] = [];
  if (!needle) return out;
  let from = 0;
  while (out.length < limit) {
    const i = hay.text.indexOf(needle, from);
    if (i < 0) break;
    const j = i + needle.length;
    if ((i === 0 || hay.text[i - 1] === " ") && (j === hay.text.length || hay.text[j] === " ")) {
      out.push({ start: hay.map[i], end: hay.map[j - 1] + 1 });
    }
    from = i + 1;
  }
  return out;
}

/** True when a normalized needle occurs as whole words in a normalized haystack. */
export function containsWords(hay: string, needle: string): boolean {
  if (!needle || !hay) return false;
  let from = 0;
  for (;;) {
    const i = hay.indexOf(needle, from);
    if (i < 0) return false;
    const j = i + needle.length;
    if ((i === 0 || hay[i - 1] === " ") && (j === hay.length || hay[j] === " ")) return true;
    from = i + 1;
  }
}

/* ------------------------------------------------------------------ */
/* Tokens                                                               */
/* ------------------------------------------------------------------ */

export interface Token {
  text: string;
  /** Lowercase, with a trailing possessive removed ("dartmouth's" -> "dartmouth"). */
  lower: string;
  start: number;
  end: number;
  /** Starts with an uppercase letter. */
  cap: boolean;
  /** Two or more letters, all uppercase ("DALI", "SIPs" counts via `cap`). */
  acronym: boolean;
  possessive: boolean;
}

const TOKEN_RE = /[\p{L}\p{N}](?:[\p{L}\p{N}'’.\-]*[\p{L}\p{N}])?|&/gu;

/** Word tokens with offsets. Apostrophes, hyphens, and inner periods stay inside a token. */
export function tokenize(text: string, from = 0, to = text.length): Token[] {
  const out: Token[] = [];
  const slice = text.slice(from, to);
  for (const m of slice.matchAll(TOKEN_RE)) {
    const raw = m[0];
    const start = from + (m.index ?? 0);
    const possessive = /['’]s$/i.test(raw) && raw.length > 2;
    const base = possessive ? raw.slice(0, -2) : raw.replace(/['’]$/, "");
    const letters = base.replace(/[^\p{L}]/gu, "");
    out.push({
      text: raw,
      lower: base.toLowerCase(),
      start,
      end: start + raw.length,
      cap: /^\p{Lu}/u.test(raw),
      acronym: letters.length >= 2 && letters === letters.toUpperCase() && /\p{Lu}/u.test(letters),
      possessive,
    });
  }
  return out;
}

/** Damerau-Levenshtein distance, capped (returns cap + 1 when exceeded). */
export function editDistance(a: string, b: string, cap = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const n = a.length;
  const m = b.length;
  let prev2 = new Array<number>(m + 1).fill(0);
  let prev = Array.from({ length: m + 1 }, (_, j) => j);
  for (let i = 1; i <= n; i++) {
    const cur = new Array<number>(m + 1).fill(0);
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], prev2[j - 2] + 1);
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > cap) return cap + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[m];
}
