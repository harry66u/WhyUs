/**
 * Email sign-in with one-time links.
 *
 * - Tokens are 256-bit random; only SHA-256 hashes are stored.
 * - Links expire after 20 minutes and work once (atomic "mark used").
 * - Requests are rate limited per email address and per client IP.
 */
import { and, count, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { loginTokens, users } from "@/lib/db/schema";
import { newId, newToken, sha256 } from "@/lib/ids";
import { devSignInAllowed, sendSignInEmail } from "./email";
import { safeNext } from "./session";

const TOKEN_TTL_MS = 20 * 60 * 1000;
const PER_EMAIL_LIMIT = 5; // per 15 minutes
const PER_IP_LIMIT = 20; // per 15 minutes
const WINDOW_MS = 15 * 60 * 1000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) return null;
  return email;
}

const ipHits = new Map<string, number[]>();
function ipAllowed(ip: string): boolean {
  const now = Date.now();
  const hits = (ipHits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= PER_IP_LIMIT) return false;
  hits.push(now);
  ipHits.set(ip, hits);
  return true;
}

export type SignInRequestResult =
  | { ok: true; devLink?: string }
  | { ok: false; error: "invalid_email" | "rate_limited" | "email_failed" };

export async function requestSignIn(rawEmail: string, opts: { ip?: string; next?: string | null; appUrl: string }): Promise<SignInRequestResult> {
  const email = normalizeEmail(rawEmail);
  if (!email) return { ok: false, error: "invalid_email" };
  if (opts.ip && !ipAllowed(opts.ip)) return { ok: false, error: "rate_limited" };

  const db = await getDb();
  const since = new Date(Date.now() - WINDOW_MS);
  const [{ n }] = await db
    .select({ n: count() })
    .from(loginTokens)
    .where(and(eq(loginTokens.email, email), gt(loginTokens.createdAt, since)));
  if (n >= PER_EMAIL_LIMIT) return { ok: false, error: "rate_limited" };

  const token = newToken();
  await db.insert(loginTokens).values({
    id: newId(),
    email,
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
  });

  const url = new URL("/auth/verify", opts.appUrl);
  url.searchParams.set("token", token);
  const next = safeNext(opts.next ?? null, "");
  if (next) url.searchParams.set("next", next);
  const link = url.toString();

  try {
    await sendSignInEmail(email, link);
  } catch (err) {
    console.error("[whyus] sign-in email failed", err);
    return { ok: false, error: "email_failed" };
  }
  return devSignInAllowed() ? { ok: true, devLink: link } : { ok: true };
}

/**
 * Consume a sign-in token. Returns the user id (creating the account on first
 * sign-in) or null when the link is invalid, used, or expired.
 */
export async function consumeSignIn(token: string): Promise<{ userId: string; isNew: boolean } | null> {
  if (!token || token.length < 20 || token.length > 200) return null;
  const db = await getDb();
  const used = await db
    .update(loginTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(loginTokens.tokenHash, sha256(token)), isNull(loginTokens.usedAt), gt(loginTokens.expiresAt, new Date())))
    .returning({ email: loginTokens.email });
  const email = used[0]?.email;
  if (!email) return null;

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing[0]) return { userId: existing[0].id, isNew: false };
  const id = newId();
  await db.insert(users).values({ id, email }).onConflictDoNothing();
  const again = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  return again[0] ? { userId: again[0].id, isNew: again[0].id === id } : null;
}
