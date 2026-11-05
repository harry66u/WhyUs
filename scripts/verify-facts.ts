/**
 * Lint and live-verify corpus facts against the current official pages.
 *
 *   npx tsx scripts/verify-facts.ts <school-id | path/to/corpus.json> [--write] [--prune] [--only <factId>]
 *   npx tsx scripts/verify-facts.ts --all [--write] [--prune]
 *
 * --write   normalize ids and themes, stamp verifiedAt/verification, save the file
 * --prune   with --write, drop facts that failed or could not be checked
 *
 * Exit code 0 only when every fact passes lint and is verified.
 */
import fs from "node:fs";
import path from "node:path";
import { mergeThemes } from "../src/lib/matching/themes";
import { expectedFactId, lintCorpus } from "../src/lib/research/corpus-lint";
import { MemoryPageSource } from "../src/lib/research/page-source";
import { isoDate } from "../src/lib/research/term";
import { verifyFact } from "../src/lib/research/verify";
import { getSchool, listSchools } from "../src/lib/schools/registry";
import type { CorpusFile, Fact, VerificationResult } from "../src/lib/types";

const has = (n: string) => process.argv.includes(n);
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

function corpusPath(target: string): string {
  if (target.endsWith(".json")) return path.resolve(target);
  return path.resolve("data/corpus", `${target}.json`);
}

async function pool<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

async function verifyFile(file: string, source: MemoryPageSource): Promise<boolean> {
  const corpus = JSON.parse(fs.readFileSync(file, "utf8")) as CorpusFile;
  const school = getSchool(corpus.schoolId);
  if (!school) throw new Error(`${file}: unknown schoolId ${corpus.schoolId}`);
  const only = arg("--only");

  // Normalize ids and themes before linting so agents need not compute them by hand.
  for (const f of corpus.facts) {
    f.schoolId = corpus.schoolId;
    f.term = f.term || corpus.term;
    f.unitIds = f.unitIds ?? [];
    f.themes = mergeThemes(f.themes, `${f.title}\n${f.summary}\n${f.hook}\n${f.quote}`);
    f.id = expectedFactId(f);
  }

  const issues = lintCorpus(corpus, school);
  const errors = issues.filter((i) => i.severity === "error");
  for (const i of issues) console.log(`${i.severity === "error" ? "LINT-ERROR" : "lint-warn "} ${i.factId} [${i.field}] ${i.message}`);

  const targets = corpus.facts.filter((f) => !only || f.id === only);
  const results = await pool(targets, 6, async (f) => {
    const { result } = await verifyFact(f, school, source);
    return { f, result };
  });

  const counts: Record<string, number> = { verified: 0, failed: 0, unreachable: 0 };
  for (const { f, result } of results) {
    counts[result.status]++;
    const mark = result.status === "verified" ? "OK  " : result.status === "failed" ? "FAIL" : "UNRCH";
    console.log(`${mark} ${f.id}  ${f.kind}  ${f.title}${result.detail ? `  -- ${result.detail}` : ""}${result.status !== "verified" ? `\n      ${f.sourceUrl}` : ""}`);
    if (has("--write")) {
      f.verification = result as VerificationResult;
      if (result.status === "verified") f.verifiedAt = isoDate(new Date(result.checkedAt));
    }
  }

  const byKind = new Map<string, number>();
  for (const f of corpus.facts) byKind.set(f.kind, (byKind.get(f.kind) ?? 0) + 1);
  console.log(
    `\n${school.shortName}: ${corpus.facts.length} facts | verified ${counts.verified}, failed ${counts.failed}, unreachable ${counts.unreachable} | lint errors ${errors.length}`,
  );
  console.log(`by kind: ${[...byKind.entries()].map(([k, v]) => `${k} ${v}`).join(", ")}`);

  if (has("--write")) {
    if (has("--prune")) {
      const before = corpus.facts.length;
      corpus.facts = corpus.facts.filter((f) => f.verification?.status === "verified");
      console.log(`pruned ${before - corpus.facts.length} fact(s)`);
    }
    corpus.facts.sort((a, b) => a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title));
    fs.writeFileSync(file, `${JSON.stringify(corpus, null, 2)}\n`);
    console.log(`wrote ${file}`);
  }
  return errors.length === 0 && counts.failed === 0 && counts.unreachable === 0;
}

async function main() {
  const source = new MemoryPageSource();
  const targets = has("--all")
    ? listSchools().map((s) => corpusPath(s.id)).filter((p) => fs.existsSync(p))
    : process.argv.slice(2).filter((a) => !a.startsWith("--") && a !== arg("--only")).map(corpusPath);
  if (targets.length === 0) {
    console.error("usage: tsx scripts/verify-facts.ts <school-id | corpus.json> [--write] [--prune] [--only <factId>] | --all");
    process.exit(2);
  }
  let ok = true;
  for (const t of targets) ok = (await verifyFile(t, source)) && ok;
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

export type { Fact };
