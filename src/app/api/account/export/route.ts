/**
 * GET /api/account/export
 *
 * "Download my data": everything WhyUs stores for the signed-in account (account,
 * student profiles, schools, dossiers, research runs, share links, purchases) as
 * a JSON file.
 */
import { getUserOr401 } from "@/lib/auth/session";
import { buildAccountExport, exportFilename } from "@/lib/billing/account-data";
import { appOrigin, jsonError } from "@/lib/billing/http";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const user = await getUserOr401();
  if (user instanceof Response) return user;
  const now = new Date();
  const data = await buildAccountExport(user.id, { origin: appOrigin(request.url), now });
  if (!data) return jsonError("This account no longer exists.", 404);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFilename(now)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
