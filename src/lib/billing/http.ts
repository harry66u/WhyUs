/**
 * Request helpers for the billing and account API routes.
 */

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(data, { status, headers: { ...NO_STORE, ...headers } });
}

export function jsonError(message: string, status: number): Response {
  return json({ error: message }, status);
}

function hostOf(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value.includes("://") ? value : `http://${value}`).host.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Defense in depth for state-changing requests on top of SameSite=Lax session
 * cookies: refuse requests a browser marks as cross-site, and requests whose
 * Origin is not this app.
 */
export function rejectCrossSite(request: Request): Response | null {
  const refuse = () => jsonError("This request must come from WhyUs itself.", 403);
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return refuse();
  const origin = request.headers.get("origin");
  if (origin === null) return null;
  if (origin === "null") return refuse();
  const allowed = new Set(
    [
      hostOf(request.headers.get("host")),
      hostOf(request.headers.get("x-forwarded-host")?.split(",")[0]?.trim()),
      hostOf(process.env.APP_URL),
      hostOf(request.url),
    ].filter((h): h is string => Boolean(h)),
  );
  const from = hostOf(origin);
  return from && allowed.has(from) ? null : refuse();
}

/** The public origin for links that leave the app (Stripe redirects): APP_URL, else the request's. */
export function appOrigin(requestUrl: string): string {
  const configured = process.env.APP_URL?.trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // fall back to the request origin
    }
  }
  return new URL(requestUrl).origin;
}

const limiter = globalThis as unknown as { __whyusBillingHits?: Map<string, number[]> };

/** At most `limit` calls per `key` in `windowMs` (per server process). */
export function allowRequest(key: string, limit: number, windowMs: number, now: number = Date.now()): boolean {
  const hits: Map<string, number[]> = (limiter.__whyusBillingHits ??= new Map<string, number[]>());
  if (hits.size > 10_000) {
    for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
  }
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  const ok = recent.length < limit;
  if (ok) recent.push(now);
  hits.set(key, recent);
  return ok;
}

export type JsonBody = { ok: true; value: unknown } | { ok: false; error: string };

/** Reads a small JSON body. An empty body reads as `{}`. */
export async function readJsonBody(request: Request, maxBytes = 8 * 1024): Promise<JsonBody> {
  const text = await request.text().catch(() => null);
  if (text === null) return { ok: false, error: "The request body could not be read." };
  if (text.length > maxBytes) return { ok: false, error: "The request body is too large." };
  if (!text.trim()) return { ok: true, value: {} };
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, error: "Send a JSON body." };
  }
}
