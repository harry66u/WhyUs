/**
 * The "working on" student for parent and counselor accounts lives in a cookie
 * (read by getActiveStudent). Server-only: call from Server Actions.
 */
import { cookies } from "next/headers";
import { ACTIVE_STUDENT_COOKIE } from "@/lib/data/students";

export async function setActiveStudentCookie(studentId: string): Promise<void> {
  const jar = await cookies();
  jar.set(ACTIVE_STUDENT_COOKIE, studentId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
  });
}

export async function clearActiveStudentCookieIf(studentId: string): Promise<void> {
  const jar = await cookies();
  if (jar.get(ACTIVE_STUDENT_COOKIE)?.value === studentId) jar.delete(ACTIVE_STUDENT_COOKIE);
}
