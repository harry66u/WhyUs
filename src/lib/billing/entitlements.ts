/**
 * What an account may do: first school free, then $9 per school or $29 for
 * unlimited schools (per student), and a counselor plan that covers many
 * students.
 *
 * CONTRACT (implemented by the billing module).
 */
import type { Entitlements } from "@/lib/types";

export async function getEntitlements(userId: string): Promise<Entitlements> {
  void userId;
  return {
    remainingSchools: Number.POSITIVE_INFINITY,
    freeSchoolAvailable: true,
    credits: 0,
    unlimitedStudentIds: [],
    counselorPlan: { active: false, maxStudents: 25 },
  };
}

export type AddSchoolCheck = { ok: true; uses: "free" | "credit" | "unlimited" | "counselor" } | { ok: false; reason: string };

/** Whether this account can add one more school for this student right now. */
export async function canAddSchool(userId: string, studentId: string): Promise<AddSchoolCheck> {
  void userId;
  void studentId;
  return { ok: true, uses: "free" };
}

/** Whether this account can create another student profile. */
export async function canAddStudent(userId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  void userId;
  return { ok: true };
}
