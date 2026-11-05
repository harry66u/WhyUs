/**
 * Read an official page the way WhyUs reads it.
 *
 *   npx tsx scripts/fetch-text.ts <url> [--school <id>] [--main] [--grep <regex>] [--context <n>]
 *                                [--links [regex]] [--offset <line>] [--max-lines <n>]
 *
 * Prints the HTTP status, final URL, page title, then the page text as numbered
 * lines. Copy quotes from these lines verbatim: verification checks the same text.
 */
import { getSchool, isOfficialUrl } from "../src/lib/schools/registry";
import { loadPageUncached } from "../src/lib/research/page-source";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i === -1) return undefined;
  const v = process.argv[i + 1];
  return v && !v.startsWith("--") ? v : "";
}
const has = (name: string) => process.argv.includes(name);

async function main() {
  const url = process.argv.slice(2).find((a) => /^https?:\/\//.test(a));
  if (!url) {
    console.error("usage: tsx scripts/fetch-text.ts <url> [--school <id>] [--main] [--grep <regex>] [--context <n>] [--links [regex]] [--offset <n>] [--max-lines <n>]");
    process.exit(2);
  }
  const schoolId = arg("--school");
  const school = schoolId ? getSchool(schoolId) : undefined;
  if (schoolId && !school) throw new Error(`unknown school ${schoolId}`);
  if (school && !isOfficialUrl(url, school)) {
    console.log(`NOT OFFICIAL: ${url} is not on ${school.officialDomains.join(", ")} / ${school.officialHosts.join(", ")}`);
    process.exit(1);
  }
  const page = await loadPageUncached(url, { isAllowedUrl: school ? (u) => isOfficialUrl(u, school) : undefined });
  console.log(`status: ${page.status}${page.ok ? "" : "  (NOT READABLE)"}`);
  console.log(`final:  ${page.finalUrl}`);
  console.log(`title:  ${page.title}`);
  console.log(`time:   ${page.ms}ms`);
  if (!page.ok) {
    console.log(`problem: ${page.problem}${page.blockedReason ? ` [${page.blockedReason}]` : ""}`);
    process.exit(1);
  }
  const text = has("--main") ? page.mainText : page.text;
  const lines = text.split("\n");
  console.log(`lines:  ${lines.length} (${has("--main") ? "main content" : "full page"})`);
  console.log("----");

  const linksArg = arg("--links");
  if (linksArg !== undefined) {
    const re = linksArg ? new RegExp(linksArg, "i") : null;
    for (const l of page.links) {
      if (school && !isOfficialUrl(l.href, school)) continue;
      if (re && !re.test(l.href) && !re.test(l.text)) continue;
      console.log(`${l.text || "(no text)"}  ->  ${l.href}`);
    }
    return;
  }

  const grep = arg("--grep");
  if (grep) {
    const re = new RegExp(grep, "i");
    const ctx = Number(arg("--context") ?? 1) || 0;
    const show = new Set<number>();
    lines.forEach((line, i) => {
      if (re.test(line)) for (let j = Math.max(0, i - ctx); j <= Math.min(lines.length - 1, i + ctx); j++) show.add(j);
    });
    let prev = -2;
    for (const i of [...show].sort((a, b) => a - b)) {
      if (i !== prev + 1) console.log("  ...");
      console.log(`${String(i + 1).padStart(5)}  ${lines[i]}`);
      prev = i;
    }
    if (show.size === 0) console.log("(no matching lines)");
    return;
  }

  const offset = Math.max(0, Number(arg("--offset") ?? 1) - 1);
  const max = Number(arg("--max-lines") ?? 400) || 400;
  const slice = lines.slice(offset, offset + max);
  slice.forEach((line, i) => console.log(`${String(offset + i + 1).padStart(5)}  ${line}`));
  if (offset + max < lines.length) console.log(`... ${lines.length - offset - max} more lines (use --offset ${offset + max + 1})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
