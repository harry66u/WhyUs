/**
 * Validates an add-school submission against the registry and the student's
 * current list. Pure: the school lookup is passed in, so tests can use a
 * fictional school.
 */
import { promptsFor } from "@/lib/schools/registry";
import type { ApplicationInput, School, SchoolUnit } from "@/lib/types";
import { CUSTOM_PROMPT, type SchoolOption } from "./options";

export { CUSTOM_PROMPT } from "./options";
export const PROMPT_MIN_CHARS = 15;
export const PROMPT_MAX_CHARS = 3000;
export const WORD_LIMIT_MIN = 10;
export const WORD_LIMIT_MAX = 2000;

export interface AddSchoolValues {
  schoolId: string;
  unitId: string;
  /** A library prompt id, or "custom". */
  promptChoice: string;
  customPrompt: string;
  customWordLimit: string;
}

export type AddSchoolField = "schoolId" | "unitId" | "promptChoice" | "customPrompt" | "customWordLimit" | "form";
export type AddSchoolErrors = Partial<Record<AddSchoolField, string>>;

export type Resolved =
  | { ok: true; input: Omit<ApplicationInput, "studentId">; school: School; unit: SchoolUnit | undefined }
  | { ok: false; errors: AddSchoolErrors; duplicateOf?: string };

export function unitLabel(school: Pick<School, "name">, unit: Pick<SchoolUnit, "name"> | undefined): string {
  return unit && unit.name !== school.name ? `${unit.name} at ${school.name}` : school.name;
}

export function resolveAddSchool(
  values: AddSchoolValues,
  ctx: { getSchool: (id: string) => School | undefined; existing: { id: string; schoolId: string; unitId: string | null }[] },
): Resolved {
  const school = values.schoolId ? ctx.getSchool(values.schoolId) : undefined;
  if (!school) return { ok: false, errors: { schoolId: "Choose a school." } };

  let unit: SchoolUnit | undefined;
  if (school.units.length > 0) {
    unit = school.units.find((u) => u.id === values.unitId) ?? (school.units.length === 1 ? school.units[0] : undefined);
    if (!unit) return { ok: false, errors: { unitId: "Choose the school or college you are applying to." } };
  }
  const unitId = unit?.id ?? null;

  const dup = ctx.existing.find((a) => a.schoolId === school.id && (a.unitId ?? null) === unitId);
  if (dup) {
    return { ok: false, errors: { form: `${unitLabel(school, unit)} is already on this list.` }, duplicateOf: dup.id };
  }

  const library = promptsFor(school, unitId);
  const choice = values.promptChoice || (library.length === 0 ? CUSTOM_PROMPT : "");
  if (!choice) return { ok: false, errors: { promptChoice: "Choose the prompt you are answering, or paste it." } };

  if (choice !== CUSTOM_PROMPT) {
    const prompt = library.find((p) => p.id === choice);
    if (!prompt) return { ok: false, errors: { promptChoice: "That prompt does not apply to this school or college. Choose another, or paste it." } };
    return {
      ok: true,
      school,
      unit,
      input: { schoolId: school.id, unitId, promptId: prompt.id, promptText: prompt.text, wordLimit: prompt.wordLimit?.max ?? null },
    };
  }

  const errors: AddSchoolErrors = {};
  const text = values.customPrompt.replace(/\r\n?/g, "\n").trim();
  if (text.length < PROMPT_MIN_CHARS) errors.customPrompt = "Paste the full prompt exactly as it appears in the application.";
  else if (text.length > PROMPT_MAX_CHARS) errors.customPrompt = "That is longer than a supplemental prompt. Paste only the prompt itself.";

  let wordLimit: number | null = null;
  const rawLimit = values.customWordLimit.replace(/[,\s]/g, "").replace(/words?$/i, "");
  if (rawLimit) {
    const n = Number(rawLimit);
    if (!Number.isInteger(n) || n < WORD_LIMIT_MIN || n > WORD_LIMIT_MAX) {
      errors.customWordLimit = `Enter the word limit as a whole number between ${WORD_LIMIT_MIN} and ${WORD_LIMIT_MAX.toLocaleString("en-US")}.`;
    } else wordLimit = n;
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, school, unit, input: { schoolId: school.id, unitId, promptId: null, promptText: text, wordLimit } };
}

/** The client-side picker data for one school. */
export function toSchoolOption(school: School): SchoolOption {
  return {
    id: school.id,
    name: school.name,
    shortName: school.shortName,
    city: school.city,
    state: school.state,
    units: school.units.map((u) => ({
      id: u.id,
      name: u.name,
      shortName: u.shortName,
      prompts: promptsFor(school, u.id).map((p) => ({
        id: p.id,
        title: p.title,
        text: p.text,
        wordLimit: p.wordLimit,
        sourceUrl: p.sourceUrl,
        verifiedAt: p.verifiedAt,
        cycle: p.cycle,
        note: p.note,
      })),
    })),
    searchText: [school.name, school.shortName, school.city, school.state, ...school.units.flatMap((u) => [u.name, u.shortName ?? "", ...u.aliases])]
      .join(" ")
      .toLowerCase(),
  };
}
