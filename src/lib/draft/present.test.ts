import { describe, expect, it } from "vitest";
import type { DraftCheckResult } from "@/lib/types";
import { groupNotes, highlightOf, issueLabel, layoutParagraphs, numberIssues, summaryItems, type CheckedIssue } from "./present";
import { segmentDraft } from "./text";

const TEXT = "I want ENGR 41 and the River Sensing Lab. It is great.\n\nSecond paragraph names Lakeport.";
const at = (s: string) => ({ start: TEXT.indexOf(s), end: TEXT.indexOf(s) + s.length });

const ISSUES: CheckedIssue[] = [
  { type: "word_count", severity: "problem", message: "This draft has 9 words, 1 over the 8-word limit." },
  { type: "swappable", severity: "warning", message: "m", range: at("I want ENGR 41 and the River Sensing Lab."), excerpt: "I want ENGR 41 and the River Sensing Lab." },
  { type: "verified_claim", severity: "info", message: "m", range: at("ENGR 41"), excerpt: "ENGR 41", matchedTitle: "ENGR 41: Watershed Systems" },
  { type: "verified_claim", severity: "info", message: "m", range: at("River Sensing Lab"), excerpt: "River Sensing Lab" },
  { type: "generic", severity: "warning", message: "m", range: at("It is great."), excerpt: "It is great." },
  { type: "wrong_school", severity: "warning", message: "m", range: at("Lakeport"), excerpt: "Lakeport" },
];

describe("draft presentation", () => {
  it("labels issues and maps them to highlight styles", () => {
    expect(ISSUES.map((i) => highlightOf(i))).toEqual([null, "swap", "verified", "verified", "generic", "problem"]);
    expect(issueLabel({ type: "generic", severity: "info" })).toBe("Stock phrase");
    expect(issueLabel({ type: "generic", severity: "warning" })).toBe("Generic sentence");
    expect(issueLabel({ type: "unverified_claim", severity: "warning" })).toBe("Could not confirm");
  });

  it("splits paragraphs at highlight boundaries so nested highlights render in place", () => {
    const numbered = numberIssues(ISSUES);
    const views = layoutParagraphs(TEXT, segmentDraft(TEXT).paragraphs, numbered);
    expect(views).toHaveLength(2);
    const first = views[0];
    expect(first.segments.map((s) => s.text).join("")).toBe(TEXT.slice(first.paragraph.start, first.paragraph.end));
    const engr = first.segments.find((s) => s.text === "ENGR 41");
    // The sentence-level highlight comes first, the claim inside it last.
    expect(engr?.issueIds).toEqual(["n2", "n3"]);
    expect(first.segments.find((s) => s.text === " and the ")?.issueIds).toEqual(["n2"]);
    expect(first.notes.map((n) => n.id)).toEqual(["n2", "n3", "n4", "n5"]);
    expect(views[1].notes.map((n) => n.id)).toEqual(["n6"]);
    // The word count has no place in the text.
    expect(views.flatMap((v) => v.notes).some((n) => n.type === "word_count")).toBe(false);
  });

  it("gathers a sentence's confirmed claims into one note", () => {
    const numbered = numberIssues(ISSUES);
    const views = layoutParagraphs(TEXT, segmentDraft(TEXT).paragraphs, numbered);
    const items = groupNotes(views[0].notes, segmentDraft(TEXT).sentences);
    expect(items.map((i) => (i.kind === "single" ? i.issue.type : `confirmed:${i.issues.map((x) => x.excerpt).join("+")}`))).toEqual([
      "swappable",
      "confirmed:ENGR 41+River Sensing Lab",
      "generic",
    ]);
  });

  it("summarizes counts with their highlight styles", () => {
    const result: Pick<DraftCheckResult, "issues" | "summary"> = {
      issues: ISSUES,
      summary: { verifiedClaims: 2, unverifiedClaims: 0, genericSentences: 1, swappableSentences: 1, sentences: 3 },
    };
    expect(summaryItems(result).map((i) => [i.key, i.count, i.style])).toEqual([
      ["verified", 2, "verified"],
      ["unverified", 0, "problem"],
      ["wrong_school", 1, "problem"],
      ["swappable", 1, "swap"],
      ["generic", 1, "generic"],
      ["phrases", 0, "generic"],
    ]);
  });
});
