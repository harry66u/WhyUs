/**
 * POST /api/account/delete   body: { confirm: "<the account's email address>" }
 *
 * Permanently deletes the signed-in account and everything it owns (student
 * profiles, schools, research runs, dossiers, share links, purchase records),
 * ends the session, and sends the browser home to /?deleted=1.
 *
 * JSON requests get { deleted: true, redirectTo }. A plain HTML form post (no
 * JavaScript) gets a 303 redirect instead.
 */
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { destroySession, getCurrentUser } from "@/lib/auth/session";
import { confirmationMatches, DELETED_REDIRECT } from "@/lib/billing/account-data";
import { json, jsonError, readJsonBody, rejectCrossSite } from "@/lib/billing/http";
import { ACTIVE_STUDENT_COOKIE } from "@/lib/data/students";
import { deleteAccount } from "@/lib/data/users";

export const runtime = "nodejs";

function isFormPost(request: Request): boolean {
  const type = request.headers.get("content-type") ?? "";
  return type.startsWith("application/x-www-form-urlencoded") || type.startsWith("multipart/form-data");
}

function seeOther(request: Request, path: string): Response {
  return NextResponse.redirect(new URL(path, request.url), 303);
}

export async function POST(request: Request): Promise<Response> {
  const blocked = rejectCrossSite(request);
  if (blocked) return blocked;
  const form = isFormPost(request);

  const user = await getCurrentUser();
  if (!user) return form ? seeOther(request, "/login?next=%2Fapp%2Fsettings") : jsonError("Sign in required", 401);

  let typed: unknown;
  if (form) {
    const data = await request.formData().catch(() => null);
    typed = data?.get("confirm");
  } else {
    const body = await readJsonBody(request);
    if (!body.ok) return jsonError(body.error, 400);
    typed = (body.value as { confirm?: unknown } | null)?.confirm;
  }
  if (!confirmationMatches(typed, user.email)) {
    return form
      ? seeOther(request, "/app/settings?delete=mismatch#delete-account")
      : jsonError("Type your email address exactly as it appears to confirm.", 400);
  }

  try {
    await deleteAccount(user.id);
  } catch (err) {
    console.error("[account] delete failed", err);
    return form ? seeOther(request, "/app/settings?delete=failed#delete-account") : jsonError("Your account could not be deleted just now. Try again in a moment.", 500);
  }
  await destroySession();
  (await cookies()).delete(ACTIVE_STUDENT_COOKIE);
  return form ? seeOther(request, DELETED_REDIRECT) : json({ deleted: true, redirectTo: DELETED_REDIRECT });
}
