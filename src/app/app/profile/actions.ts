"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { getStudent, updateStudent } from "@/lib/data/students";
import { newId } from "@/lib/ids";
import { type FieldErrors, type ProfileInput, validateProfile } from "@/lib/profile/validate";
import type { Activity } from "@/lib/types";

export interface SaveProfileInput extends ProfileInput {
  studentId: string;
}

export type SaveProfileResult =
  | {
      ok: true;
      savedAt: string;
      /** The saved values, normalized (trimmed text, unique activity ids). */
      profile: {
        name: string;
        graduationYear: number;
        highSchool: string;
        location: string;
        intendedMajors: string[];
        interests: string[];
        activities: Activity[];
      };
    }
  | { ok: false; errors: FieldErrors; message: string };

/** Saves the whole profile of one student the signed-in account owns. */
export async function saveProfileAction(input: SaveProfileInput): Promise<SaveProfileResult> {
  const user = await requireUser("/app/profile");
  const studentId = input && typeof input.studentId === "string" ? input.studentId : "";
  const student = studentId ? await getStudent(user.id, studentId) : null;
  if (!student) return { ok: false, errors: {}, message: "This profile could not be found. Reload the page and try again." };

  const result = validateProfile(input, { makeId: () => `act-${newId(6)}` });
  if (!result.ok) {
    const count = Object.keys(result.errors).length;
    return { ok: false, errors: result.errors, message: count === 1 ? "One field needs attention." : `${count} fields need attention.` };
  }
  const v = result.value;
  const updated = await updateStudent(user.id, student.id, {
    name: v.name,
    graduationYear: v.graduationYear,
    highSchool: v.highSchool,
    location: v.location,
    intendedMajors: v.intendedMajors,
    interests: v.interests,
    activities: v.activities,
    ...(v.activitiesSource !== undefined ? { activitiesSource: v.activitiesSource } : {}),
  });
  if (!updated) return { ok: false, errors: {}, message: "The profile could not be saved just now. Try again in a moment." };

  // The name shows in the sidebar switcher and on the Schools page.
  revalidatePath("/app", "layout");
  return {
    ok: true,
    savedAt: updated.updatedAt.toISOString(),
    profile: {
      name: v.name,
      graduationYear: v.graduationYear,
      highSchool: v.highSchool ?? "",
      location: v.location ?? "",
      intendedMajors: v.intendedMajors,
      interests: v.interests,
      activities: v.activities,
    },
  };
}
