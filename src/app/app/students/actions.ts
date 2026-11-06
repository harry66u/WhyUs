"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { canAddStudent } from "@/lib/billing/entitlements";
import { createStudent, deleteStudent, getStudent, updateStudent } from "@/lib/data/students";
import { type FieldErrors, validateBasics } from "@/lib/profile/validate";
import { clearActiveStudentCookieIf, setActiveStudentCookie } from "./active";

export type StudentFormState =
  | { status: "idle" }
  | { status: "ok"; message: string; studentId: string }
  | { status: "error"; errors: FieldErrors; message?: string; blocked?: boolean };

function str(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v : "";
}

function nameError(errors: FieldErrors): FieldErrors {
  return errors.name === "Enter a name." ? { ...errors, name: "Enter the student's name." } : errors;
}

/** Adds a student profile to a parent or counselor account. */
export async function addStudentAction(_prev: StudentFormState, formData: FormData): Promise<StudentFormState> {
  const user = await requireUser("/app/students");
  if (user.role === "student") {
    return { status: "error", errors: {}, message: "A student account has one profile, its own." };
  }
  const basics = validateBasics({
    name: str(formData, "name"),
    graduationYear: str(formData, "graduationYear"),
    highSchool: str(formData, "highSchool"),
    location: str(formData, "location"),
  });
  if (!basics.ok) return { status: "error", errors: nameError(basics.errors) };

  const check = await canAddStudent(user.id);
  if (!check.ok) return { status: "error", errors: {}, message: check.reason, blocked: true };

  const student = await createStudent(user.id, { ...basics.value, isSelf: false });
  revalidatePath("/app", "layout");
  return { status: "ok", message: `Added ${student.name}.`, studentId: student.id };
}

/** Edits a student's basics (name, class year, high school, hometown). */
export async function updateStudentAction(_prev: StudentFormState, formData: FormData): Promise<StudentFormState> {
  const user = await requireUser("/app/students");
  const studentId = str(formData, "studentId");
  const student = studentId ? await getStudent(user.id, studentId) : null;
  if (!student) return { status: "error", errors: {}, message: "That student could not be found. Reload the page and try again." };

  const basics = validateBasics({
    name: str(formData, "name"),
    graduationYear: str(formData, "graduationYear"),
    highSchool: str(formData, "highSchool"),
    location: str(formData, "location"),
  });
  if (!basics.ok) return { status: "error", errors: nameError(basics.errors) };

  const updated = await updateStudent(user.id, student.id, basics.value);
  if (!updated) return { status: "error", errors: {}, message: "The changes could not be saved just now. Try again in a moment." };
  revalidatePath("/app", "layout");
  return { status: "ok", message: `Saved ${updated.name}.`, studentId: updated.id };
}

export type DeleteStudentResult = { ok: true; message: string } | { ok: false; message: string };

/**
 * Permanently deletes a student profile and everything that belongs to it:
 * schools, research runs, dossiers, and share links (database cascades).
 */
export async function deleteStudentAction(studentId: string): Promise<DeleteStudentResult> {
  const user = await requireUser("/app/students");
  const student = typeof studentId === "string" && studentId ? await getStudent(user.id, studentId) : null;
  if (!student) return { ok: false, message: "That student could not be found. Reload the page and try again." };
  if (student.isSelf) return { ok: false, message: "Your own profile is deleted with your account, from Settings." };
  const deleted = await deleteStudent(user.id, student.id);
  if (!deleted) return { ok: false, message: "The student could not be deleted just now. Try again in a moment." };
  await clearActiveStudentCookieIf(student.id);
  revalidatePath("/app", "layout");
  return { ok: true, message: `Deleted ${student.name} and all of their research.` };
}

const DESTINATIONS = new Set(["/app", "/app/profile", "/app/schools/new"]);

/** Makes a student the one being worked on, then opens their schools or profile. */
export async function openStudentAction(formData: FormData): Promise<void> {
  const user = await requireUser("/app/students");
  const student = await getStudent(user.id, str(formData, "studentId"));
  const next = str(formData, "next");
  if (student) await setActiveStudentCookie(student.id);
  redirect(student && DESTINATIONS.has(next) ? next : "/app/students");
}
