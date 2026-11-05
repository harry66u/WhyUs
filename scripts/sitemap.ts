/**
 * List URLs from a site's sitemaps (found via robots.txt or /sitemap.xml).
 *
 *   npx tsx scripts/sitemap.ts <origin-or-sitemap-url> [--grep <regex>] [--max <n>]
 *
 * Useful for discovering official pages (course catalogs, department, lab,
 * center, and student-organization pages) without guessing URLs.
 */
import { fetchPage, getRobotsPolicy } from "../src/lib/research/fetcher";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function readSitemap(url: string, depth: number, out: Set<string>, max: number): Promise<void> {
  if (out.size >= max || depth > 2) return;
  const res = await fetchPage(url, { timeoutMs: 20_000, maxBytes: 20_000_000 });
  if (!res.ok || !res.body) {
    console.error(`skip ${url}: ${res.blockedReason ?? res.error ?? res.status}`);
    return;
  }
  const locs = [...res.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1].replace(/&amp;/g, "&"));
  const isIndex = /<sitemapindex/i.test(res.body);
  for (const loc of locs) {
    if (out.size >= max) break;
    if (isIndex || /sitemap[^/]*\.xml(\?|$)/i.test(loc)) await readSitemap(loc, depth + 1, out, max);
    else out.add(loc);
  }
}

async function main() {
  const target = process.argv[2];
  if (!target) {
    console.error("usage: tsx scripts/sitemap.ts <origin-or-sitemap-url> [--grep <regex>] [--max <n>]");
    process.exit(2);
  }
  const max = Number(arg("--max") ?? 20000);
  const grep = arg("--grep");
  const re = grep ? new RegExp(grep, "i") : null;
  const out = new Set<string>();
  if (/\.xml(\?|$)/i.test(target)) {
    await readSitemap(target, 0, out, max);
  } else {
    const origin = new URL(target).origin;
    const policy = await getRobotsPolicy(origin);
    const maps = policy !== "disallow-all" && policy.sitemaps.length ? policy.sitemaps : [`${origin}/sitemap.xml`];
    for (const m of maps) await readSitemap(m, 0, out, max);
  }
  let n = 0;
  for (const u of out) {
    if (re && !re.test(u)) continue;
    console.log(u);
    n++;
  }
  console.error(`${n} url(s)${re ? ` matching /${grep}/` : ""} of ${out.size}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
