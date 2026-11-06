/** What the add-school form needs to know about each school (client-safe shapes). */

/** The prompt choice for a pasted prompt (anything else is a library prompt id). */
export const CUSTOM_PROMPT = "custom";

export interface PromptOption {
  id: string;
  title: string;
  /** Exact prompt text. */
  text: string;
  wordLimit: { min?: number; max: number } | null;
  sourceUrl: string | null;
  verifiedAt: string | null;
  cycle: string;
  note?: string;
}

export interface UnitOption {
  id: string;
  name: string;
  shortName?: string;
  /** Library prompts that apply to applicants to this unit (unit-specific first). */
  prompts: PromptOption[];
}

export interface SchoolOption {
  id: string;
  name: string;
  shortName: string;
  city: string;
  state: string;
  units: UnitOption[];
  /** Lowercased names, aliases, and places for the search box. */
  searchText: string;
}

export interface TakenOption {
  schoolId: string;
  unitId: string | null;
  applicationId: string;
}

export function formatWordLimit(limit: { min?: number; max: number } | null | undefined): string {
  if (!limit) return "No word limit";
  if (limit.min) return `${limit.min}–${limit.max} words`;
  return `${limit.max} words`;
}
