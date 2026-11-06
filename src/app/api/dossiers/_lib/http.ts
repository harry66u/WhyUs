/**
 * Request helpers for the dossier API (share links and PDF export).
 */

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: NO_STORE });
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
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") {
    return jsonError("This request must come from WhyUs itself.", 403);
  }
  const origin = request.headers.get("origin");
  if (origin && origin !== "null") {
    const allowed = new Set(
      [
        hostOf(request.headers.get("host")),
        hostOf(request.headers.get("x-forwarded-host")?.split(",")[0]?.trim()),
        hostOf(process.env.APP_URL),
        hostOf(request.url),
      ].filter((h): h is string => Boolean(h)),
    );
    const from = hostOf(origin);
    if (!from || !allowed.has(from)) return jsonError("This request must come from WhyUs itself.", 403);
  } else if (origin === "null") {
    return jsonError("This request must come from WhyUs itself.", 403);
  }
  return null;
}
