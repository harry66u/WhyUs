/**
 * Print rules for any page that contains a briefing (`[data-dossier-document]`).
 * Everything is scoped with :has() so other pages print as before. Hoisted and
 * de-duplicated by React (href + precedence), so rendering it twice is harmless.
 *
 * - Paper colors regardless of the on-screen theme, and print-sized type.
 * - App chrome (sidebar navigation, toolbars marked data-print-hide) is hidden.
 * - Entries do not split across pages; headings stay with what follows.
 * - Meters keep their fills even when "background graphics" is off.
 */
export const DOSSIER_PRINT_CSS = `@media print {
  @page { size: letter; margin: 0.6in 0.62in 0.7in; }
  :root:has([data-dossier-document]) {
    color-scheme: light;
    --canvas: #ffffff;
    --raised: #ffffff;
    --sunken: #f5f6f8;
    --overlay: #ffffff;
    --hover: rgb(15 23 42 / 0.05);
    --line: rgb(15 23 42 / 0.12);
    --line-strong: rgb(15 23 42 / 0.22);
    --fg: #0e1116;
    --fg-muted: #3e4652;
    --fg-subtle: #5b6370;
    --accent: #f2b33d;
    --accent-hover: #e7a62a;
    --accent-fg: #1b1303;
    --accent-text: #8a580b;
    --accent-wash: rgb(242 179 61 / 0.18);
    --accent-line: rgb(176 116 18 / 0.45);
    --ok: #2a7f59;
    --ok-wash: rgb(47 143 100 / 0.1);
    --bad: #b43a3a;
    --bad-wash: rgb(194 65 65 / 0.08);
    --info: #3d5fa8;
    --shadow-raise: 0 0 0 1px var(--line);
    --shadow-pop: 0 0 0 1px var(--line);
  }
  :root:has([data-dossier-document]),
  :root:has([data-dossier-document]) body { background: #ffffff !important; }
  /* Type and spacing are rem-based: scale the root so body text prints near 10.5pt. */
  :root:has([data-dossier-document]) { font-size: 13.5px; }
  :root:has([data-dossier-document]) aside:has(nav[aria-label="App"]),
  :root:has([data-dossier-document]) [data-print-hide] { display: none !important; }
  :root:has([data-dossier-document]) main { padding: 0 !important; }
  [data-dossier-document] { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  [data-dossier-document] .animate-enter { animation: none !important; }
  [data-dossier-document] h1,
  [data-dossier-document] h2,
  [data-dossier-document] h3 { break-after: avoid; page-break-after: avoid; }
  [data-dossier-document] [data-section-head] { break-inside: avoid; page-break-inside: avoid; break-after: avoid; page-break-after: avoid; }
  [data-dossier-document] p { orphans: 3; widows: 3; }
  [data-dossier-document] [data-dossier-detail],
  [data-dossier-document] figure,
  [data-dossier-document] li { break-inside: avoid; page-break-inside: avoid; }
}`;

export function DossierPrintStyles() {
  return (
    <style href="whyus-dossier-print" precedence="whyus-dossier">
      {DOSSIER_PRINT_CSS}
    </style>
  );
}
