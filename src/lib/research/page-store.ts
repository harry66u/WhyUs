/**
 * Database-backed page cache (the `pages` table) implementing PageSource.
 * Stores normalized page text so verification and draft checks can reuse it.
 * Pages that could not be read are cached briefly so a broken host is not
 * hammered, then retried.
 */
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { pages } from "@/lib/db/schema";
import { DEFAULT_PAGE_MAX_AGE_MS, loadPageUncached, type LoadOptions, type PageSnapshot, type PageSource } from "./page-source";

const FAILED_PAGE_TTL_MS = 30 * 60 * 1000;

export class DbPageSource implements PageSource {
  private inflight = new Map<string, Promise<PageSnapshot>>();

  async load(url: string, opts: LoadOptions = {}): Promise<PageSnapshot> {
    const maxAge = opts.maxAgeMs ?? DEFAULT_PAGE_MAX_AGE_MS;
    const db = await getDb();
    const rows = await db.select().from(pages).where(eq(pages.url, url)).limit(1);
    const hit = rows[0];
    if (hit) {
      const age = Date.now() - hit.fetchedAt.getTime();
      const ttl = hit.ok ? maxAge : Math.min(maxAge, FAILED_PAGE_TTL_MS);
      if (age <= ttl) {
        return {
          url: hit.url,
          finalUrl: hit.finalUrl,
          host: hit.host,
          status: hit.status,
          ok: hit.ok,
          title: hit.title ?? "",
          text: hit.text ?? "",
          mainText: hit.text ?? "",
          links: [],
          headings: [],
          contentHash: hit.contentHash,
          fetchedAt: hit.fetchedAt.toISOString(),
          ms: 0,
          blockedReason: (hit.blockedReason ?? undefined) as PageSnapshot["blockedReason"],
          problem: hit.ok ? undefined : (hit.blockedReason ?? `HTTP ${hit.status}`),
          fromCache: true,
        };
      }
    }
    const pending = this.inflight.get(url);
    if (pending) return pending;
    const p = loadPageUncached(url, opts)
      .then(async (snap) => {
        const values = {
          url,
          finalUrl: snap.finalUrl,
          host: snap.host,
          status: snap.status,
          ok: snap.ok,
          title: snap.title || null,
          text: snap.ok ? snap.text : null,
          contentHash: snap.contentHash,
          blockedReason: snap.ok ? null : (snap.blockedReason ?? snap.problem ?? null),
          fetchedAt: new Date(snap.fetchedAt),
        };
        await db.insert(pages).values(values).onConflictDoUpdate({ target: pages.url, set: values });
        return snap;
      })
      .finally(() => this.inflight.delete(url));
    this.inflight.set(url, p);
    return p;
  }
}

let shared: DbPageSource | null = null;
export function getPageSource(): DbPageSource {
  if (!shared) shared = new DbPageSource();
  return shared;
}
