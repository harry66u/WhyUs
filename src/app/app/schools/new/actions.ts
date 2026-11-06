"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { canAddSchool } from "@/lib/billing/entitlements";
import { createApplication, listApplications, setApplicationStatus } from "@/lib/data/applications";
import { getActiveStudent, getStudent } from "@/lib/data/students";
import { startResearch } from "@/lib/research/runner";
import { getSchool } from "@/lib/schools/registry";
import { type AddSchoolErrors, type AddSchoolValues, resolveAddSchool, unitLabel } from "./resolve";

export type AddSchoolState =
  | { status: "idle" }
  | {
      status: "error";
      errors: AddSchoolErrors;
      /** The application that already covers this school and unit. */
      duplicateOf?: string;
      /** The account's plan does not allow another school right now. */
      blocked?: boolean;
    };

function str(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v : "";
}

/** Adds a school (and unit and prompt) to a student's list and starts its research. */
export async function addSchoolAction(_prev: AddSchoolState, formData: FormData): Promise<AddSchoolState> {
  const user = await requireUser("/app/schools/new");
  const postedStudentId = str(formData, "studentId");
  const student = postedStudentId ? await getStudent(user.id, postedStudentId) : await getActiveStudent(user.id);
  if (!student) return { status: "error", errors: { form: "That student profile could not be found. Reload the page and try again." } };

  const values: AddSchoolValues = {
    schoolId: str(formData, "schoolId"),
    unitId: str(formData, "unitId"),
    promptChoice: str(formData, "promptChoice"),
    customPrompt: str(formData, "customPrompt"),
    customWordLimit: str(formData, "customWordLimit"),
  };
  const existing = await listApplications(user.id, student.id);
  const resolved = resolveAddSchool(values, { getSchool, existing });
  if (!resolved.ok) return { status: "error", errors: resolved.errors, duplicateOf: resolved.duplicateOf };

  const check = await canAddSchool(user.id, student.id);
  if (!check.ok) return { status: "error", errors: { form: check.reason }, blocked: true };

  let applicationId: string;
  try {
    const app = await createApplication({ studentId: student.id, ...resolved.input });
    applicationId = app.id;
  } catch {
    // Most likely a second submit that raced the first (one row per school and unit).
    const again = await listApplications(user.id, student.id);
    const dup = again.find((a) => a.schoolId === resolved.input.schoolId && (a.unitId ?? null) === resolved.input.unitId);
    if (dup) {
      return { status: "error", errors: { form: `${unitLabel(resolved.school, resolved.unit)} is already on this list.` }, duplicateOf: dup.id };
    }
    return { status: "error", errors: { form: "The school could not be added just now. Try again in a moment." } };
  }

  try {
    await startResearch(applicationId);
  } catch {
    await setApplicationStatus(applicationId, "failed", 0, "Research could not start. Open this school to try again.");
  }
  revalidatePath("/app");
  redirect(`/app/schools/${applicationId}/research`);
}
