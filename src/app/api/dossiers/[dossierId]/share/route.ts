/**
 * Share links for a dossier (owner only).
 *
 * GET    -> { url: string | null }  the active link, if any
 * POST   -> { url }                 creates a link, or returns the active one
 * DELETE -> { revoked: true }       stops sharing; old links stop working
 */
import type { NextRequest } from "next/server";
import { publicOrigin, shareUrl } from "@/components/dossier/load";
import { getUserOr401 } from "@/lib/auth/session";
import { createShareLink, getActiveShareToken, getDossier, revokeShareLinks } from "@/lib/data/dossiers";
import { json, jsonError, rejectCrossSite } from "../../_lib/http";

type Context = { params: Promise<{ dossierId: string }> };

const NOT_FOUND = "This dossier was not found in your account.";

export async function GET(request: NextRequest, { params }: Context) {
  const user = await getUserOr401();
  if (user instanceof Response) return user;
  const { dossierId } = await params;
  const dossier = await getDossier(user.id, dossierId);
  if (!dossier) return jsonError(NOT_FOUND, 404);
  const token = await getActiveShareToken(user.id, dossierId);
  return json({ url: token ? shareUrl(token, publicOrigin(request.nextUrl.origin)) : null });
}

export async function POST(request: NextRequest, { params }: Context) {
  const blocked = rejectCrossSite(request);
  if (blocked) return blocked;
  const user = await getUserOr401();
  if (user instanceof Response) return user;
  const { dossierId } = await params;
  const token = await createShareLink(user.id, dossierId);
  if (!token) return jsonError(NOT_FOUND, 404);
  return json({ url: shareUrl(token, publicOrigin(request.nextUrl.origin)) });
}

export async function DELETE(request: NextRequest, { params }: Context) {
  const blocked = rejectCrossSite(request);
  if (blocked) return blocked;
  const user = await getUserOr401();
  if (user instanceof Response) return user;
  const { dossierId } = await params;
  const dossier = await getDossier(user.id, dossierId);
  if (!dossier) return jsonError(NOT_FOUND, 404);
  await revokeShareLinks(user.id, dossierId);
  return json({ revoked: true });
}
