/**
 * Briefing components: render a Dossier as the WhyUs intelligence briefing.
 *
 * Presentational and hook-free, so they work in server components, client
 * components (the landing demo), and tests. Layout responds to the width of the
 * nearest `@container/dossier` element; DossierDocument creates one. When using
 * a single piece on its own (for example DetailEntry in a demo), wrap it in an
 * element with the `@container/dossier` class.
 *
 * Server-only data helpers live in ./load (not exported here).
 */
export { AngleList } from "./angle-list";
export { DetailEntry } from "./detail-entry";
export { BriefingSection, DossierDocument, type DossierDocumentProps } from "./dossier-document";
export { DossierHeader } from "./dossier-header";
export { DOSSIER_PRINT_CSS, DossierPrintStyles } from "./print-styles";
export { QuestionList } from "./question-list";
export { ResearchNote } from "./research-note";
export { ScoreScale } from "./score-scale";
export { SwapGlyph, SwapRow } from "./swap-row";
export {
  AUDIENCE_LABELS,
  SCORE_BANDS,
  SWAP_STATUS_LABELS,
  angleRefs,
  clampScore,
  detailAnchor,
  detailScope,
  dossierPdfFileName,
  firstName,
  labelCountsText,
  meterTone,
  orderedAngles,
  rankedDetails,
  scoreBand,
  statsItems,
  swapOutcome,
  swapText,
  uniquenessLabel,
  wordLimitText,
  type ScoreBand,
  type ScoreTone,
} from "./model";
