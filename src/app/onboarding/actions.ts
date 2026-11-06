"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { setActiveStudentCookie } from "@/app/app/students/active";
import { requireUser } from "@/lib/auth/session";
import { createStudent, listStudents, updateStudent } from "@/lib/data/students";
import { setUserRole } from "@/lib/data/users";
import { type FieldErrors, PROFILE_LIMITS, validateBasics } from "@/lib/profile/validate";
import type { AccountRole } from "@/lib/types";

export type OnboardingState = { status: "idle" } | { status: "error"; errors: FieldErrors; message?: string };

const ROLES: AccountRole[] = ["student", "parent", "counselor"];

function field(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
}

/**
 * Sets the account type and creates the first student profile: the student's
 * own (student accounts) or the first student a parent or counselor manages.
 */
export async function completeOnboardingAction(_prev: OnboardingState, formData: FormData): Promise<OnboardingState> {
  const user = await requireUser("/onboarding");
  const role = ROLES.find((r) => r === field(formData, "role"));
  if (!role) return { status: "error", errors: { role: "Choose who this account is for." } };

  const own = role === "student";
  const yourName = field(formData, "yourName");
  const errors: FieldErrors = {};
  if (!own && !yourName) errors.yourName = "Enter your name.";
  if (yourName.length > PROFILE_LIMITS.name) errors.yourName = `Keep your name under ${PROFILE_LIMITS.name} characters.`;

  const basics = validateBasics({
    name: own ? yourName : field(formData, "studentName"),
    graduationYear: field(formData, "graduationYear"),
    highSchool: field(formData, "highSchool"),
  });
  if (!basics.ok) {
    const { name, ...rest } = basics.errors;
    Object.assign(errors, rest);
    if (name) {
      if (own) errors.yourName ??= "Enter your name.";
      else errors.studentName = name === "Enter a name." ? "Enter the student's name." : name;
    }
  }
  if (Object.keys(errors).length > 0 || !basics.ok) return { status: "error", errors };

  const existing = await listStudents(user.id);
  // Already set up (a second submit, or another tab): go to the app.
  if (user.role && existing.length > 0) redirect("/app");

  const { name, graduationYear, highSchool } = basics.value;
  let studentId: string;
  try {
    if (existing.length > 0) {
      // A previous attempt created the profile but did not finish: reuse it.
      const updated = await updateStudent(user.id, existing[0].id, { name, graduationYear, highSchool });
      studentId = updated?.id ?? existing[0].id;
    } else {
      const created = await createStudent(user.id, { name, graduationYear, highSchool, isSelf: own });
      studentId = created.id;
    }
    await setUserRole(user.id, role, yourName || name);
  } catch {
    return { status: "error", errors: {}, message: "Your account could not be set up just now. Try again in a moment." };
  }
  await setActiveStudentCookie(studentId);
  revalidatePath("/app", "layout");
  redirect(own ? "/app/profile" : "/app/students");
}
