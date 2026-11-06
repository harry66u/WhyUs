/**
 * What an account may do: first school free, then $9 per school or $29 for
 * unlimited schools (per student), and a counselor plan that covers many
 * students. The rules themselves are pure and live in ./rules.ts; this module
 * loads the account's rows and applies them.
 *
 * CONTRACT (implemented by the billing module).
 */
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { applications, purchases, students, users } from "@/lib/db/schema";
import type { AccountRole, Entitlements } from "@/lib/types";
import { billingConfig } from "./plans";
import {
  type AddSchoolCheck,
  type BillingInput,
  type BillingState,
  checkAddSchool,
  checkAddStudent,
  computeBilling,
} from "./rules";

export type { AddSchoolCheck, AddStudentCheck } from "./rules";

/** Simulated purchases (development without Stripe) never count in production. */
export function countSimulatedPurchases(): boolean {
  return process.env.NODE_ENV !== "production";
}

export interface AccountBillingRows {
  role: AccountRole | null;
  students: { id: string; name: string; isSelf: boolean; createdAt: Date }[];
  applications: { id: string; studentId: string; schoolId: string; unitId: string | null; createdAt: Date }[];
  purchases: (typeof purchases.$inferSelect)[];
}

/** Every row the rules need, scoped to one account. */
export async function loadAccountBillingRows(userId: string): Promise<AccountBillingRows> {
  const db = await getDb();
  const [userRows, studentRows, appRows, purchaseRows] = await Promise.all([
    db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1),
    db
      .select({ id: students.id, name: students.name, isSelf: students.isSelf, createdAt: students.createdAt })
      .from(students)
      .where(eq(students.ownerUserId, userId))
      .orderBy(asc(students.createdAt)),
    db
      .select({
        id: applications.id,
        studentId: applications.studentId,
        schoolId: applications.schoolId,
        unitId: applications.unitId,
        createdAt: applications.createdAt,
      })
      .from(applications)
      .innerJoin(students, eq(students.id, applications.studentId))
      .where(eq(students.ownerUserId, userId))
      .orderBy(asc(applications.createdAt)),
    db.select().from(purchases).where(eq(purchases.userId, userId)).orderBy(asc(purchases.createdAt)),
  ]);
  return { role: userRows[0]?.role ?? null, students: studentRows, applications: appRows, purchases: purchaseRows };
}

export function billingInputFrom(rows: AccountBillingRows, now: Date = new Date()): BillingInput {
  return {
    role: rows.role,
    students: rows.students.map((s) => ({ id: s.id, name: s.name, createdAt: s.createdAt })),
    applications: rows.applications.map((a) => ({ id: a.id, studentId: a.studentId, createdAt: a.createdAt })),
    purchases: rows.purchases.map((p) => ({
      id: p.id,
      kind: p.kind,
      quantity: p.quantity,
      studentId: p.studentId,
      status: p.status,
      createdAt: p.createdAt,
    })),
    now,
    config: billingConfig(),
    countSimulated: countSimulatedPurchases(),
  };
}

/** The account's rows, the rules' input, and the computed state, in one read. */
export async function getBillingState(userId: string, now: Date = new Date()): Promise<{ rows: AccountBillingRows; input: BillingInput; state: BillingState }> {
  const rows = await loadAccountBillingRows(userId);
  const input = billingInputFrom(rows, now);
  return { rows, input, state: computeBilling(input) };
}

export async function getEntitlements(userId: string): Promise<Entitlements> {
  const { state } = await getBillingState(userId);
  return state.entitlements;
}

/** Whether this account can add one more school for this student right now. */
export async function canAddSchool(userId: string, studentId: string): Promise<AddSchoolCheck> {
  if (typeof studentId !== "string" || !studentId) {
    return { ok: false, reason: "That student profile could not be found. Reload the page and try again." };
  }
  const { input, state } = await getBillingState(userId);
  return checkAddSchool(state, input, studentId);
}

/** Whether this account can create another student profile. */
export async function canAddStudent(userId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { input, state } = await getBillingState(userId);
  return checkAddStudent(state, input);
}
