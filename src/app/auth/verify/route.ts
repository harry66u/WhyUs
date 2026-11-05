import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { consumeSignIn } from "@/lib/auth/magic-link";
import { createSession, safeNext } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const result = await consumeSignIn(token);
  if (!result) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "?error=expired";
    return NextResponse.redirect(url);
  }
  await createSession(result.userId);
  const db = await getDb();
  const [user] = await db.select({ role: users.role }).from(users).where(eq(users.id, result.userId)).limit(1);
  const dest = user?.role ? safeNext(request.nextUrl.searchParams.get("next")) : "/onboarding";
  const url = request.nextUrl.clone();
  url.pathname = dest.split("?")[0];
  url.search = dest.includes("?") ? `?${dest.split("?").slice(1).join("?")}` : "";
  return NextResponse.redirect(url);
}
