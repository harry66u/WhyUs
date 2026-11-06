import { after, type NextRequest } from "next/server";
import { getUserOr401 } from "@/lib/auth/session";
import { getApplication } from "@/lib/data/applications";
import { getRun, startResearch, waitForRun } from "@/lib/research/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Keeps the instance alive while the run executes on platforms that honor it.
export const maxDuration = 300;

/** Rejects cross-site form posts (session cookies are SameSite=Lax; this is defense in depth). */
function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const host = new URL(origin).host;
    const allowed = new Set(
      [request.headers.get("x-forwarded-host"), request.headers.get("host"), request.nextUrl.host]
        .flatMap((h) => (h ? h.split(",").map((x) => x.trim()) : []))
        .filter(Boolean),
    );
    if (process.env.APP_URL) {
      try {
        allowed.add(new URL(process.env.APP_URL).host);
      } catch {
        // ignore a malformed APP_URL
      }
    }
    return allowed.has(host);
  } catch {
    return false;
  }
}

/**
 * POST /api/research/:applicationId/start   body: { force?: boolean }
 * Starts research (or returns the run already in progress) and answers with { runId }.
 */
export async function POST(request: NextRequest, ctx: { params: Promise<{ applicationId: string }> }) {
  const user = await getUserOr401();
  if (user instanceof Response) return user;
  if (!sameOrigin(request)) return Response.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
  const { applicationId } = await ctx.params;
  const app = await getApplication(user.id, applicationId);
  if (!app) return Response.json({ error: "School not found." }, { status: 404 });

  let force = false;
  const text = await request.text().catch(() => "");
  if (text.trim()) {
    try {
      const body = JSON.parse(text) as { force?: unknown };
      force = body?.force === true;
    } catch {
      return Response.json({ error: "Send a JSON body such as {\"force\": true}, or no body." }, { status: 400 });
    }
  }

  try {
    const { runId } = await startResearch(app.id, { force });
    const run = await getRun(runId);
    after(() => waitForRun(runId));
    return Response.json(
      { runId, status: run?.status ?? "running", startedAt: run?.startedAt ?? null },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("[research] could not start research", err);
    return Response.json({ error: "Research could not be started. Try again in a moment." }, { status: 500 });
  }
}
