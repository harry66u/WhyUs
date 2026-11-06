/**
 * Fonts for the PDF export.
 *
 * The briefing uses the same two families as the screen: Instrument Sans for
 * the instrument layer (labels, scores, citations) and Newsreader for the
 * document layer (titles, summaries, quotes), with Newsreader's 72pt optical
 * size for the school name.
 *
 * Files in ./fonts are the official static instances, unmodified, under the SIL
 * Open Font License (each family's OFL.txt sits next to its files):
 * - instrumentsans/: github.com/Instrument/instrument-sans @ 7fa22308 (fonts/ttf),
 *   the commit google/fonts ofl/instrumentsans was built from.
 * - newsreader/: github.com/productiontype/NewsReader @ 1ece6a8b (fonts/static/ttf),
 *   the commit google/fonts ofl/newsreader was built from.
 * google/fonts itself ships only the variable files, and the bundled fontkit
 * (2.0.4) cannot subset a variable font at a named weight, so static instances
 * are used.
 *
 * When the files are missing (for example a deployment that does not copy
 * src/), the export falls back to the PDF standard fonts Helvetica and
 * Times-Roman instead of failing.
 */
import fs from "node:fs";
import path from "node:path";
import { Font } from "@react-pdf/renderer";

export interface PdfFonts {
  sans: string;
  serif: string;
  display: string;
  /** True when the briefing's own typefaces are embedded (false = standard-font fallback). */
  embedded: boolean;
}

const FAMILIES = { sans: "WhyUs Sans", serif: "WhyUs Serif", display: "WhyUs Display" } as const;

const FILES = {
  sans: [
    { file: "instrumentsans/InstrumentSans-Regular.ttf", fontWeight: 400 },
    { file: "instrumentsans/InstrumentSans-Medium.ttf", fontWeight: 500 },
    { file: "instrumentsans/InstrumentSans-SemiBold.ttf", fontWeight: 600 },
  ],
  serif: [
    { file: "newsreader/Newsreader16pt-Regular.ttf", fontWeight: 400 },
    { file: "newsreader/Newsreader16pt-Medium.ttf", fontWeight: 500 },
  ],
  display: [{ file: "newsreader/Newsreader72pt-Regular.ttf", fontWeight: 400 }],
} as const;

const STANDARD = {
  sans: [
    { src: "Helvetica", fontWeight: 400 },
    { src: "Helvetica-Bold", fontWeight: 600 },
  ],
  serif: [
    { src: "Times-Roman", fontWeight: 400 },
    { src: "Times-Bold", fontWeight: 500 },
  ],
  display: [{ src: "Times-Roman", fontWeight: 400 }],
} as const;

/** Where the font files live. WHYUS_PDF_FONT_DIR overrides (e.g. a standalone deployment). */
export function fontDirCandidates(): string[] {
  return [process.env.WHYUS_PDF_FONT_DIR, path.join(process.cwd(), "src", "lib", "pdf", "fonts")].filter(
    (d): d is string => Boolean(d),
  );
}

function findFontDir(): string | null {
  const needed = [...FILES.sans, ...FILES.serif, ...FILES.display].map((f) => f.file);
  for (const dir of fontDirCandidates()) {
    try {
      if (needed.every((f) => fs.statSync(path.join(/*turbopackIgnore: true*/ dir, f)).isFile())) return dir;
    } catch {
      // missing in this candidate; try the next one
    }
  }
  return null;
}

const globalFonts = globalThis as unknown as { __whyusPdfFonts?: PdfFonts };

/**
 * Register the briefing fonts once per process and return the family names to
 * use. Safe to call on every render.
 */
export function ensurePdfFonts(): PdfFonts {
  if (globalFonts.__whyusPdfFonts) return globalFonts.__whyusPdfFonts;

  // Briefings are set ragged-right with whole words; never insert hyphens.
  Font.registerHyphenationCallback((word) => [word]);

  const dir = findFontDir();
  let fonts: PdfFonts;
  if (dir) {
    for (const key of ["sans", "serif", "display"] as const) {
      Font.register({
        family: FAMILIES[key],
        fonts: FILES[key].map((f) => ({ src: path.join(/*turbopackIgnore: true*/ dir, f.file), fontWeight: f.fontWeight })),
      });
    }
    fonts = { ...FAMILIES, embedded: true };
  } else {
    console.warn("[pdf] briefing fonts not found; using Helvetica and Times-Roman");
    const fallback = { sans: `${FAMILIES.sans} Standard`, serif: `${FAMILIES.serif} Standard`, display: `${FAMILIES.display} Standard` };
    for (const key of ["sans", "serif", "display"] as const) {
      Font.register({ family: fallback[key], fonts: STANDARD[key].map((f) => ({ src: f.src, fontWeight: f.fontWeight })) });
    }
    fonts = { ...fallback, embedded: false };
  }
  globalFonts.__whyusPdfFonts = fonts;
  return fonts;
}
