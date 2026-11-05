/**
 * Matching engine: ranks verified facts against a student's actual activities,
 * runs the swap test, scores uniqueness, proposes essay angles (ideas only),
 * picks questions, and assembles the dossier.
 *
 * CONTRACT (implemented by the matching module):
 * - Works with no API key (deterministic engine). When Claude is available it
 *   may improve explanations, angles, and questions, but must fall back to the
 *   deterministic result on any error.
 * - Never writes essay prose. Angles are one-line ideas.
 * - Never introduces a fact that is not one of the verified candidates.
 */
import type { Dossier, Fact, ResearchEvent, School, StudentProfile } from "@/lib/types";

export interface RankedFact {
  fact: Fact;
  score: number; // 0-1, how directly it connects to this student's activities and interests
  activityIds: string[];
  themes: string[];
}

export interface RankOptions {
  unitId: string | null;
  promptText?: string;
  limit?: number;
}

/** Preliminary ranking used to choose which facts to verify live. */
export function rankFacts(student: StudentProfile, facts: Fact[], opts: RankOptions): RankedFact[] {
  void student;
  void opts;
  return facts.map((fact) => ({ fact, score: 0, activityIds: [], themes: fact.themes }));
}

export interface BuildDossierInput {
  dossierId: string;
  applicationId: string;
  student: StudentProfile;
  school: School;
  unitId: string | null;
  prompt: { text: string; wordLimit: number | null };
  /** Facts that were confirmed on live official pages during this run. */
  verifiedFacts: Fact[];
  /** The other schools on the student's list with their research bases (for the swap test). */
  otherSchools: { school: School; facts: Fact[] }[];
  /** Angle keys already used as leads in the student's other dossiers. */
  usedLeadAngleKeys: string[];
  term: string;
  stats: Omit<Dossier["stats"], "engine">;
}

export interface BuildHooks {
  emit?: (event: ResearchEvent) => void | Promise<void>;
  signal?: AbortSignal;
}

export async function buildDossier(input: BuildDossierInput, hooks: BuildHooks = {}): Promise<Dossier> {
  void input;
  void hooks;
  throw new Error("buildDossier: not implemented yet");
}

/**
 * Re-assign lead angles across one student's dossiers so no two schools lead
 * with the same angle (and secondary angles repeat as little as possible).
 * Returns only the dossiers whose angles changed.
 */
export function coordinateAngles(dossiers: Dossier[]): Dossier[] {
  void dossiers;
  return [];
}
