/**
 * Turn pasted text or an uploaded PDF (Common App activities list or resume)
 * into structured activities the student can review and edit.
 *
 * CONTRACT (implemented by the profile module): deterministic parser for the
 * Common App activities layout and resume-style lists, with Claude extraction
 * when available (falling back to the deterministic parser on any error).
 * Never invent activities: every activity must come from the source text.
 */
import type { Activity } from "@/lib/types";

export interface ParsedActivities {
  activities: Activity[];
  engine: "llm" | "deterministic";
  warnings: string[];
}

export async function parseActivitiesText(text: string): Promise<ParsedActivities> {
  void text;
  return { activities: [], engine: "deterministic", warnings: ["Parser not implemented yet"] };
}

export async function extractPdfText(data: Uint8Array): Promise<string> {
  void data;
  throw new Error("extractPdfText: not implemented yet");
}
