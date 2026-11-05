import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { loginTokens, users } from "@/lib/db/schema";
import type { AccountRole } from "@/lib/types";

export async function setUserRole(userId: string, role: AccountRole, name?: string | null): Promise<void> {
  const db = await getDb();
  await db
    .update(users)
    .set({ role, ...(name !== undefined ? { name } : {}), updatedAt: new Date() })
    .where(eq(users.id, userId));
}

export async function setUserName(userId: string, name: string | null): Promise<void> {
  const db = await getDb();
  await db.update(users).set({ name, updatedAt: new Date() }).where(eq(users.id, userId));
}

/**
 * Permanently delete an account and everything that belongs to it: sessions,
 * student profiles, applications, research runs and events, dossiers, share
 * links, and purchase records (all cascade from the user row). Shared school
 * research (corpus facts, cached official pages) contains no student data and
 * is kept.
 */
export async function deleteAccount(userId: string): Promise<void> {
  const db = await getDb();
  const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  await db.delete(users).where(eq(users.id, userId));
  // Sign-in tokens are keyed by email address, not user id.
  if (user) await db.delete(loginTokens).where(eq(loginTokens.email, user.email));
}
