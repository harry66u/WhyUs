/**
 * Paper theme for the PDF export. Mirrors the light theme tokens in
 * src/app/globals.css (alpha tokens pre-blended onto white, text colors nudged
 * so small print keeps at least 4.5:1 contrast on paper).
 */
export const PDF_COLORS = {
  paper: "#ffffff",
  ink: "#0e1116", // --fg
  muted: "#3e4652", // --fg-muted (print)
  subtle: "#5b6370", // --fg-subtle (print)
  line: "#e2e3e5", // --line on white
  lineStrong: "#cacbd0", // --line-strong on white
  sunken: "#f4f5f7",
  accent: "#f2b33d", // marker amber
  accentFg: "#1b1303",
  accentText: "#8a580b",
  accentWash: "#fdf1dc",
  meterMid: "#b29459", // color-mix(accent 55%, fg-subtle)
  meterNeutral: "#646d7c",
  meterEmpty: "#d6d8dc",
  ok: "#2a7f59",
} as const;

/** Letter, in points. Content column = page minus margins; ranks hang in the gutter. */
export const PDF_LAYOUT = {
  pageWidth: 612,
  pageHeight: 792,
  marginTop: 52,
  marginBottom: 64,
  marginX: 54,
  gutter: 26,
  railWidth: 140,
  railGap: 18,
} as const;

export const CONTENT_WIDTH = PDF_LAYOUT.pageWidth - PDF_LAYOUT.marginX * 2; // 504
export const COLUMN_WIDTH = CONTENT_WIDTH - PDF_LAYOUT.gutter; // 478
export const MAIN_WIDTH = COLUMN_WIDTH - PDF_LAYOUT.railWidth - PDF_LAYOUT.railGap; // 320
