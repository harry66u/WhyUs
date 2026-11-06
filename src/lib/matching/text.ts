/**
 * Small, dependency-free text helpers for the matching engine: tokenizing,
 * light stemming, stopwords, phrase boundaries, and English list/article
 * helpers used when composing plain sentences.
 */

export interface Word {
  text: string; // as written (possessive stripped)
  lower: string;
  start: number;
  end: number;
}

const WORD_RE = /[A-Za-z0-9][A-Za-z0-9'’]*(?:[-/][A-Za-z0-9][A-Za-z0-9'’]*)*/g;

/** Words with their positions. Hyphenated compounds stay one word ("solar-powered"). */
export function wordsOf(text: string): Word[] {
  const out: Word[] = [];
  if (!text) return out;
  for (const m of text.matchAll(WORD_RE)) {
    const raw = m[0].replace(/['’]s$/i, "");
    const start = m.index ?? 0;
    out.push({ text: raw, lower: raw.toLowerCase(), start, end: start + m[0].length });
  }
  return out;
}

/** Plain English function words. */
const FUNCTION_WORDS = `a about above across after again against all also am among an and any are around as at be been before
being below between both but by can could did do does doing down during each either else even ever every few for from further
had has have having he her here hers him his how however i if in into is it its itself just less like made make makes many may
me might more most much must my near neither no nor not now of off often on once one only onto or other others our ours out over
own per rather same she should since so some such than that the their theirs them then there these they this those through thus
to too toward towards under until up upon us very via was we well were what when where whether which while who whom whose why
will with within without would yet you your yours etc`;

/**
 * Words that carry little matching signal in admissions and catalog text.
 * Domain words that do carry signal (engineering, water, policy...) are left
 * to the IDF weighting computed over each school's facts.
 */
const GENERIC_WORDS = `student students undergraduate undergraduates course courses class classes program programs programme school
schools college colleges university universities campus faculty department departments center centre centers lab labs laboratory
laboratories research project projects work works working study studies studying learn learning learns include includes including
provide provides providing offer offers offering opportunity opportunities experience experiences skill skills year years first
second third new based help helps helped use uses used using team teams member members group groups part real world way ways area
areas topic topics focus focused focuses introduce introduces introduction introductory explore explores exploring develop develops
developing development approach approaches key major minor various variety range wide broad annual week weeks hour hours grade
grades related relevant specific special general current future level levels upper lower student-run hands-on through across
build built builds building deploy deployed deploys measure measured measuring publish published publishes write wrote writes
written coach coached coaches teach taught teaches present presented presents give gives gave given get gets got take takes took
taking run runs ran running lead leads led serve serves served join joins joined make making makes create creates created
design designs designed designing designer apply applies applied applying support supports supported allow allows allowed enable
enables enabled engage engages engaged engaging bring brings brought well-known known people person individual individuals
participant participants participate participates case cases file files high state states open application applications
cover powered examination family families fair meeting meetings alternate local area based term terms semester semesters
quarter quarters day days time times number numbers member's student's school's team's`;

const FUNCTION_WORD_SET = new Set(FUNCTION_WORDS.split(/\s+/).filter(Boolean));

export const STOPWORDS: Set<string> = new Set(`${FUNCTION_WORDS} ${GENERIC_WORDS}`.split(/\s+/).filter(Boolean));

/** Light, predictable stemmer: plural and possessive endings only. */
export function stem(word: string): string {
  const w = word.toLowerCase().replace(/['’]/g, "");
  if (w.length <= 3) return w;
  if (w.endsWith("ies") && w.length > 4) return `${w.slice(0, -3)}y`;
  if (/(?:ss|us|is|ics|ous)$/.test(w)) return w;
  if (/(?:ches|shes|xes|zes|sses)$/.test(w)) return w.slice(0, -2);
  if (w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

function isContent(lower: string): boolean {
  if (lower.length < 3) return false;
  if (/^\d+$/.test(lower)) return false;
  return !STOPWORDS.has(lower) && !STOPWORDS.has(stem(lower));
}

/** Content stems of a text, in order (hyphenated compounds yield their parts and the joined form). */
export function contentStems(text: string): string[] {
  const out: string[] = [];
  for (const w of wordsOf(text)) {
    const parts = w.lower.split(/[-/]/).filter(Boolean);
    if (parts.length > 1) {
      for (const p of parts) if (isContent(p)) out.push(stem(p));
      const joined = parts.join("");
      if (isContent(joined) && joined.length >= 4) out.push(stem(joined));
    } else if (isContent(w.lower)) {
      out.push(stem(w.lower));
    }
  }
  return out;
}

/** Stems of every word of three or more letters except function words (for comparing short phrases). */
export function phraseStems(text: string): string[] {
  const out: string[] = [];
  for (const w of wordsOf(text)) {
    for (const p of w.lower.split(/[-/]/)) if (p.length >= 3 && !FUNCTION_WORD_SET.has(p)) out.push(stem(p));
  }
  return out;
}

/** Adjacent content-word pairs ("dissolved oxygen", "big band"), as "stem stem". */
export function contentBigrams(text: string): string[] {
  const ws = wordsOf(text);
  const out: string[] = [];
  for (let i = 0; i + 1 < ws.length; i++) {
    const a = ws[i];
    const b = ws[i + 1];
    if (!/^\s+$/.test(text.slice(a.end, b.start))) continue;
    if (a.lower.includes("-") || b.lower.includes("-")) continue;
    if (!isContent(a.lower) || !isContent(b.lower)) continue;
    out.push(`${stem(a.lower)} ${stem(b.lower)}`);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Phrase boundaries (used to quote a short phrase from a student's     */
/* own activity description)                                           */
/* ------------------------------------------------------------------ */

/** Verbs that commonly open clauses in activity descriptions. */
const CLAUSE_VERBS = new Set(
  `build built builds deploy deployed deploys measure measured measures publish published publishes write wrote writes written
coach coached coaches teach taught teaches repair repaired repairs interpret interpreted interprets present presented presents
mapped sampled helped help helps give gave gives organize organized organizes manage managed manages create created creates
develop developed develops designed run ran runs found founded start started starts launch launched launches raise raised raises
tutor tutored tutors volunteered researched studied analyze analyzed analyzes analyse analysed trained compete competed competes
perform performed performs played serve served serves worked plan planned host hosted hosts collect collected collects programmed
coded tested install installed installs maintain maintained maintains mentored use used uses make made makes arrange arranged
arranges recorded edited compose composed composes directed won earned recruited translate translated translates partnered
proposed spoke argued draft drafted drafts led lead leads assist assisted assists coordinate coordinated coordinates
fundraise fundraised raise share shared shares invent invented train trains`.split(/\s+/),
);

/** -ing words that are usually nouns in activity descriptions. */
const ING_NOUNS = new Set(
  `engineering building programming planning housing mapping modeling modelling computing learning training teaching writing marketing
accounting banking nursing sampling monitoring sensing processing manufacturing recycling composting farming cycling biking hiking
camping climbing skiing running swimming rowing sailing fencing wrestling boxing dancing singing acting painting drawing printing
recording mixing editing publishing broadcasting coding tutoring mentoring interpreting translating debating reporting organizing
fundraising gardening landscaping lighting plumbing welding woodworking tinkering surveying sketching filmmaking songwriting
storytelling volunteering`.split(/\s+/),
);

/** -ed words that are usually adjectives in activity descriptions. */
const ED_ADJECTIVES = new Set(
  `dissolved automated advanced applied embedded distributed integrated mixed shared related based red bed seed speed feed weed breed
need deed limited skilled varied detailed`.split(/\s+/),
);

/** True when a word should stop a noun phrase (function words, clause verbs, verb-like -ing/-ed forms). */
export function isPhraseBoundary(w: Word): boolean {
  const l = w.lower;
  if (FUNCTION_WORD_SET.has(l)) return true;
  if (/^\d/.test(l)) return true;
  if (CLAUSE_VERBS.has(l)) return true;
  if (l.includes("-")) return false;
  if (l.endsWith("ing") && l.length > 5 && !ING_NOUNS.has(l)) return true;
  if (l.endsWith("ed") && l.length > 4 && !ED_ADJECTIVES.has(l)) return true;
  return false;
}

/**
 * Expand a character span of `text` to the surrounding noun phrase: up to two
 * modifier words to the left and two words to the right, never crossing
 * punctuation or a phrase boundary, at most `maxWords` words.
 */
export function nounPhraseAround(text: string, start: number, end: number, maxWords = 4): string | null {
  const ws = wordsOf(text);
  if (ws.length === 0) return null;
  let first = ws.findIndex((w) => w.end > start);
  let last = -1;
  for (let i = ws.length - 1; i >= 0; i--) {
    if (ws[i].start < end) {
      last = i;
      break;
    }
  }
  if (first < 0 || last < first) return null;
  const gapOk = (a: Word, b: Word) => /^\s+$/.test(text.slice(a.end, b.start));
  // Trim boundary words that the match itself may have included at its edges
  // ("Interpret for" -> nothing left; then look at the words that follow).
  while (first <= last && isPhraseBoundary(ws[first])) first++;
  while (last >= first && isPhraseBoundary(ws[last])) last--;
  if (first > last) {
    let next = first;
    while (next < ws.length && isPhraseBoundary(ws[next])) next++;
    if (next >= ws.length) return null;
    first = next;
    last = next;
  }
  let added = 0;
  while (first > 0 && added < 2 && last - first + 1 < maxWords) {
    const prev = ws[first - 1];
    if (!gapOk(prev, ws[first]) || isPhraseBoundary(prev)) break;
    first--;
    added++;
  }
  added = 0;
  while (last + 1 < ws.length && added < 2 && last - first + 1 < maxWords) {
    const next = ws[last + 1];
    if (!gapOk(ws[last], next) || isPhraseBoundary(next)) break;
    last++;
    added++;
  }
  const phrase = text.slice(ws[first].start, ws[last].end).trim();
  if (!phrase || ws.slice(first, last + 1).every((w) => !isContent(w.lower))) return null;
  return phrase;
}

/* ------------------------------------------------------------------ */
/* Sentence helpers                                                     */
/* ------------------------------------------------------------------ */

/** "A", "A and B", "A, B, and C". */
export function joinList(items: string[], conj = "and"): string {
  const xs = items.filter(Boolean);
  if (xs.length <= 1) return xs[0] ?? "";
  if (xs.length === 2) return `${xs[0]} ${conj} ${xs[1]}`;
  return `${xs.slice(0, -1).join(", ")}, ${conj} ${xs[xs.length - 1]}`;
}

export function articleFor(phrase: string): "a" | "an" {
  const w = phrase.trim().toLowerCase();
  if (/^(?:hour|honor|honour|heir)/.test(w)) return "an";
  if (/^(?:uni|use|usu|ure|eu|one|once)/.test(w)) return "a";
  if (/^[aeiou]/.test(w)) return "an";
  // Acronyms read letter by letter: "an FRC team", "an MIT program".
  if (/^[fhlmnrsx][A-Z0-9]/.test(phrase.trim()) && /^[A-Z]{2,}/.test(phrase.trim())) return "an";
  return "a";
}

export function capitalizeFirst(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export function lowerFirst(s: string): string {
  if (!s) return s;
  // Keep acronyms and proper nouns ("GIS", "ENGS 28", "Dartmouth").
  const first = s.split(/\s+/)[0];
  if (/^[A-Z][a-z]+$/.test(first) && /^(?:A|An|The|This|These|Its|Their)$/.test(first)) return s.charAt(0).toLowerCase() + s.slice(1);
  return s;
}

/** Remove one trailing period (keeps "?" and "!"), collapse whitespace. */
export function tidy(s: string): string {
  return s.replace(/\s+/g, " ").trim().replace(/\.+$/, "");
}

/** First sentence of a text (summaries are one sentence, but be safe). */
export function firstSentence(s: string): string {
  const t = s.replace(/\s+/g, " ").trim();
  const m = t.match(/^(.+?[.!?])(?:\s+[A-Z]|$)/);
  return tidy(m ? m[1] : t);
}

/* ------------------------------------------------------------------ */
/* Course codes                                                         */
/* ------------------------------------------------------------------ */

const CODE_RE = /^([A-Z]{2,6}(?:&[A-Z]{1,3})?\s?-?\d{1,4}[A-Z]?(?:\.\d{1,3})?)\b/;

/** Course code from a title like "ENGS 28: Embedded Systems" or a code-only name. */
export function courseCodeOf(title: string, nameOnPage?: string): string | null {
  const m = title.trim().match(CODE_RE);
  if (m) return m[1];
  const n = (nameOnPage ?? "").trim();
  const m2 = n.match(CODE_RE);
  if (m2 && m2[1].length === n.length) return m2[1];
  return null;
}

/** Title without a leading course code ("Embedded Systems"). */
export function titleWithoutCode(title: string): string {
  return title.replace(CODE_RE, "").replace(/^\s*[:\-–—]\s*/, "").trim() || title;
}

/** Stable string hash for deterministic tie-breaking. */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function clamp(n: number, lo = 0, hi = 1): number {
  return Math.min(hi, Math.max(lo, n));
}

export function round(n: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
