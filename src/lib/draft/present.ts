/**
 * Presentation model for draft-check results: issue labels, highlight
 * styles, summary counts, and the segments that render highlights in place.
 * Pure functions only (used by the browser).
 */
import type { DraftCheckResult, DraftIssue, DraftIssueType } from "@/lib/types";
import { sentenceAt, type Paragraph, type Sentence, type TextRange } from "./text";

export type HighlightStyle = "verified" | "problem" | "swap" | "generic";

/**
 * A draft issue as checkDraft returns it. Confirmed claims also carry the
 * official name of the detail they matched and the source page's title, so a
 * note can show what was confirmed without repeating the whole message.
 */
export interface CheckedIssue extends DraftIssue {
  matchedTitle?: string;
  sourceTitle?: string;
}

export interface CheckedDraft extends DraftCheckResult {
  issues: CheckedIssue[];
}

export interface NumberedIssue extends CheckedIssue {
  /** Stable within one result: "n3". */
  id: string;
}

export function numberIssues(issues: CheckedIssue[]): NumberedIssue[] {
  return issues.map((issue, i) => ({ ...issue, id: `n${i + 1}` }));
}

export type NoteItem =
  | { kind: "single"; id: string; issue: NumberedIssue }
  /** Every confirmed claim in one sentence, in one compact note (id = the first claim's). */
  | { kind: "confirmed"; id: string; issues: NumberedIssue[] };

/** Notes in reading order, with each sentence's confirmed claims gathered into one note. */
export function groupNotes(notes: NumberedIssue[], sentences: Sentence[]): NoteItem[] {
  const items: NoteItem[] = [];
  const bySentence = new Map<number, Extract<NoteItem, { kind: "confirmed" }>>();
  for (const issue of notes) {
    if (issue.type === "verified_claim" && issue.range) {
      const sentence = sentenceAt(sentences, issue.range.start)?.index ?? -1 - items.length;
      const group = bySentence.get(sentence);
      if (group) {
        group.issues.push(issue);
        continue;
      }
      const created = { kind: "confirmed" as const, id: issue.id, issues: [issue] };
      bySentence.set(sentence, created);
      items.push(created);
      continue;
    }
    items.push({ kind: "single", id: issue.id, issue });
  }
  return items;
}

export function highlightOf(issue: Pick<DraftIssue, "type">): HighlightStyle | null {
  switch (issue.type) {
    case "verified_claim":
      return "verified";
    case "unverified_claim":
    case "wrong_school":
      return "problem";
    case "swappable":
      return "swap";
    case "generic":
      return "generic";
    default:
      return null;
  }
}

/** A generic flag on a single stock phrase inside an otherwise specific sentence. */
export function isPhraseFlag(issue: Pick<DraftIssue, "type" | "severity">): boolean {
  return issue.type === "generic" && issue.severity === "info";
}

export function issueLabel(issue: Pick<DraftIssue, "type" | "severity">): string {
  switch (issue.type) {
    case "verified_claim":
      return "Confirmed";
    case "unverified_claim":
      return "Could not confirm";
    case "wrong_school":
      return "Another school";
    case "swappable":
      return "Swap test";
    case "generic":
      return isPhraseFlag(issue) ? "Stock phrase" : "Generic sentence";
    case "word_count":
      return "Word count";
  }
}

/** Problems first when a note list is filtered to what needs attention. */
export function needsAttention(issue: Pick<DraftIssue, "type">): boolean {
  return issue.type !== "verified_claim";
}

export interface SummaryItem {
  key: "verified" | "unverified" | "wrong_school" | "swappable" | "generic" | "phrases";
  label: string;
  count: number;
  style: HighlightStyle;
  /** The note types this item counts, for jumping to the first one. */
  types: DraftIssueType[];
}

export function summaryItems(result: Pick<DraftCheckResult, "issues" | "summary">): SummaryItem[] {
  const count = (pred: (i: DraftIssue) => boolean) => result.issues.filter(pred).length;
  return [
    { key: "verified", label: "Confirmed on official pages", count: result.summary.verifiedClaims, style: "verified", types: ["verified_claim"] },
    { key: "unverified", label: "Could not confirm", count: result.summary.unverifiedClaims, style: "problem", types: ["unverified_claim"] },
    { key: "wrong_school", label: "Another school named", count: count((i) => i.type === "wrong_school"), style: "problem", types: ["wrong_school"] },
    { key: "swappable", label: "Swappable sentences", count: result.summary.swappableSentences, style: "swap", types: ["swappable"] },
    { key: "generic", label: "Generic sentences", count: result.summary.genericSentences, style: "generic", types: ["generic"] },
    { key: "phrases", label: "Stock phrases", count: count((i) => isPhraseFlag(i)), style: "generic", types: ["generic"] },
  ];
}

export interface Segment extends TextRange {
  text: string;
  /** Issues whose range covers this segment, outermost (sentence-level) first. */
  issueIds: string[];
}

export interface ParagraphView {
  paragraph: Paragraph;
  segments: Segment[];
  /** Notes that begin in this paragraph, in reading order. */
  notes: NumberedIssue[];
}

/**
 * Split each paragraph at every highlight boundary so overlapping highlights
 * (a claim inside a swappable sentence) nest cleanly.
 */
export function layoutParagraphs(text: string, paragraphs: Paragraph[], issues: NumberedIssue[]): ParagraphView[] {
  const ranged = issues.filter((i) => i.range && i.range.end > i.range.start);
  return paragraphs.map((p) => {
    const inside = ranged
      .filter((i) => i.range!.start < p.end && i.range!.end > p.start)
      .map((i) => ({ issue: i, start: Math.max(p.start, i.range!.start), end: Math.min(p.end, i.range!.end) }));
    const cuts = new Set<number>([p.start, p.end]);
    for (const r of inside) {
      cuts.add(r.start);
      cuts.add(r.end);
    }
    const points = [...cuts].sort((a, b) => a - b);
    const segments: Segment[] = [];
    for (let k = 0; k + 1 < points.length; k++) {
      const start = points[k];
      const end = points[k + 1];
      if (end <= start) continue;
      const covering = inside
        .filter((r) => r.start <= start && r.end >= end)
        .sort((a, b) => b.end - b.start - (a.end - a.start))
        .map((r) => r.issue.id);
      segments.push({ start, end, text: text.slice(start, end), issueIds: covering });
    }
    const notes = ranged
      .filter((i) => i.range!.start >= p.start && i.range!.start < p.end)
      .sort((a, b) => a.range!.start - b.range!.start || b.range!.end - a.range!.end);
    return { paragraph: p, segments, notes };
  });
}
