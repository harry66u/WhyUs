/**
 * Term refresh for the shared research base: re-verify every fact (including
 * facts whose last check failed) against the current official pages, record
 * each result in the database, and optionally write the results back to the
 * seed corpora in data/corpus.
 *
 *   npx tsx scripts/refresh-corpus.ts                     every school
 *   npx tsx scripts/refresh-corpus.ts cornell umich       some schools
 *   npx tsx scripts/refresh-corpus.ts --write             also update data/corpus/<id>.json
 *   npx tsx scripts/refresh-corpus.ts --write --append-new
 *                                                         also add verified facts that exist only in the
 *                                                         database (for example from live crawls)
 *   --concurrency <n>                                     pages read at once (default 6)
 *
 * Uses the app database (DATABASE_URL, or the embedded database in .data/pglite;
 * stop the dev server first when using the embedded database). Pages are read
 * fresh with the polite fetcher (robots.txt, per-host limits, no bot evasion).
 * Exit code 0 when the refresh ran; the summary lists anything that failed.
 */
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "../src/lib/db/client";
import { corpusFacts } from "../src/lib/db/schema";
import { pool } from "../src/lib/research/async";
import { ensureCorpusSeeded, recordVerification, rowToFact } from "../src/lib/research/corpus-store";
import { MemoryPageSource } from "../src/lib/research/page-source";
import { currentTerm, isoDate } from "../src/lib/research/term";
import { verifyFact } from "../src/lib/research/verify";
import { getSchool, listSchools } from "../src/lib/schools/registry";
import type { CorpusFile, Fact, VerificationResult } from "../src/lib/types";

const args = process.argv.slice(2);
const has = (flag: string) => args.includes(flag);
function option(name: string): string | undefined {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
}

interface SchoolSummary {
  schoolId: string;
  total: number;
  verified: number;
  failed: number;
  unreachable: number;
  recovered: number;
  newlyFailed: number;
  wrote?: string;
}

function pad(value: string | number, width: number): string {
  return String(value).padEnd(width);
}

async function refreshSchool(schoolId: string, source: MemoryPageSource, concurrency: number): Promise<SchoolSummary> {
  const school = getSchool(schoolId);
  if (!school) throw new Error(`Unknown school: ${schoolId}`);
  const db = await getDb();
  const facts = (await db.select().from(corpusFacts).where(eq(corpusFacts.schoolId, schoolId))).map(rowToFact);
  const term = currentTerm();
  const summary: SchoolSummary = { schoolId, total: facts.length, verified: 0, failed: 0, unreachable: 0, recovered: 0, newlyFailed: 0 };
  const results = new Map<string, VerificationResult>();

  await pool(facts, concurrency, async (fact) => {
    const { result } = await verifyFact(fact, school, source);
    results.set(fact.id, result);
    await recordVerification(fact.id, result);
    if (result.status === "verified") {
      await db.update(corpusFacts).set({ term, updatedAt: new Date() }).where(eq(corpusFacts.id, fact.id));
    }
    const before = fact.verification?.status;
    summary[result.status]++;
    if (before === "failed" && result.status === "verified") summary.recovered++;
    if (before !== "failed" && result.status === "failed") summary.newlyFailed++;
    if (result.status !== "verified") {
      console.log(`  ${result.status === "failed" ? "FAIL " : "UNRCH"} ${fact.id}  ${result.detail ?? ""}\n        ${fact.sourceUrl}`);
    }
  });

  const file = path.resolve("data/corpus", `${schoolId}.json`);
  if (has("--write") && (fs.existsSync(file) || has("--append-new"))) {
    const corpus: CorpusFile = fs.existsSync(file)
      ? (JSON.parse(fs.readFileSync(file, "utf8")) as CorpusFile)
      : { schoolId, term, builtAt: isoDate(), builtBy: "refresh-corpus", facts: [] };
    const inFile = new Set(corpus.facts.map((f) => f.id));
    for (const f of corpus.facts) {
      const result = results.get(f.id);
      if (!result) continue;
      f.verification = result;
      if (result.status === "verified") {
        f.verifiedAt = isoDate(new Date(result.checkedAt));
        f.term = term;
      }
    }
    if (has("--append-new")) {
      for (const f of facts) {
        const result = results.get(f.id);
        if (inFile.has(f.id) || result?.status !== "verified") continue;
        const fresh: Fact = { ...f, term, verification: result, verifiedAt: isoDate(new Date(result.checkedAt)) };
        corpus.facts.push(fresh);
      }
    }
    if (corpus.facts.length > 0) {
      corpus.term = term;
      corpus.facts.sort((a, b) => a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title));
      fs.writeFileSync(file, `${JSON.stringify(corpus, null, 2)}\n`);
      summary.wrote = path.relative(process.cwd(), file);
    }
  }
  return summary;
}

async function main() {
  const concurrency = Math.max(1, Number(option("--concurrency") ?? 6) || 6);
  const skip = new Set([option("--concurrency")].filter(Boolean));
  const requested = args.filter((a) => !a.startsWith("--") && !skip.has(a));
  const schoolIds = requested.length ? requested : listSchools().map((s) => s.id);
  for (const id of schoolIds) if (!getSchool(id)) throw new Error(`Unknown school: ${id}`);

  await ensureCorpusSeeded();
  const source = new MemoryPageSource();
  console.log(`Term refresh for ${currentTerm()}: ${schoolIds.join(", ")}`);
  const summaries: SchoolSummary[] = [];
  for (const id of schoolIds) {
    console.log(`\n${id}`);
    summaries.push(await refreshSchool(id, source, concurrency));
  }

  console.log(`\n${pad("school", 12)}${pad("facts", 8)}${pad("verified", 10)}${pad("failed", 8)}${pad("unreachable", 13)}${pad("recovered", 11)}newly failed`);
  for (const s of summaries) {
    console.log(`${pad(s.schoolId, 12)}${pad(s.total, 8)}${pad(s.verified, 10)}${pad(s.failed, 8)}${pad(s.unreachable, 13)}${pad(s.recovered, 11)}${s.newlyFailed}`);
  }
  const total = summaries.reduce(
    (acc, s) => ({ facts: acc.facts + s.total, verified: acc.verified + s.verified, failed: acc.failed + s.failed, unreachable: acc.unreachable + s.unreachable }),
    { facts: 0, verified: 0, failed: 0, unreachable: 0 },
  );
  console.log(`\n${total.verified} of ${total.facts} facts verified; ${total.failed} failed; ${total.unreachable} could not be checked.`);
  for (const s of summaries) if (s.wrote) console.log(`wrote ${s.wrote}`);
}

main()
  .then(async () => {
    await closeDb();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(err);
    await closeDb().catch(() => {});
    process.exit(1);
  });
