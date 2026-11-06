/**
 * Cached official pages for one school, read from the shared `pages` table
 * (filled by research runs). Only pages on the school's official hosts that
 * were read successfully during the current term count. Server-only.
 */
import { and, desc, eq, gte, inArray, like, or, type SQL } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { pages } from "@/lib/db/schema";
import { termStart } from "@/lib/research/term";
import { isOfficialUrl } from "@/lib/schools/registry";
import type { School } from "@/lib/types";
import type { CachedPage } from "./page-search";

const MAX_PAGES = 400;
/** Very long pages (whole catalogs) are searched up to this many characters. */
const MAX_PAGE_CHARS = 400_000;

export async function loadCachedOfficialPages(school: School, now: Date = new Date()): Promise<CachedPage[]> {
  const hostConditions: SQL[] = [];
  for (const domain of school.officialDomains ?? []) {
    const d = domain.toLowerCase();
    hostConditions.push(eq(pages.host, d), like(pages.host, `%.${d}`));
  }
  const hosts = (school.officialHosts ?? []).flatMap((h) => {
    const bare = h.toLowerCase().replace(/^www\./, "");
    return [bare, `www.${bare}`];
  });
  if (hosts.length > 0) hostConditions.push(inArray(pages.host, hosts));
  if (hostConditions.length === 0) return [];

  const since = new Date(`${termStart(now)}T00:00:00Z`);
  const db = await getDb();
  const rows = await db
    .select({ url: pages.url, finalUrl: pages.finalUrl, title: pages.title, text: pages.text, fetchedAt: pages.fetchedAt })
    .from(pages)
    .where(and(eq(pages.ok, true), gte(pages.fetchedAt, since), or(...hostConditions)))
    .orderBy(desc(pages.fetchedAt))
    .limit(MAX_PAGES);

  return rows
    .filter((r) => r.text && isOfficialUrl(r.url, school) && isOfficialUrl(r.finalUrl, school))
    .map((r) => ({
      url: r.finalUrl || r.url,
      title: r.title ?? "",
      text: (r.text ?? "").slice(0, MAX_PAGE_CHARS),
      fetchedAt: r.fetchedAt.toISOString(),
    }));
}
