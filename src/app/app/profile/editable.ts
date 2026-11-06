/** Editor-side shapes for the profile form: every field a string while editing. */
import type { FieldErrors } from "@/lib/profile/validate";
import type { Activity, StudentProfile } from "@/lib/types";

export interface EditableActivity {
  id: string;
  title: string;
  role: string;
  organization: string;
  category: string;
  description: string;
  grades: string;
  hoursPerWeek: string;
  weeksPerYear: string;
}

export interface EditorValues {
  name: string;
  graduationYear: string;
  highSchool: string;
  location: string;
  intendedMajors: string[];
  interests: string[];
  activities: EditableActivity[];
  /** Text the activities were imported from; undefined until an import in this session. */
  activitiesSource?: string;
}

export function toEditable(a: Activity): EditableActivity {
  return {
    id: a.id,
    title: a.title ?? "",
    role: a.role ?? "",
    organization: a.organization ?? "",
    category: a.category ?? "",
    description: a.description ?? "",
    grades: a.grades ?? "",
    hoursPerWeek: a.hoursPerWeek === undefined || a.hoursPerWeek === null ? "" : String(a.hoursPerWeek),
    weeksPerYear: a.weeksPerYear === undefined || a.weeksPerYear === null ? "" : String(a.weeksPerYear),
  };
}

export function newActivityId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return `act-${c.randomUUID().slice(0, 12)}`;
  return `act-${Math.random().toString(36).slice(2, 14)}`;
}

export function blankActivity(): EditableActivity {
  return { id: newActivityId(), title: "", role: "", organization: "", category: "", description: "", grades: "", hoursPerWeek: "", weeksPerYear: "" };
}

export function valuesFromProfile(p: Pick<StudentProfile, "name" | "graduationYear" | "highSchool" | "location" | "intendedMajors" | "interests" | "activities">): EditorValues {
  return {
    name: p.name,
    graduationYear: String(p.graduationYear),
    highSchool: p.highSchool ?? "",
    location: p.location ?? "",
    intendedMajors: [...p.intendedMajors],
    interests: [...p.interests],
    activities: p.activities.map(toEditable),
  };
}

export function snapshot(v: EditorValues): string {
  return JSON.stringify(v);
}

/**
 * Server errors name activities by position ("activities.2.title"). Re-key them
 * by activity id so they stay on the right row if the list is reordered.
 */
export function splitErrors(errors: FieldErrors, activities: EditableActivity[]): { fields: FieldErrors; byActivity: Record<string, FieldErrors> } {
  const fields: FieldErrors = {};
  const byActivity: Record<string, FieldErrors> = {};
  for (const [key, message] of Object.entries(errors)) {
    const m = /^activities\.(\d+)\.(\w+)$/.exec(key);
    const id = m ? activities[Number(m[1])]?.id : undefined;
    if (m && id) (byActivity[id] ??= {})[m[2]] = message;
    else fields[key] = message;
  }
  return { fields, byActivity };
}
