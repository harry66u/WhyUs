/**
 * Draft checker: points out problems in a student's own draft. It never
 * rewrites, suggests replacement sentences, or generates prose.
 *
 * CONTRACT (implemented by the draft-checker module):
 * - word count against the limit
 * - every school-specific claim (courses, professors, labs, programs, clubs,
 *   places) is checked against verified facts and cached official pages;
 *   anything that cannot be confirmed is flagged, never "fixed"
 * - swap test per sentence against the other schools on the student's list
 * - generic sentences are highlighted
 */
import type { DraftCheckResult } from "@/lib/types";

export interface DraftCheckInput {
  text: string;
  schoolId: string;
  unitId: string | null;
  wordLimit: number | null;
  /** Other schools on the student's list, for the swap test. */
  otherSchoolIds: string[];
}

export async function checkDraft(input: DraftCheckInput): Promise<DraftCheckResult> {
  void input;
  throw new Error("checkDraft: not implemented yet");
}
