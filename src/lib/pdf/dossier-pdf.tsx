/**
 * PDF export of a dossier.
 *
 * Returns a Letter-size PDF that matches the on-screen briefing: the same
 * hierarchy, citations as live links with their verification dates, uniqueness
 * visuals, the swap test, angles, questions, and the research-use note.
 * Node only (react-pdf + fontkit); call it from a nodejs route handler.
 */
import { renderToBuffer } from "@react-pdf/renderer";
import type { Dossier } from "@/lib/types";
import { DossierPdfDocument } from "./document";
import { ensurePdfFonts } from "./fonts";

export interface RenderDossierPdfOptions {
  /** Student's first name for the masthead ("Research dossier prepared for ..."). */
  preparedFor?: string | null;
}

export async function renderDossierPdf(dossier: Dossier, options: RenderDossierPdfOptions = {}): Promise<Uint8Array> {
  const fonts = ensurePdfFonts();
  const buffer = await renderToBuffer(<DossierPdfDocument dossier={dossier} fonts={fonts} preparedFor={options.preparedFor ?? null} />);
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}
