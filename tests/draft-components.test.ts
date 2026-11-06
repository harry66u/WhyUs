/**
 * Static render of the draft checker UI: the editor's initial state and the
 * annotated draft with its margin notes. Fictional school and text only.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AnnotatedDraft } from "@/components/draft/annotated-draft";
import { DraftChecker, resultAnnouncement } from "@/components/draft/draft-checker";
import { DraftSummary } from "@/components/draft/draft-summary";
import { markClasses } from "@/components/draft/styles";
import { NEVER_REWRITES, UNVERIFIED_MESSAGE } from "@/lib/draft/messages";
import type { CheckedDraft, CheckedIssue } from "@/lib/draft/present";
import { WORD_COUNT_RULE } from "@/lib/draft/text";

const TEXT = "At Example, I want to take ENGR 41 and join the Heron Robotics Lab. Example offers many opportunities.\n\nI also love Lakeport.";
const at = (s: string) => ({ start: TEXT.indexOf(s), end: TEXT.indexOf(s) + s.length });

const ISSUES: CheckedIssue[] = [
  {
    type: "verified_claim",
    severity: "info",
    message: "Matches “ENGR 41: Watershed Systems” on an official Example page.",
    range: at("ENGR 41"),
    excerpt: "ENGR 41",
    sourceUrl: "https://catalog.example.edu/courses/engr-41",
    verifiedAt: "2026-11-05",
    matchedTitle: "ENGR 41: Watershed Systems",
  },
  { type: "unverified_claim", severity: "warning", message: UNVERIFIED_MESSAGE, range: at("Heron Robotics Lab"), excerpt: "Heron Robotics Lab" },
  {
    type: "generic",
    severity: "warning",
    message: "Nothing here is specific to Example; any school on your list could say the same.",
    range: at("Example offers many opportunities."),
    excerpt: "Example offers many opportunities.",
  },
  {
    type: "wrong_school",
    severity: "warning",
    message: "Lakeport is home to Second, another school on your list.",
    range: at("Lakeport"),
    excerpt: "Lakeport",
    otherSchools: [{ schoolId: "second", schoolName: "Second" }],
  },
];

const RESULT: CheckedDraft = {
  wordCount: 21,
  wordLimit: 20,
  withinLimit: false,
  issues: [{ type: "word_count", severity: "problem", message: "This draft has 21 words, 1 over the 20-word limit." }, ...ISSUES],
  summary: { verifiedClaims: 1, unverifiedClaims: 1, genericSentences: 1, swappableSentences: 0, sentences: 3 },
  checkedAt: "2026-11-06T12:00:00.000Z",
};

function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

describe("draft checker components", () => {
  it("renders the editor with a labeled draft field, the live count, and the rules", () => {
    const html = renderToStaticMarkup(createElement(DraftChecker, { applicationId: "app-1", schoolName: "Example", wordLimit: 150, hasResearch: true }));
    expect(html).toMatch(/<label[^>]*for="([^"]+)"[^>]*>Your draft<\/label>/);
    const id = /<label[^>]*for="([^"]+)"/.exec(html)![1];
    expect(html).toContain(`id="${id}"`);
    expect(html).toMatch(/<textarea[^>]*aria-describedby="[^"]+"/);
    expect(text(html)).toContain("0 / 150 words");
    expect(text(html)).toContain("150 left before the limit");
    expect(html).toContain(WORD_COUNT_RULE);
    expect(html).toContain(NEVER_REWRITES);
    expect(html).toContain('aria-live="polite"');
    // Nothing to check yet.
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
    expect(html).not.toContain("has no verified research");
    const noBase = renderToStaticMarkup(createElement(DraftChecker, { applicationId: "app-1", schoolName: "Example", wordLimit: null, hasResearch: false }));
    expect(noBase).toContain("WhyUs has no verified research on Example yet");
    expect(text(noBase)).toContain("No word limit for this prompt");
  });

  it("renders highlights in place and a margin note for each flag, with no suggested wording", () => {
    const html = renderToStaticMarkup(createElement(AnnotatedDraft, { text: TEXT, issues: RESULT.issues, filter: "all" }));
    // The draft text survives intact around the highlights.
    expect(html.replace(/<[^>]+>/g, "")).toContain("At Example, I want to take ENGR 41 and join the Heron Robotics Lab. Example offers many opportunities.");
    expect(html).toMatch(/<mark[^>]*data-issue-ids="n2"[^>]*>ENGR 41<\/mark>/);
    expect(html).toMatch(/<mark[^>]*data-issue-ids="n3"[^>]*>Heron Robotics Lab<\/mark>/);
    expect(html).toContain("Confirmed on an official page");
    expect(html).toContain('href="https://catalog.example.edu/courses/engr-41"');
    expect(html).toContain("ENGR 41: Watershed Systems");
    expect(html).toContain("Nov 5, 2026");
    expect(html).toContain("Could not confirm");
    expect(html).toContain(UNVERIFIED_MESSAGE);
    expect(html).toContain("Lakeport is home to Second, another school on your list.");
    expect(html).toContain('aria-label="Notes on paragraph 2"');
    // The word count is summarized elsewhere, not pinned to the text.
    expect(html).not.toContain("over the 20-word limit");

    const attention = renderToStaticMarkup(createElement(AnnotatedDraft, { text: TEXT, issues: RESULT.issues, filter: "attention" }));
    expect(attention).not.toContain("Confirmed on an official page");
    expect(attention).toMatch(/<mark[^>]*>ENGR 41<\/mark>/);
  });

  it("summarizes the check and announces it in one sentence", () => {
    const html = renderToStaticMarkup(createElement(DraftSummary, { result: RESULT }));
    expect(text(html)).toContain("21 / 20");
    expect(text(html)).toContain("1 over the limit");
    expect(text(html)).toContain("Could not confirm");
    expect(resultAnnouncement(RESULT)).toBe(
      "Check complete. 21 of 20 words. 1 fact confirmed, 1 could not be confirmed, 1 mention of another school, 1 generic sentence.",
    );
  });

  it("gives each highlight a distinct shape, not only a color", () => {
    expect(markClasses(new Set(["verified"]), false)).toMatch(/underline/);
    expect(markClasses(new Set(["problem"]), false)).toMatch(/decoration-wavy/);
    expect(markClasses(new Set(["generic"]), false)).toMatch(/decoration-dotted/);
    expect(markClasses(new Set(["swap"]), false)).toMatch(/bg-accent-wash/);
    expect(markClasses(new Set(["swap"]), false)).not.toMatch(/bg-transparent/);
    expect(markClasses(new Set(["verified"]), false)).toMatch(/bg-transparent/);
    expect(markClasses(new Set(["verified"]), true)).toMatch(/accent-line/);
  });
});
