/**
 * Validation for student profiles. Isomorphic: the server actions use it as the
 * authority, and the editor can use it to show the same messages early.
 */
import type { Activity } from "@/lib/types";
import { isValidGraduationYear } from "./years";

export const PROFILE_LIMITS = {
  name: 100,
  highSchool: 160,
  location: 160,
  tag: 80,
  majors: 8,
  interests: 24,
  activities: 40,
  title: 160,
  role: 120,
  organization: 160,
  category: 60,
  description: 1500,
  grades: 60,
  source: 100_000,
} as const;

export type FieldErrors = Record<string, string>;

export type Validation<T> = { ok: true; value: T } | { ok: false; errors: FieldErrors };

export interface BasicsInput {
  name?: unknown;
  graduationYear?: unknown;
  highSchool?: unknown;
  location?: unknown;
}

export interface ValidBasics {
  name: string;
  graduationYear: number;
  highSchool: string | null;
  location: string | null;
}

export interface ActivityInput {
  id?: unknown;
  title?: unknown;
  role?: unknown;
  organization?: unknown;
  category?: unknown;
  description?: unknown;
  grades?: unknown;
  hoursPerWeek?: unknown;
  weeksPerYear?: unknown;
}

export interface ProfileInput extends BasicsInput {
  intendedMajors?: unknown;
  interests?: unknown;
  activities?: unknown;
  activitiesSource?: unknown;
}

export interface ValidProfile extends ValidBasics {
  intendedMajors: string[];
  interests: string[];
  activities: Activity[];
  activitiesSource?: string | null;
}

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function text(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

/** Like text() but keeps line breaks (descriptions made of bullet points). */
function multiline(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function optionalNumber(value: unknown): number | undefined | "invalid" {
  if (value === null || value === undefined || value === "") return undefined;
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : Number.NaN;
  return Number.isFinite(n) ? n : "invalid";
}

/** Trims, collapses spaces, and removes empty and duplicate (case-insensitive) tags. */
export function normalizeTags(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of values) {
    const t = text(v);
    const k = t.toLowerCase();
    if (!t || seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

export function validateBasics(input: BasicsInput): Validation<ValidBasics> {
  const errors: FieldErrors = {};
  const name = text(input.name);
  if (!name) errors.name = "Enter a name.";
  else if (name.length > PROFILE_LIMITS.name) errors.name = `Keep the name under ${PROFILE_LIMITS.name} characters.`;

  const yearRaw = typeof input.graduationYear === "string" ? Number(input.graduationYear) : input.graduationYear;
  if (!isValidGraduationYear(yearRaw)) errors.graduationYear = "Choose a graduation year.";

  const highSchool = text(input.highSchool);
  if (highSchool.length > PROFILE_LIMITS.highSchool) errors.highSchool = `Keep the high school name under ${PROFILE_LIMITS.highSchool} characters.`;
  const location = text(input.location);
  if (location.length > PROFILE_LIMITS.location) errors.location = `Keep the location under ${PROFILE_LIMITS.location} characters.`;

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: { name, graduationYear: yearRaw as number, highSchool: highSchool || null, location: location || null },
  };
}

function validateActivity(input: ActivityInput, index: number, errors: FieldErrors): Omit<Activity, "id"> & { id?: string } {
  const at = (field: string) => `activities.${index}.${field}`;
  const title = text(input.title);
  if (!title) errors[at("title")] = "Give this activity a title.";
  else if (title.length > PROFILE_LIMITS.title) errors[at("title")] = `Keep the title under ${PROFILE_LIMITS.title} characters.`;

  const role = text(input.role);
  if (role.length > PROFILE_LIMITS.role) errors[at("role")] = `Keep the position under ${PROFILE_LIMITS.role} characters.`;
  const organization = text(input.organization);
  if (organization.length > PROFILE_LIMITS.organization) errors[at("organization")] = `Keep the organization under ${PROFILE_LIMITS.organization} characters.`;
  const category = text(input.category);
  if (category.length > PROFILE_LIMITS.category) errors[at("category")] = `Keep the activity type under ${PROFILE_LIMITS.category} characters.`;
  const description = multiline(input.description);
  if (description.length > PROFILE_LIMITS.description) errors[at("description")] = `Keep the description under ${PROFILE_LIMITS.description.toLocaleString("en-US")} characters.`;
  const grades = text(input.grades);
  if (grades.length > PROFILE_LIMITS.grades) errors[at("grades")] = `Keep grade levels under ${PROFILE_LIMITS.grades} characters.`;

  const hours = optionalNumber(input.hoursPerWeek);
  if (hours === "invalid" || (hours !== undefined && (hours < 0 || hours > 168))) errors[at("hoursPerWeek")] = "Hours per week must be between 0 and 168.";
  const weeks = optionalNumber(input.weeksPerYear);
  if (weeks === "invalid" || (weeks !== undefined && (!Number.isInteger(weeks) || weeks < 0 || weeks > 52))) {
    errors[at("weeksPerYear")] = "Weeks per year must be a whole number from 0 to 52.";
  }

  const id = typeof input.id === "string" && ID_RE.test(input.id) ? input.id : undefined;
  const a: Omit<Activity, "id"> & { id?: string } = { id, title, description };
  if (role) a.role = role;
  if (organization) a.organization = organization;
  if (category) a.category = category;
  if (grades) a.grades = grades;
  if (typeof hours === "number") a.hoursPerWeek = Math.round(hours * 10) / 10;
  if (typeof weeks === "number") a.weeksPerYear = weeks;
  return a;
}

/**
 * Validates and normalizes a full profile. `makeId` names activities that come
 * in without a usable id (new rows, or an id already used by another row).
 */
export function validateProfile(input: ProfileInput, opts: { makeId: () => string }): Validation<ValidProfile> {
  const basics = validateBasics(input);
  const errors: FieldErrors = basics.ok ? {} : { ...basics.errors };

  const intendedMajors = normalizeTags(input.intendedMajors);
  if (intendedMajors.length > PROFILE_LIMITS.majors) errors.intendedMajors = `List up to ${PROFILE_LIMITS.majors} intended majors.`;
  else if (intendedMajors.some((m) => m.length > PROFILE_LIMITS.tag)) errors.intendedMajors = `Keep each major under ${PROFILE_LIMITS.tag} characters.`;

  const interests = normalizeTags(input.interests);
  if (interests.length > PROFILE_LIMITS.interests) errors.interests = `List up to ${PROFILE_LIMITS.interests} interests.`;
  else if (interests.some((m) => m.length > PROFILE_LIMITS.tag)) errors.interests = `Keep each interest under ${PROFILE_LIMITS.tag} characters.`;

  const rawActivities = Array.isArray(input.activities) ? (input.activities as ActivityInput[]) : [];
  if (input.activities !== undefined && !Array.isArray(input.activities)) errors.activities = "Activities could not be read.";
  if (rawActivities.length > PROFILE_LIMITS.activities) errors.activities = `Keep the list to ${PROFILE_LIMITS.activities} activities.`;

  const seen = new Set<string>();
  const activities: Activity[] = rawActivities.slice(0, PROFILE_LIMITS.activities).map((raw, i) => {
    const a = validateActivity(raw && typeof raw === "object" ? raw : {}, i, errors);
    let id = a.id && !seen.has(a.id) ? a.id : opts.makeId();
    while (seen.has(id)) id = opts.makeId();
    seen.add(id);
    return { ...a, id };
  });

  let activitiesSource: string | null | undefined;
  if (input.activitiesSource === null) activitiesSource = null;
  else if (typeof input.activitiesSource === "string") {
    activitiesSource = input.activitiesSource.slice(0, PROFILE_LIMITS.source);
  }

  if (Object.keys(errors).length > 0 || !basics.ok) return { ok: false, errors };
  return {
    ok: true,
    value: { ...basics.value, intendedMajors, interests, activities, ...(activitiesSource !== undefined ? { activitiesSource } : {}) },
  };
}
