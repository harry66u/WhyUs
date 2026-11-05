/**
 * Cookie sessions. The cookie holds a random 256-bit token; the database stores
 * only its SHA-256 hash, so a database leak does not reveal live sessions.
 */
import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { sessions, users } from "@/lib/db/schema";
import { newToken, sha256 } from "@/lib/ids";

export type User = typeof users.$inferSelect;

const SESSION_DAYS = 30;
export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-whyus_session" : "whyus_session";

/** Create a session for `userId` and set the cookie. Call from a Route Handler or Server Action. */
export async function createSession(userId: string): Promise<void> {
  const db = await getDb();
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({ id: sha256(token), userId, expiresAt });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/** The signed-in user, or null. Safe to call from Server Components. */
export async function getCurrentUser(): Promise<User | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  const rows = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, sha256(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return rows[0]?.user ?? null;
}

/** The signed-in user; redirects to /login when there is none. */
export async function requireUser(next?: string): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  return user;
}

/** End the current session. Call from a Route Handler or Server Action. */
export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db.delete(sessions).where(eq(sessions.id, sha256(token)));
  }
  jar.delete(SESSION_COOKIE);
}

/** For Route Handlers that must return 401 instead of redirecting. */
export async function getUserOr401(): Promise<User | Response> {
  const user = await getCurrentUser();
  return user ?? Response.json({ error: "Sign in required" }, { status: 401 });
}

/** Only allow same-site relative redirect targets (prevents open redirects). */
export function safeNext(next: string | null | undefined, fallback = "/app"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
