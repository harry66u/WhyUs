/**
 * Optional Claude pass over the deterministic dossier text: fit sentences,
 * angle lines, and questions. One structured call; every returned item is
 * validated and anything that fails keeps its deterministic version:
 *
 * - only the fact ids and angle keys we sent (no new details, no new angles);
 * - no names or numbers that are not in the facts, the student's profile, or
 *   the school's registry entry (the model may not introduce facts);
 * - length limits; one sentence per fit explanation; angles are one line;
 * - no first-person prose in sentences or angles (never essay text), no hype;
 * - each fit sentence still names the student's activity or interest.
 *
 * Without ANTHROPIC_API_KEY this module does nothing.
 */
import { z } from "zod";
import { generateStructured, llmAvailable } from "@/lib/llm/client";
import type { DossierQuestion, FactKind, School, StudentProfile } from "@/lib/types";
import { MAX_ANGLE_LENGTH } from "./angles";
import { THEMES } from "./themes";
import { stem, wordsOf } from "./text";

export const ImprovementSchema = z.object({
  details: z.array(z.object({ factId: z.string(), sentence: z.string() })),
  angles: z.array(z.object({ key: z.string(), line: z.string() })),
  questions: z.array(
    z.object({
      factId: z.string(),
      audience: z.enum(["info_session", "current_student"]),
      text: z.string(),
    }),
  ),
});

export type Improvements = z.infer<typeof ImprovementSchema>;

export interface DraftDetail {
  factId: string;
  kind: FactKind;
  title: string;
  nameOnPage: string;
  summary: string;
  hook: string;
  quote: string;
  /** Activity titles the sentence must name (one of them), strongest first. */
  activityTitles: string[];
  /** Interest or intended major the sentence names when no activity does. */
  interest: string | null;
  sentence: string;
}

export interface DraftAngle {
  key: string;
  activityTitle: string | null;
  theme: string;
  factIds: string[];
  line: string;
}

export interface DraftForClaude {
  school: string;
  unit: string | null;
  prompt: string;
  student: {
    activities: { id: string; title: string; role?: string; organization?: string; description: string }[];
    interests: string[];
    intendedMajors: string[];
  };
  details: DraftDetail[];
  angles: DraftAngle[];
  questions: DossierQuestion[];
}

export interface AppliedImprovements {
  sentences: Map<string, string>;
  lines: Map<string, string>;
  questions: DossierQuestion[] | null;
  /** Number of items taken from Claude. */
  used: number;
}

const SYSTEM = `You edit short text in a college research briefing for one high school student. The school facts were verified on official school pages. The student's activities come from their own profile.

Rewrite three kinds of text so they read plainly and specifically:
- details[].sentence: one sentence, at most 240 characters, saying how this detail connects to the student. Name the student's activity (or, when no activity is listed for the detail, the interest) from the input. Say what the detail offers using only its title, summary, hook, or quote.
- angles[].line: one line, at most 150 characters, stating an essay angle as an idea to explore. It is a direction for the student, not a sentence from an essay: no first person (I, me, my, we, our) and no narrative.
- questions: exactly 3, one for each factId listed in questions, keeping its audience. Ask about what the official page would not say: access for first-year students, timing, workload, how students get involved, what it is like in practice.

Use only names, numbers, and claims that appear in the input. Do not praise the school or the student, do not predict feelings, and do not add courses, people, labs, programs, or facts. Address the student as "you". Keep every factId and key exactly as given.`;

/* ------------------------------------------------------------------ */
/* Vocabulary: every word the output may use as a name or number        */
/* ------------------------------------------------------------------ */

export interface Vocabulary {
  words: Set<string>;
}

const ALWAYS_OK = new Set(
  `the this that these those a an your you it its both each how what when where which who why can could do does did is are was were
would will should if in on at for from with and or but as to of by into about after before during than then there here their they
first second third one two three ask also not no yes may might must some any every many most more less few new
monday tuesday wednesday thursday friday saturday sunday january february march april may june july august september october
november december`.split(/\s+/),
);

export function buildVocabulary(texts: string[]): Vocabulary {
  const words = new Set<string>();
  for (const t of texts) {
    for (const w of wordsOf(t ?? "")) {
      for (const part of [w.lower, ...w.lower.split(/[-/]/)]) {
        if (!part) continue;
        words.add(part);
        words.add(stem(part));
      }
    }
  }
  for (const th of THEMES) for (const w of wordsOf(th.label)) words.add(w.lower);
  return { words };
}

export function vocabularyFor(draft: DraftForClaude, school: School, student: StudentProfile): Vocabulary {
  const texts: string[] = [school.name, school.shortName, school.city, school.state, draft.prompt, draft.unit ?? ""];
  for (const u of school.units) texts.push(u.name, u.shortName ?? "", ...u.aliases);
  for (const d of draft.details) texts.push(d.title, d.nameOnPage, d.summary, d.hook, d.quote, d.sentence);
  for (const a of draft.angles) texts.push(a.line);
  for (const q of draft.questions) texts.push(q.text);
  for (const a of student.activities ?? []) texts.push(a.title, a.role ?? "", a.organization ?? "", a.category ?? "", a.description ?? "");
  texts.push(...(student.interests ?? []), ...(student.intendedMajors ?? []));
  return buildVocabulary(texts);
}

/** Words that commonly open a sentence, a line, or a question. */
const STARTERS = new Set(
  `builds build connects connect matches match fits fit relates relate ties tie links link use uses show shows explore explores trace
traces pair pairs take takes frame frames compare compares consider follow follows bring brings carry carries turn turns extend
extends ask through like unlike after before since because while although not tied`.split(/\s+/),
);

/**
 * Capitalized words and numbers must come from the input (facts, profile,
 * school registry). A capitalized word that opens a sentence passes only when
 * it is a common starter or verb-like; invented names never pass.
 */
export function unknownNames(text: string, vocab: Vocabulary): string[] {
  const out: string[] = [];
  const ws = wordsOf(text);
  ws.forEach((w, i) => {
    const prev = i > 0 ? text.slice(ws[i - 1].end, w.start) : "";
    const sentenceStart = i === 0 || /[.!?]\s*$/.test(prev);
    const hasDigit = /\d/.test(w.text);
    const capitalized = /^[A-Z]/.test(w.text);
    if (!hasDigit && !capitalized) return;
    if (!hasDigit && ALWAYS_OK.has(w.lower)) return;
    const parts = [w.lower, ...w.lower.split(/[-/]/)].filter(Boolean);
    if (parts.some((p) => vocab.words.has(p) || vocab.words.has(stem(p)))) return;
    if (sentenceStart && !hasDigit && (STARTERS.has(w.lower) || /^[A-Z][a-z]+(?:ing|ed|ly)$/.test(w.text))) return;
    out.push(w.text);
  });
  return out;
}

/* ------------------------------------------------------------------ */
/* Validation                                                           */
/* ------------------------------------------------------------------ */

const FIRST_PERSON = /\b(?:I|I'm|I've|I'd|I'll|I’m|I’ve|I’d|I’ll)\b|\b(?:me|my|mine|myself|we|we're|our|ours|ourselves)\b/;
const HYPE =
  /\b(?:love|loved|loves|perfect|perfectly|dream|amazing|incredible|incredibly|world-class|renowned|prestigious|cutting-edge|unparalleled|unrivaled|ideal|ideally|passion|passionate|thrilled|excited|exciting|unlock|supercharge|best|top-notch|truly|stunning|remarkable|extraordinary|outstanding|exceptional|you will|you'll|you’ll|can't wait)\b/i;

function oneLine(s: string): boolean {
  return !/[\r\n]/.test(s);
}

function sentenceCount(s: string): number {
  return (s.trim().match(/[.!?](?=\s+[A-Z(]|$)/g) ?? []).length;
}

/** True when `text` names one of `phrases` (any significant word, matched by its first five letters). */
export function mentionsAny(text: string, phrases: string[]): boolean {
  const have = wordsOf(text).map((w) => w.lower);
  for (const phrase of phrases) {
    const sig = wordsOf(phrase)
      .map((w) => w.lower)
      .filter((w) => w.length >= 4 && !ALWAYS_OK.has(w));
    for (const w of sig) {
      const head = w.slice(0, Math.min(5, w.length));
      if (have.some((h) => h.startsWith(head))) return true;
    }
  }
  return false;
}

export function validSentence(d: DraftDetail, sentence: string, vocab: Vocabulary): boolean {
  const s = sentence.replace(/\s+/g, " ").trim();
  if (s.length < 30 || s.length > 260 || !oneLine(sentence)) return false;
  if (sentenceCount(s) > 1) return false;
  if (FIRST_PERSON.test(s) || HYPE.test(s)) return false;
  if (unknownNames(s, vocab).length > 0) return false;
  if (d.activityTitles.length > 0) return mentionsAny(s, d.activityTitles);
  if (d.interest) return mentionsAny(s, [d.interest]);
  return true;
}

export function validLine(a: DraftAngle, line: string, details: DraftDetail[], vocab: Vocabulary): boolean {
  const s = line.trim();
  if (s.length < 20 || s.length > MAX_ANGLE_LENGTH || !oneLine(line)) return false;
  if (sentenceCount(s) > 1) return false;
  if (FIRST_PERSON.test(s) || HYPE.test(s)) return false;
  if (unknownNames(s, vocab).length > 0) return false;
  const facts = details.filter((d) => a.factIds.includes(d.factId));
  const anchors = [...(a.activityTitle ? [a.activityTitle] : []), ...facts.map((d) => d.nameOnPage), ...facts.map((d) => d.title)];
  return anchors.length === 0 || mentionsAny(s, anchors);
}

export function validQuestion(q: { factId: string; audience: string; text: string }, details: DraftDetail[], vocab: Vocabulary): boolean {
  const d = details.find((x) => x.factId === q.factId);
  if (!d) return false;
  if (q.audience !== "info_session" && q.audience !== "current_student") return false;
  const s = q.text.trim();
  if (s.length < 20 || s.length > 240 || !oneLine(q.text) || !s.endsWith("?")) return false;
  if (HYPE.test(s)) return false;
  if (unknownNames(s, vocab).length > 0) return false;
  return mentionsAny(s, [d.nameOnPage, d.title]);
}

export function validateImprovements(draft: DraftForClaude, out: Improvements, vocab: Vocabulary): AppliedImprovements {
  const sentences = new Map<string, string>();
  const lines = new Map<string, string>();
  const byId = new Map(draft.details.map((d) => [d.factId, d]));
  const angleByKey = new Map(draft.angles.map((a) => [a.key, a]));

  for (const item of out.details ?? []) {
    const d = byId.get(item.factId);
    if (!d || sentences.has(d.factId)) continue;
    const s = item.sentence.replace(/\s+/g, " ").trim();
    if (validSentence(d, s, vocab)) sentences.set(d.factId, /[.!?]$/.test(s) ? s : `${s}.`);
  }
  for (const item of out.angles ?? []) {
    const a = angleByKey.get(item.key);
    if (!a || lines.has(a.key)) continue;
    const s = item.line.replace(/\s+/g, " ").trim();
    if (validLine(a, s, draft.details, vocab)) lines.set(a.key, s);
  }

  let questions: DossierQuestion[] | null = null;
  const qs = (out.questions ?? []).map((q) => ({ ...q, text: q.text.replace(/\s+/g, " ").trim() }));
  if (qs.length === 3 && qs.every((q) => validQuestion(q, draft.details, vocab)) && new Set(qs.map((q) => q.text.toLowerCase())).size === 3) {
    const audiences = new Set(qs.map((q) => q.audience));
    if (audiences.size === 2 || draft.questions.every((q) => q.audience === qs[0].audience)) {
      questions = qs.map((q) => ({ text: q.text, factId: q.factId, audience: q.audience }));
    }
  }
  return { sentences, lines, questions, used: sentences.size + lines.size + (questions ? questions.length : 0) };
}

/**
 * Ask Claude to improve the draft text. Returns null when Claude is not
 * configured, the call fails or times out, or nothing passed validation.
 */
export async function improveWithClaude(
  draft: DraftForClaude,
  vocab: Vocabulary,
  opts: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<AppliedImprovements | null> {
  if (!llmAvailable()) return null;
  const timeout = AbortSignal.timeout(opts.timeoutMs ?? 45_000);
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
  try {
    const out = await generateStructured({
      schema: ImprovementSchema,
      system: SYSTEM,
      user: `Briefing draft (JSON):\n${JSON.stringify(draft)}`,
      effort: "low",
      maxTokens: 4000,
      signal,
    });
    const applied = validateImprovements(draft, out, vocab);
    return applied.used > 0 ? applied : null;
  } catch {
    return null;
  }
}
