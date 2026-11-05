/**
 * The shared school research base (reusable across students).
 *
 * Seed corpora from /data are loaded into the corpus_facts table on first use.
 * Research runs read facts from here, re-verify the ones they use, and record
 * the result, so later students get fresh verification dates for free.
 */
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { corpusFacts } from "@/lib/db/schema";
import type { Fact, VerificationResult } from "@/lib/types";
import { seedCorpora } from "./corpus-data";
import { isoDate } from "./term";

type Row = typeof corpusFacts.$inferSelect;

export function rowToFact(r: Row): Fact {
  return {
    id: r.id,
    schoolId: r.schoolId,
    unitIds: r.unitIds ?? [],
    kind: r.kind,
    title: r.title,
    nameOnPage: r.nameOnPage,
    summary: r.summary,
    hook: r.hook,
    quote: r.quote,
    sourceUrl: r.sourceUrl,
    sourceTitle: r.sourceTitle,
    themes: r.themes ?? [],
    commonness: r.commonness,
    commonnessReason: r.commonnessReason ?? undefined,
    people: r.people ?? undefined,
    term: r.term,
    verifiedAt: r.verifiedAt,
    verification: r.verification ?? undefined,
  };
}

function factToRow(f: Fact, builtBy: string): typeof corpusFacts.$inferInsert {
  return {
    id: f.id,
    schoolId: f.schoolId,
    term: f.term,
    unitIds: f.unitIds ?? [],
    kind: f.kind,
    title: f.title,
    nameOnPage: f.nameOnPage,
    summary: f.summary,
    hook: f.hook,
    quote: f.quote,
    sourceUrl: f.sourceUrl,
    sourceTitle: f.sourceTitle,
    themes: f.themes ?? [],
    commonness: f.commonness,
    commonnessReason: f.commonnessReason ?? null,
    people: f.people ?? null,
    verifiedAt: f.verifiedAt,
    verification: f.verification ?? null,
    builtBy,
  };
}

const globalSeed = globalThis as unknown as { __whyusSeeded?: Promise<void> };

/** Insert bundled seed facts that are not in the database yet. Idempotent. */
export function ensureCorpusSeeded(): Promise<void> {
  if (!globalSeed.__whyusSeeded) {
    globalSeed.__whyusSeeded = (async () => {
      const db = await getDb();
      for (const corpus of seedCorpora()) {
        if (!corpus.facts?.length) continue;
        const ids = corpus.facts.map((f) => f.id);
        const existing = new Set(
          (await db.select({ id: corpusFacts.id }).from(corpusFacts).where(inArray(corpusFacts.id, ids))).map((r) => r.id),
        );
        const fresh = corpus.facts.filter((f) => f.id && !existing.has(f.id) && f.verification?.status !== "failed");
        for (let i = 0; i < fresh.length; i += 200) {
          await db.insert(corpusFacts).values(fresh.slice(i, i + 200).map((f) => factToRow(f, corpus.builtBy || "seed"))).onConflictDoNothing();
        }
      }
    })().catch((err) => {
      globalSeed.__whyusSeeded = undefined;
      throw err;
    });
  }
  return globalSeed.__whyusSeeded;
}

/**
 * Facts for a school. Excludes facts whose last check failed. When `unitId` is
 * given, returns facts for that unit plus university-wide facts.
 */
export async function getSchoolFacts(schoolId: string, opts: { unitId?: string | null } = {}): Promise<Fact[]> {
  await ensureCorpusSeeded();
  const db = await getDb();
  const rows = await db.select().from(corpusFacts).where(eq(corpusFacts.schoolId, schoolId));
  return rows
    .map(rowToFact)
    .filter((f) => f.verification?.status !== "failed")
    .filter((f) => !opts.unitId || f.unitIds.length === 0 || f.unitIds.includes(opts.unitId));
}

export async function getFactsByIds(ids: string[]): Promise<Fact[]> {
  if (ids.length === 0) return [];
  await ensureCorpusSeeded();
  const db = await getDb();
  return (await db.select().from(corpusFacts).where(inArray(corpusFacts.id, ids))).map(rowToFact);
}

/** Add or replace facts (e.g. from a live crawl). */
export async function upsertFacts(facts: Fact[], builtBy: string): Promise<void> {
  if (facts.length === 0) return;
  const db = await getDb();
  for (const f of facts) {
    const row = factToRow(f, builtBy);
    await db
      .insert(corpusFacts)
      .values(row)
      .onConflictDoUpdate({ target: corpusFacts.id, set: { ...row, updatedAt: new Date() } });
  }
}

/** Store the outcome of a live verification. Verified facts get today's date. */
export async function recordVerification(factId: string, result: VerificationResult): Promise<void> {
  const db = await getDb();
  await db
    .update(corpusFacts)
    .set({
      verification: result,
      ...(result.status === "verified" ? { verifiedAt: isoDate(new Date(result.checkedAt)) } : {}),
      updatedAt: new Date(),
    })
    .where(eq(corpusFacts.id, factId));
}

export async function countFacts(schoolId: string): Promise<number> {
  await ensureCorpusSeeded();
  const db = await getDb();
  const rows = await db.select({ id: corpusFacts.id }).from(corpusFacts).where(and(eq(corpusFacts.schoolId, schoolId)));
  return rows.length;
}
