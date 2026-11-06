/**
 * Activity helpers shared by the profile editor and the import flow.
 * Isomorphic (no server-only imports).
 */
import { detectThemes } from "@/lib/matching/themes";
import type { Activity, StudentProfile } from "@/lib/types";
import type { ActivitySourceFormat } from "./parse-text";

/** Response of POST /api/profile/parse. */
export interface ParseResponse {
  activities: Activity[];
  engine: "llm" | "deterministic";
  format: ActivitySourceFormat | null;
  warnings: string[];
  sourceKind: "pdf" | "text";
  fileName: string | null;
  sourceText: string;
}

/** All the text matching reads for one activity. */
export function activityText(a: Pick<Activity, "title" | "role" | "organization" | "category" | "description">): string {
  return [a.title, a.role, a.organization, a.category, a.description].filter(Boolean).join(". ");
}

/** Theme keys WhyUs detects in an activity, most specific first. */
export function activityThemes(a: Pick<Activity, "title" | "role" | "organization" | "category" | "description">): string[] {
  return detectThemes(activityText(a));
}

function norm(s: string | undefined): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Two activities are the same when their titles and organizations match (ignoring case and punctuation). */
export function sameActivity(a: Pick<Activity, "title" | "organization">, b: Pick<Activity, "title" | "organization">): boolean {
  return norm(a.title) === norm(b.title) && norm(a.organization) === norm(b.organization);
}

export interface MergeResult {
  activities: Activity[];
  added: number;
  skipped: number;
}

/**
 * Adds imported activities after the existing ones ("merge") or replaces the
 * list ("replace"). Duplicates are skipped when merging. Ids stay unique.
 */
export function mergeActivities(existing: Activity[], incoming: Activity[], mode: "merge" | "replace", makeId: () => string): MergeResult {
  const base = mode === "replace" ? [] : [...existing];
  const ids = new Set(base.map((a) => a.id));
  let added = 0;
  let skipped = 0;
  for (const a of incoming) {
    if (base.some((b) => sameActivity(a, b))) {
      skipped++;
      continue;
    }
    let id = a.id;
    while (!id || ids.has(id)) id = makeId();
    ids.add(id);
    base.push({ ...a, id });
    added++;
  }
  return { activities: base, added, skipped };
}

/** True when a profile has enough for matching to work with. */
export function profileHasDetails(p: Pick<StudentProfile, "activities" | "intendedMajors" | "interests">): boolean {
  return p.activities.length > 0;
}
