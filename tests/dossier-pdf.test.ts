import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { EXAMPLE_DOSSIER } from "@/lib/fixtures/example-dossier";
import { renderDossierPdf } from "@/lib/pdf/dossier-pdf";
import type { Dossier } from "@/lib/types";

function latin1(bytes: Uint8Array): string {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("latin1");
}

/** A longer fictional dossier: 8 details, four other schools, every swap status, no word limit. */
function longDossier(): Dossier {
  const base = EXAMPLE_DOSSIER.details;
  const statuses = ["equivalent", "similar", "none", "unknown"] as const;
  const details = Array.from({ length: 8 }, (_, i) => {
    const d = base[i % base.length];
    return {
      ...d,
      factId: `example:detail-${i + 1}:00000${i}`,
      rank: i + 1,
      title: `${d.title} (${i + 1})`,
      unitIds: i % 2 === 0 ? ["engineering"] : [],
      swap: ["Other College A", "Other University B", "Other College C", "Other University D"].map((schoolName, j) => ({
        schoolId: `other-${j}`,
        schoolName,
        status: statuses[(i + j) % statuses.length],
        equivalentTitle: (i + j) % 4 < 2 ? `Comparable program ${j + 1}` : undefined,
        equivalentUrl: (i + j) % 4 === 0 ? `https://www.example.org/programs/${j + 1}` : undefined,
      })),
    };
  });
  return {
    ...EXAMPLE_DOSSIER,
    id: "fixture-dossier-long",
    prompt: { ...EXAMPLE_DOSSIER.prompt, wordLimit: null },
    details,
    angles: [...EXAMPLE_DOSSIER.angles, { ...EXAMPLE_DOSSIER.angles[1], key: "third", line: "A third idea in one line.", isLead: false }],
  };
}

describe("renderDossierPdf", () => {
  it("renders the example dossier to a PDF with embedded fonts and live citations", async () => {
    const bytes = await renderDossierPdf(EXAMPLE_DOSSIER, { preparedFor: "Sam" });
    expect(bytes).toBeInstanceOf(Uint8Array);
    const raw = latin1(bytes);
    expect(raw.startsWith("%PDF-")).toBe(true);
    expect(raw.trimEnd().endsWith("%%EOF")).toBe(true);
    // A sensible size: real content with subset fonts, not an empty page and not whole font files.
    expect(bytes.byteLength).toBeGreaterThan(20_000);
    expect(bytes.byteLength).toBeLessThan(600_000);
    // Citations are live links.
    for (const d of EXAMPLE_DOSSIER.details) expect(raw).toContain(d.sourceUrl);
    // The briefing typefaces are embedded (subset), not the standard-font fallback.
    expect(raw).toMatch(/\/BaseFont \/[A-Z]{6}\+InstrumentSans-/);
    expect(raw).toMatch(/\/BaseFont \/[A-Z]{6}\+Newsreader16pt-/);
    expect(raw).toMatch(/\/BaseFont \/[A-Z]{6}\+Newsreader72pt-/);
    // Letter size.
    expect(raw).toContain("/MediaBox [0 0 612 792]");

    const preview = process.env.WHYUS_PDF_PREVIEW;
    if (preview) fs.writeFileSync(preview, bytes);
  });

  it("paginates a long dossier and keeps every citation", async () => {
    const dossier = longDossier();
    const bytes = await renderDossierPdf(dossier);
    const raw = latin1(bytes);
    expect(raw.startsWith("%PDF-")).toBe(true);
    const pages = raw.match(/\/Type \/Page\b/g)?.length ?? 0;
    expect(pages).toBeGreaterThanOrEqual(2);
    expect(pages).toBeLessThanOrEqual(6);
    expect(raw).toContain("https://www.example.org/programs/1");

    const preview = process.env.WHYUS_PDF_PREVIEW;
    if (preview) fs.writeFileSync(preview.replace(/\.pdf$/, "-long.pdf"), bytes);
  });
});
