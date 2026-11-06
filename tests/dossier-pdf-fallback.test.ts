import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

// Runs in its own file (fresh process) so the font registration starts from scratch.
describe("renderDossierPdf without the bundled font files", () => {
  it("falls back to the PDF standard fonts instead of failing", async () => {
    vi.stubEnv("WHYUS_PDF_FONT_DIR", "");
    const fontsDir = `${path.sep}pdf${path.sep}fonts${path.sep}`;
    const realStatSync = fs.statSync.bind(fs) as (p: fs.PathLike) => fs.Stats;
    const stat = vi.spyOn(fs, "statSync").mockImplementation(((p: fs.PathLike) => {
      if (String(p).includes(fontsDir)) throw Object.assign(new Error(`ENOENT: ${String(p)}`), { code: "ENOENT" });
      return realStatSync(p);
    }) as unknown as typeof fs.statSync);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const { renderDossierPdf } = await import("@/lib/pdf/dossier-pdf");
    const { EXAMPLE_DOSSIER } = await import("@/lib/fixtures/example-dossier");
    const bytes = await renderDossierPdf(EXAMPLE_DOSSIER, { preparedFor: "Sam" });
    const raw = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("latin1");

    expect(raw.startsWith("%PDF-")).toBe(true);
    expect(raw).toContain("/BaseFont /Helvetica");
    expect(raw).toContain("/BaseFont /Times-Roman");
    expect(raw).not.toContain("InstrumentSans");
    expect(raw).toContain(EXAMPLE_DOSSIER.details[0].sourceUrl);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("fonts not found"));

    stat.mockRestore();
    warn.mockRestore();
    vi.unstubAllEnvs();
  });
});
