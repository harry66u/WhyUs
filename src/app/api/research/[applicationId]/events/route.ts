import type { NextRequest } from "next/server";
import { getUserOr401 } from "@/lib/auth/session";
import { getApplication } from "@/lib/data/applications";
import { subscribeToRun } from "@/lib/research/events";
import { getLatestRun, getRun, getRunEvents, reconcileRun } from "@/lib/research/runner";
import { createResearchEventStream, parseReplayCursor, SSE_HEADERS } from "@/lib/research/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/research/:applicationId/events?run=<runId>&after=<seq>
 * Server-sent events for a research run (the latest run when `run` is omitted).
 * Replays stored events after `after` or Last-Event-ID, then streams new ones
 * until the run ends.
 */
export async function GET(request: NextRequest, ctx: { params: Promise<{ applicationId: string }> }) {
  const user = await getUserOr401();
  if (user instanceof Response) return user;
  const { applicationId } = await ctx.params;
  const app = await getApplication(user.id, applicationId);
  if (!app) return Response.json({ error: "School not found." }, { status: 404 });

  const runParam = request.nextUrl.searchParams.get("run");
  const found = runParam ? await getRun(runParam) : await getLatestRun(app.id);
  if (!found || found.applicationId !== app.id) {
    return Response.json({ error: "No research run found for this school." }, { status: 404 });
  }
  const run = await reconcileRun(found);

  const after = parseReplayCursor(request.nextUrl.searchParams.get("after"), request.headers.get("last-event-id"));
  const stream = createResearchEventStream({
    runId: run.id,
    after,
    loadEvents: getRunEvents,
    loadRun: async (id) => {
      const current = await getRun(id);
      return current
        ? { id: current.id, status: current.status, startedAt: current.startedAt, finishedAt: current.finishedAt, error: current.error }
        : null;
    },
    subscribe: subscribeToRun,
    signal: request.signal,
  });
  return new Response(stream, { headers: SSE_HEADERS });
}
