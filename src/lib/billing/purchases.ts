/**
 * Purchase records. One row per completed checkout (or simulated checkout in
 * development). Rows are written idempotently: a Stripe Checkout Session id can
 * be recorded once, however many times its webhook is delivered.
 */
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { purchases, users } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import type { PurchaseKind } from "@/lib/types";
import type { PurchaseStatus } from "./rules";

export type PurchaseRow = typeof purchases.$inferSelect;

export interface NewPurchase {
  userId: string;
  kind: PurchaseKind;
  quantity: number;
  studentId: string | null;
  amountCents: number;
  currency: string;
  /** Null for simulated purchases. */
  stripeSessionId: string | null;
  status: Extract<PurchaseStatus, "paid" | "simulated">;
}

/** The account's purchases, newest first. */
export async function listPurchases(userId: string): Promise<PurchaseRow[]> {
  const db = await getDb();
  return db.select().from(purchases).where(eq(purchases.userId, userId)).orderBy(desc(purchases.createdAt));
}

export async function getPurchaseBySession(stripeSessionId: string): Promise<PurchaseRow | null> {
  const db = await getDb();
  const rows = await db.select().from(purchases).where(eq(purchases.stripeSessionId, stripeSessionId)).limit(1);
  return rows[0] ?? null;
}

export async function userExists(userId: string): Promise<boolean> {
  const db = await getDb();
  const rows = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  return rows.length > 0;
}

/**
 * Records a purchase. With a Stripe session id, a second call for the same
 * session changes nothing and returns the existing row with `created: false`.
 */
export async function recordPurchase(input: NewPurchase): Promise<{ created: boolean; purchase: PurchaseRow }> {
  const db = await getDb();
  const values = {
    id: newId(),
    userId: input.userId,
    kind: input.kind,
    quantity: input.quantity,
    studentId: input.studentId,
    amountCents: input.amountCents,
    currency: input.currency.toLowerCase(),
    stripeSessionId: input.stripeSessionId,
    status: input.status,
  };
  if (!input.stripeSessionId) {
    const [row] = await db.insert(purchases).values(values).returning();
    return { created: true, purchase: row };
  }
  const inserted = await db.insert(purchases).values(values).onConflictDoNothing({ target: purchases.stripeSessionId }).returning();
  if (inserted[0]) return { created: true, purchase: inserted[0] };
  const existing = await getPurchaseBySession(input.stripeSessionId);
  if (!existing) throw new Error("Purchase was neither inserted nor found");
  return { created: false, purchase: existing };
}

/** Marks the purchases for these Checkout Sessions refunded. Returns how many changed. */
export async function markRefunded(stripeSessionIds: string[]): Promise<number> {
  if (stripeSessionIds.length === 0) return 0;
  const db = await getDb();
  const rows = await db
    .update(purchases)
    .set({ status: "refunded" })
    .where(and(inArray(purchases.stripeSessionId, stripeSessionIds), ne(purchases.status, "refunded")))
    .returning({ id: purchases.id });
  return rows.length;
}
