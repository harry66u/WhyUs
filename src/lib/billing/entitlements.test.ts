/**
 * The entitlement contract (getEntitlements, canAddSchool, canAddStudent)
 * against the in-memory database. Fictional accounts only.
 */
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDb } from "@/lib/db/client";
import { applications, purchases, students, users } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import type { AccountRole, PurchaseKind } from "@/lib/types";
import { canAddSchool, canAddStudent, getEntitlements } from "./entitlements";
import { recordPurchase } from "./purchases";

async function account(role: AccountRole, studentCount = 1) {
  const db = await getDb();
  const userId = `ent-${newId(6)}`;
  await db.insert(users).values({ id: userId, email: `${userId}@example.com`, role });
  const studentIds: string[] = [];
  for (let i = 0; i < studentCount; i++) {
    const id = `${userId}-s${i}`;
    await db.insert(students).values({ id, ownerUserId: userId, name: `Student ${i + 1}`, graduationYear: 2027, isSelf: role === "student" });
    studentIds.push(id);
  }
  return { userId, studentIds };
}

let unit = 0;
async function addSchool(studentId: string, at: Date): Promise<string> {
  const db = await getDb();
  const id = `app-${newId(6)}`;
  // One row per (student, school, unit): vary the unit to keep rows distinct.
  await db.insert(applications).values({ id, studentId, schoolId: "example", unitId: `unit-${++unit}`, promptText: "Why Example University?", createdAt: at, updatedAt: at });
  return id;
}

async function buy(userId: string, kind: PurchaseKind, at: Date, extra: { quantity?: number; studentId?: string } = {}) {
  const db = await getDb();
  await db.insert(purchases).values({
    id: `pur-${newId(6)}`,
    userId,
    kind,
    quantity: extra.quantity ?? 1,
    studentId: extra.studentId ?? null,
    amountCents: 900,
    stripeSessionId: `cs_test_${newId(8)}`,
    status: "paid",
    createdAt: at,
  });
}

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

describe("entitlements from the database", () => {
  it("gives a new account its free school, then needs a credit", async () => {
    const { userId, studentIds } = await account("student");
    expect(await canAddSchool(userId, studentIds[0])).toEqual({ ok: true, uses: "free" });
    await addSchool(studentIds[0], minutesAgo(30));
    const ent = await getEntitlements(userId);
    expect(ent).toMatchObject({ freeSchoolAvailable: false, credits: 0, remainingSchools: 0 });
    expect((await canAddSchool(userId, studentIds[0])).ok).toBe(false);

    await buy(userId, "school_credit", minutesAgo(20), { quantity: 2 });
    expect(await canAddSchool(userId, studentIds[0])).toEqual({ ok: true, uses: "credit" });
    expect((await getEntitlements(userId)).credits).toBe(2);
  });

  it("does not give the free school back when it is removed after buying credits", async () => {
    const { userId, studentIds } = await account("student");
    const free = await addSchool(studentIds[0], minutesAgo(60));
    await buy(userId, "school_credit", minutesAgo(50), { quantity: 1 });
    await addSchool(studentIds[0], minutesAgo(40));
    expect(await getEntitlements(userId)).toMatchObject({ credits: 0, remainingSchools: 0 });

    const db = await getDb();
    await db.delete(applications).where(eq(applications.id, free));
    expect(await getEntitlements(userId)).toMatchObject({ freeSchoolAvailable: false, credits: 0, remainingSchools: 0 });
    expect((await canAddSchool(userId, studentIds[0])).ok).toBe(false);
  });

  it("covers one student with unlimited and every student with the counselor plan", async () => {
    const parent = await account("parent", 2);
    await addSchool(parent.studentIds[1], minutesAgo(90));
    await buy(parent.userId, "unlimited", minutesAgo(80), { studentId: parent.studentIds[0] });
    for (let i = 0; i < 6; i++) await addSchool(parent.studentIds[0], minutesAgo(70 - i));
    const ent = await getEntitlements(parent.userId);
    expect(ent.unlimitedStudentIds).toEqual([parent.studentIds[0]]);
    expect(await canAddSchool(parent.userId, parent.studentIds[0])).toEqual({ ok: true, uses: "unlimited" });
    expect((await canAddSchool(parent.userId, parent.studentIds[1])).ok).toBe(false);

    const counselor = await account("counselor", 3);
    expect((await canAddStudent(counselor.userId)).ok).toBe(false);
    await buy(counselor.userId, "counselor", minutesAgo(5));
    expect(await canAddStudent(counselor.userId)).toEqual({ ok: true });
    expect(await canAddSchool(counselor.userId, counselor.studentIds[2])).toEqual({ ok: true, uses: "counselor" });
    expect((await getEntitlements(counselor.userId)).counselorPlan).toEqual({ active: true, maxStudents: 25 });
  });

  it("only answers for the account's own students", async () => {
    const a = await account("student");
    const b = await account("student");
    expect((await canAddSchool(a.userId, b.studentIds[0])).ok).toBe(false);
    expect((await canAddSchool(a.userId, "")).ok).toBe(false);
  });

  it("records each Stripe checkout once", async () => {
    const { userId } = await account("student");
    const input = { userId, kind: "school_credit" as const, quantity: 2, studentId: null, amountCents: 1800, currency: "USD", stripeSessionId: `cs_test_${newId(8)}`, status: "paid" as const };
    const first = await recordPurchase(input);
    const second = await recordPurchase({ ...input, quantity: 99 });
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.purchase.id).toBe(first.purchase.id);
    expect(second.purchase.quantity).toBe(2);
    expect(first.purchase.currency).toBe("usd");
    const db = await getDb();
    expect(await db.select().from(purchases).where(eq(purchases.userId, userId))).toHaveLength(1);
  });
});
