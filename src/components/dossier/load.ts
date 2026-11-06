/**
 * Server-only helpers for briefing pages (owner view, shared view, PDF export).
 * Reads the shared research base, so never import this from client components.
 */
import { getFactsByIds } from "@/lib/research/corpus-store";
import type { Dossier } from "@/lib/types";

/**
 * Fill in each detail's unit scope from the shared corpus when the stored
 * dossier does not carry it (older dossiers, or an engine that leaves it out).
 * Scope is presentational: if the lookup fails, the dossier is returned as is.
 */
export async function withDetailScopes(dossier: Dossier): Promise<Dossier> {
  const missing = dossier.details.filter((d) => !Array.isArray(d.unitIds)).map((d) => d.factId);
  if (missing.length === 0) return dossier;
  let scopes: Map<string, string[]>;
  try {
    const facts = await getFactsByIds(missing);
    scopes = new Map(facts.filter((f) => f.schoolId === dossier.schoolId).map((f) => [f.id, f.unitIds ?? []]));
  } catch (err) {
    console.warn("[dossier] unit scope lookup failed", err instanceof Error ? err.message : err);
    return dossier;
  }
  if (scopes.size === 0) return dossier;
  return {
    ...dossier,
    details: dossier.details.map((d) => (Array.isArray(d.unitIds) || !scopes.has(d.factId) ? d : { ...d, unitIds: scopes.get(d.factId) })),
  };
}

/** Public origin for links the app hands out (share links). APP_URL wins when set. */
export function publicOrigin(fallback: string): string {
  const configured = process.env.APP_URL?.trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // fall through to the request origin
    }
  }
  return fallback;
}

/** Absolute share URL for a token. */
export function shareUrl(token: string, origin: string): string {
  return new URL(`/d/${encodeURIComponent(token)}`, origin).toString();
}

/** Origin of the current request from forwarded headers (for server components). */
export function originFromHeaders(h: Headers): string {
  const host = h.get("x-forwarded-host")?.split(",")[0]?.trim() || h.get("host") || "localhost:3000";
  const proto =
    h.get("x-forwarded-proto")?.split(",")[0]?.trim() || (/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}
