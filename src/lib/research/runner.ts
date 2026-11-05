/**
 * Research runs: start, observe, and replay.
 *
 * CONTRACT (implemented by the research-runtime module):
 * - startResearch() creates a research_runs row, marks the application
 *   "researching", and runs the pipeline in the background (in-process). It
 *   returns immediately. Starting while a run is active returns that run.
 * - Every pipeline step appends ResearchEvents to research_events so the live
 *   view can stream them (and replay them after a reload).
 * - On success the dossier is saved, the application is marked "ready" with
 *   progress 100, and angles are re-coordinated across the student's dossiers.
 * - On failure the application is marked "failed" with a readable error.
 */
import type { ResearchEvent, StoredResearchEvent } from "@/lib/types";

export interface RunInfo {
  id: string;
  applicationId: string;
  status: "running" | "done" | "failed";
  engine: "llm" | "deterministic";
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
}

export async function startResearch(applicationId: string, opts: { force?: boolean } = {}): Promise<{ runId: string }> {
  void applicationId;
  void opts;
  throw new Error("startResearch: not implemented yet");
}

export async function getLatestRun(applicationId: string): Promise<RunInfo | null> {
  void applicationId;
  return null;
}

export async function getRunEvents(runId: string, afterSeq = 0): Promise<StoredResearchEvent[]> {
  void runId;
  void afterSeq;
  return [];
}

export type { ResearchEvent };
