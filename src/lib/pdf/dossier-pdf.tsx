/**
 * PDF export of a dossier.
 *
 * CONTRACT (implemented by the dossier module): returns a PDF that matches the
 * on-screen briefing (same hierarchy, citations with verification dates,
 * uniqueness visuals, angles, questions, and the research-use note).
 */
import type { Dossier } from "@/lib/types";

export async function renderDossierPdf(dossier: Dossier): Promise<Uint8Array> {
  void dossier;
  throw new Error("renderDossierPdf: not implemented yet");
}
