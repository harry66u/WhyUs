import type { NextRequest } from "next/server";
import { getUserOr401 } from "@/lib/auth/session";
import { getApplication, getApplicationById } from "@/lib/data/applications";
import { getLatestRun, reconcileRun } from "@/lib/research/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/applications/:applicationId/status
 * { applicationId, status, progress, error, updatedAt, run: { id, status, startedAt, finishedAt, error } | null }
 */
export async function GET(_request: NextRequest, ctx: { params: Promise<{ applicationId: string }> }) {
  const user = await getUserOr401();
  if (user instanceof Response) return user;
  const { applicationId } = await ctx.params;
  const owned = await getApplication(user.id, applicationId);
  if (!owned) return Response.json({ error: "School not found." }, { status: 404 });
  const latest = await getLatestRun(owned.id);
  const run = latest ? await reconcileRun(latest) : null;
  // Reconciling may have just marked an interrupted run failed; read the application again if so.
  const app = run && latest && run.status !== latest.status ? ((await getApplicationById(owned.id)) ?? owned) : owned;
  return Response.json(
    {
      applicationId: app.id,
      status: app.status,
      progress: app.progress,
      error: app.error,
      updatedAt: app.updatedAt.toISOString(),
      run: run ? { id: run.id, status: run.status, startedAt: run.startedAt, finishedAt: run.finishedAt, error: run.error } : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
