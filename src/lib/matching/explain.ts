/**
 * One plain sentence per detail explaining how it connects to the student.
 *
 * Grounding rules (deterministic path):
 * - the student side names a real activity (or a stated interest or intended
 *   major) and may quote a short phrase from that activity's own description;
 * - the school side is the fact's hook (a verb phrase supported by the quote),
 *   or its summary when the hook is not usable;
 * - nothing else is added: no praise, no predictions, no claims about the school.
 */
import type { Fact } from "@/lib/types";
import type { ActivityProfile } from "./profile";
import type { ActivityLink, Basis, InterestLink, ScoredFact } from "./rank";
import { getTheme } from "./themes";
import { contentStems, firstSentence, lowerFirst, nounPhraseAround, phraseStems, stem, tidy, wordsOf } from "./text";

const MAX_SENTENCE = 250;

/** Third-person present verb phrase, lowercase start ("has students design ..."). */
export function usableHook(hook: string | undefined): string | null {
  const h = tidy(hook ?? "");
  if (h.length < 8 || h.length > 200) return null;
  if (!/^[a-z][a-z-]*s\b/.test(h) && !/^(?:has|is|does)\b/.test(h)) return null;
  if (/\b(?:you|your|I|my|we|our)\b/.test(h)) return null;
  if (/[.!?]\s+[A-Z]/.test(h)) return null;
  return h;
}

/** What the school offers, as a clause: "ENGS 28 takes students from ...". */
export function offerClause(s: ScoredFact): string {
  const hook = usableHook(s.fact.hook);
  if (hook) return `${s.features.subject} ${hook}`;
  return lowerFirst(firstSentence(s.fact.summary || s.fact.title));
}

/**
 * A short phrase from the activity's own description that carries the
 * connection: the cited theme first, then a rare word the fact shares.
 * `themes` (optional): the themes the sentence cites, strongest first.
 */
export function evidencePhrase(a: ActivityProfile, link: ActivityLink, themes?: string[]): string | null {
  const text = a.evidenceText;
  if (!text || text === a.title) return null;
  // Each candidate phrase is credited for what produced it: the connection's
  // main theme counts most; a shared rare word counts fully only when it is
  // the phrase's head noun ("basic maintenance"), not a modifier ("city council").
  const candidates = new Map<string, { credit: number; at: number }>();
  const consider = (start: number, end: number, credit: (phrase: string) => number) => {
    const p = nounPhraseAround(text, start, end);
    if (!p || p.length > 42 || p.split(/\s+/).length > 4) return;
    const c = credit(p);
    const prev = candidates.get(p);
    if (!prev || prev.credit < c) candidates.set(p, { credit: c, at: start });
  };
  const themeCredit = [1.2, 0.8, 0.5];
  const keys = themes && themes.length > 0 ? themes : (link.specific.length > 0 ? link.specific : link.themes).map((t) => t.key);
  keys.slice(0, 3).forEach((key, i) => {
    const m = getTheme(key)?.pattern.exec(text);
    if (m) consider(m.index, m.index + m[0].length, () => themeCredit[i]);
  });
  for (const stemmed of link.tokens.slice(0, 3)) {
    const w = wordsOf(text).find((x) => x.lower.split(/[-/]/).some((part) => stem(part) === stemmed));
    if (!w) continue;
    consider(w.start, w.end, (p) => (phraseStems(p).pop() === stemmed ? 1.2 : 0.5));
  }

  const titleStems = new Set(phraseStems(a.title));
  let best: { phrase: string; score: number; at: number } | null = null;
  for (const [phrase, { credit, at }] of candidates) {
    const stems = phraseStems(phrase);
    if (stems.length === 0 || contentStems(phrase).length === 0) continue;
    const inTitle = stems.filter((x) => titleStems.has(x)).length;
    // Fully redundant with the activity's own name: adds nothing.
    if (inTitle === stems.length) continue;
    let score = credit;
    if (stems.length >= 2) score += 0.6;
    if (inTitle * 2 >= stems.length) score -= 0.6;
    // A proper name on its own ("Mill Creek") explains less than a description.
    if (wordsOf(phrase).every((w) => /^[A-Z0-9]/.test(w.text))) score -= 1;
    if (score >= 1.75 && (!best || score > best.score + 1e-9 || (Math.abs(score - best.score) < 1e-9 && at < best.at))) {
      best = { phrase, score, at };
    }
  }
  return best?.phrase ?? null;
}

function leadFor(link: ActivityLink): string {
  const fit = link.specific.length > 0 ? link.citedFit : link.fit;
  if (fit >= 0.68 || (fit >= 0.45 && link.tokens.length > 0 && link.raw > 0)) return "Builds directly on";
  if (fit >= 0.3) return "Connects to";
  return "Relates to";
}

function fitWithActivity(s: ScoredFact, link: ActivityLink, themes: string[], short = false): string {
  const a = link.source;
  const offer = offerClause(s);
  const phrase = short ? null : evidencePhrase(a, link, themes);
  const ref = short ? a.shortRef : a.ref;
  const lead = leadFor(link);
  const full = `${lead} ${ref}${phrase ? ` (${phrase})` : ""}: ${offer}.`;
  if (full.length <= MAX_SENTENCE || short) return full;
  const noPhrase = `${lead} ${ref}: ${offer}.`;
  if (noPhrase.length <= MAX_SENTENCE) return noPhrase;
  return fitWithActivity(s, link, themes, true);
}

function fitWithInterest(s: ScoredFact, link: InterestLink): string {
  const offer = offerClause(s);
  if (link.source.kind === "major") return `Fits your plan to study ${link.source.text}: ${offer}.`;
  return `Matches your interest in ${link.source.text}: ${offer}.`;
}

export interface FitExplanation {
  sentence: string;
  /** Activity the sentence names, if any. */
  activityId: string | null;
  basis: "activity" | "interest" | "major" | "none";
}

/**
 * The plain fit sentence for a scored fact, grounded in `cite`: the basis
 * selection assigned (an activity, interest, or intended major that shares a
 * specific theme with the fact). Without `cite`, the selected basis on the
 * fact (`s.cite`) or its best basis is used. A fact with no basis is never
 * presented as a match.
 */
export function explainFit(s: ScoredFact, cite?: Basis | null): FitExplanation {
  const chosen = cite !== undefined ? cite : "cite" in s ? ((s as ScoredFact & { cite: Basis | null }).cite ?? null) : (s.bases?.[0] ?? null);
  if (chosen?.kind === "activity") {
    const link = chosen.link as ActivityLink;
    return { sentence: fitWithActivity(s, link, chosen.themes), activityId: link.source.id, basis: "activity" };
  }
  if (chosen?.kind === "interest" || chosen?.kind === "major") {
    return { sentence: fitWithInterest(s, chosen.link as InterestLink), activityId: null, basis: chosen.kind };
  }
  return { sentence: `Not tied to a specific activity on your list: ${offerClause(s)}.`, activityId: null, basis: "none" };
}

/** A fact's title for the live log and validation (kept as written). */
export function factLabel(f: Fact): string {
  return f.title;
}
