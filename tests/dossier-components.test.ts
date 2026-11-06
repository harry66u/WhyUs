import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  DossierDocument,
  ScoreScale,
  SwapRow,
  clampScore,
  detailScope,
  dossierPdfFileName,
  firstName,
  labelCountsText,
  orderedAngles,
  rankedDetails,
  scoreBand,
  swapText,
  uniquenessLabel,
  wordLimitText,
} from "@/components/dossier";
import { EXAMPLE_DOSSIER } from "@/lib/fixtures/example-dossier";
import { listSchools } from "@/lib/schools/registry";
import type { Dossier, DossierDetail } from "@/lib/types";

function render(dossier: Dossier, props: { preparedFor?: string | null; idPrefix?: string } = {}): string {
  return renderToStaticMarkup(createElement(DossierDocument, { dossier, ...props }));
}

/** Text content without tags, with entities for quotes decoded. */
function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

describe("dossier model", () => {
  it("bands the dossier score and clamps bad input", () => {
    // Same thresholds as the matching engine's detail labels (35 / 55 / 75).
    expect(scoreBand(10).label).toBe("Common");
    expect(scoreBand(34).label).toBe("Common");
    expect(scoreBand(35).label).toBe("Typical");
    expect(scoreBand(55).label).toBe("Uncommon");
    expect(scoreBand(74).label).toBe("Uncommon");
    expect(scoreBand(75).label).toBe("Distinctive");
    expect(scoreBand(100).label).toBe("Distinctive");
    expect(clampScore(140)).toBe(100);
    expect(clampScore(-3)).toBe(0);
    expect(clampScore(Number.NaN)).toBe(0);
  });

  it("states commonly mentioned plainly whenever the flag is set", () => {
    const d = EXAMPLE_DOSSIER.details[0];
    expect(uniquenessLabel(d)).toBe("Distinctive");
    expect(uniquenessLabel({ ...d, uniqueness: { ...d.uniqueness, label: "Typical", commonlyMentioned: true } })).toBe("Commonly mentioned");
  });

  it("describes unit scope from the fact's units", () => {
    const ctx = { schoolId: "example", unitId: "engineering", unitName: "School of Engineering" };
    expect(detailScope({ unitIds: [] }, ctx)).toBe("Open to all undergraduates");
    expect(detailScope({ unitIds: ["engineering"] }, ctx)).toBe("School of Engineering");
    expect(detailScope({}, ctx)).toBeNull();
    // A unit other than the student's own is named from the school registry.
    const school = listSchools().find((s) => s.units.length >= 2);
    if (school) {
      const [own, other] = school.units;
      expect(detailScope({ unitIds: [other.id] }, { schoolId: school.id, unitId: own.id, unitName: own.name })).toBe(other.name);
    }
    expect(detailScope({ unitIds: ["no-such-unit"] }, ctx)).toBeNull();
  });

  it("words swap outcomes, word limits, names, and file names", () => {
    expect(swapText({ schoolId: "a", schoolName: "A", status: "equivalent", equivalentTitle: "Lab X" })).toBe("Equivalent: Lab X");
    expect(swapText({ schoolId: "a", schoolName: "A", status: "similar" })).toBe("Has something similar");
    expect(swapText({ schoolId: "a", schoolName: "A", status: "none" })).toBe("No equivalent found");
    expect(swapText({ schoolId: "a", schoolName: "A", status: "unknown", equivalentTitle: "ignored" })).toBe("Not researched yet");
    expect(wordLimitText(150)).toBe("150-word limit");
    expect(wordLimitText(null)).toBe("No word limit given");
    expect(firstName("  Jordan   Reyes ")).toBe("Jordan");
    expect(firstName("")).toBeNull();
    expect(dossierPdfFileName({ schoolId: "cornell", schoolName: "Cornell University" })).toBe("whyus-cornell-dossier.pdf");
    expect(dossierPdfFileName({ schoolId: "", schoolName: "Université d'Exemple" })).toBe("whyus-universite-d-exemple-dossier.pdf");
  });

  it("orders details by rank and angles lead first, and counts labels", () => {
    const shuffled = { ...EXAMPLE_DOSSIER, details: [...EXAMPLE_DOSSIER.details].reverse() };
    expect(rankedDetails(shuffled).map((d) => d.rank)).toEqual([1, 2, 3]);
    const angles = orderedAngles([...EXAMPLE_DOSSIER.angles].reverse());
    expect(angles[0].isLead).toBe(true);
    expect(labelCountsText(EXAMPLE_DOSSIER.details)).toBe("3 details: 1 distinctive, 1 uncommon, 1 commonly mentioned");
  });
});

describe("DossierDocument", () => {
  it("renders the full briefing from a dossier", () => {
    const html = render(EXAMPLE_DOSSIER, { preparedFor: "Sam" });
    const t = text(html);

    // Header: school, unit, prompt with limit, date, quiet stats.
    expect(t).toContain("Example University");
    expect(t).toContain("School of Engineering");
    expect(t).toContain(EXAMPLE_DOSSIER.prompt.text);
    expect(t).toContain("150-word limit");
    expect(t).toContain("Generated Nov 5, 2026");
    expect(t).toContain("14 official pages read");
    expect(t).toContain("12 facts verified");
    expect(t).toContain("Prepared for Sam");

    // Score shown visually and accessibly.
    expect(html).toMatch(/role="meter"[^>]*aria-valuenow="74"/);
    expect(html).toContain('aria-valuetext="74 out of 100, Uncommon"');

    // Every detail: title, fit sentence, verbatim quote, citation with verification date.
    for (const d of EXAMPLE_DOSSIER.details) {
      expect(t).toContain(d.title);
      expect(t).toContain(d.fit.sentence);
      expect(t).toContain(d.quote);
      expect(html).toContain(`href="${d.sourceUrl}"`);
    }
    expect(t.match(/Verified Nov 5, 2026/g)?.length).toBe(3);
    expect(t).toContain("Why it fits you");

    // Ranked in order, uniqueness labels, commonly mentioned stated plainly.
    const order = EXAMPLE_DOSSIER.details.map((d) => t.indexOf(d.title));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(t).toContain("Distinctive");
    expect(t).toContain("Commonly mentioned");

    // Swap test rows.
    expect(t).toContain("Other College A No equivalent found");
    expect(t).toContain("Similar: Environmental Monitoring Group");
    expect(t).toContain("Equivalent: First-Year Research Program");

    // Angles (lead marked once, first), questions with audience, research note.
    expect(t.match(/Lead angle/g)?.length).toBe(1);
    expect(t.indexOf(EXAMPLE_DOSSIER.angles[0].line)).toBeLessThan(t.indexOf(EXAMPLE_DOSSIER.angles[1].line));
    expect(t).toContain("Ask at an info session");
    expect(t).toContain("Ask a current student");
    for (const q of EXAMPLE_DOSSIER.questions) expect(t).toContain(q.text);
    expect(t).toContain("Research note");
    expect(t).toContain(EXAMPLE_DOSSIER.policyNote);
  });

  it("shows unit scope, unknown swap results, and in-page anchors", () => {
    const details: DossierDetail[] = EXAMPLE_DOSSIER.details.map((d, i) => ({
      ...d,
      unitIds: i === 0 ? ["engineering"] : [],
      swap: i === 0 ? [...d.swap, { schoolId: "other-c", schoolName: "Other College C", status: "unknown" }] : d.swap,
    }));
    const html = render({ ...EXAMPLE_DOSSIER, details }, { idPrefix: "shared" });
    const t = text(html);
    expect(t).toContain("Open to all undergraduates");
    expect(t).toContain("Other College C Not researched yet");
    expect(html).toContain('id="shared-detail-1"');
    expect(html).toContain('href="#shared-detail-1"');
    expect(html).toContain('data-swap-glyph="unknown"');
  });

  it("leaves out account data and internal ids", () => {
    const html = render(EXAMPLE_DOSSIER);
    expect(html).not.toContain("Prepared for");
    expect(html).not.toContain(EXAMPLE_DOSSIER.studentId);
    expect(html).not.toContain(EXAMPLE_DOSSIER.applicationId);
    expect(html).not.toContain(EXAMPLE_DOSSIER.id);
  });

  it("explains the swap test once when the list has no other school", () => {
    const details = EXAMPLE_DOSSIER.details.map((d) => ({ ...d, swap: [] }));
    const t = text(render({ ...EXAMPLE_DOSSIER, details }));
    expect(t).toContain("The swap test runs once the list has another school to compare.");
    expect(t).not.toContain("Swap test");
  });

  it("handles a dossier with nothing to show without crashing", () => {
    const t = text(render({ ...EXAMPLE_DOSSIER, details: [], angles: [], questions: [], prompt: { text: "Why us?", wordLimit: null } }));
    expect(t).toContain("No details passed verification for this school.");
    expect(t).toContain("No angles were proposed for this school.");
    expect(t).toContain("No questions were proposed for this school.");
    expect(t).toContain("No word limit given");
  });
});

describe("pieces", () => {
  it("ScoreScale labels the band and highlights it", () => {
    const html = renderToStaticMarkup(createElement(ScoreScale, { score: 40 }));
    expect(html).toContain('aria-valuetext="40 out of 100, Typical"');
    expect(text(html)).toContain("Uniqueness score");
  });

  it("SwapRow links equivalents to their official page", () => {
    const html = renderToStaticMarkup(
      createElement(SwapRow, {
        results: [{ schoolId: "b", schoolName: "Other University B", status: "equivalent", equivalentTitle: "Group", equivalentUrl: "https://www.example.org/group" }],
      }),
    );
    expect(html).toContain('href="https://www.example.org/group"');
    expect(html).toContain('rel="noopener noreferrer"');
  });
});
