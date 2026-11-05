"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { ACTIVE_STUDENT_COOKIE, getStudent } from "@/lib/data/students";

/** Switch which student a parent or counselor is working on. */
export async function selectStudentAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const studentId = String(formData.get("studentId") ?? "");
  const student = await getStudent(user.id, studentId);
  if (student) {
    const jar = await cookies();
    jar.set(ACTIVE_STUDENT_COOKIE, student.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 180,
    });
  }
  redirect("/app");
}
