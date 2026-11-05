/**
 * Fact verification: a fact counts as verified only when its source is an
 * official school page that is reachable right now AND the page's current text
 * contains both the fact's verbatim quote and its name.
 *
 * Matching is strict about words and their order; it ignores only typography
 * (see normalizeForMatch). A quote may contain "..." to join two passages from
 * the same page; each passage must be at least 12 characters and appear in order.
 */
import { isOfficialUrl } from "@/lib/schools/registry";
import type { Fact, School, VerificationResult } from "@/lib/types";
import { normalizeForMatch, quoteSegments } from "./normalize";
import type { LoadOptions, PageSnapshot, PageSource } from "./page-source";

export interface QuoteMatch {
  found: boolean;
  method?: "exact" | "segments";
  index?: number;
}

export function findQuote(pageText: string, quote: string): QuoteMatch {
  const hay = normalizeForMatch(pageText);
  const needle = normalizeForMatch(quote);
  if (!needle) return { found: false };
  const i = hay.indexOf(needle);
  if (i >= 0) return { found: true, method: "exact", index: i };
  const segments = quoteSegments(quote);
  if (segments.length > 1 && segments.every((s) => s.length >= 12)) {
    let from = 0;
    let first = -1;
    for (const s of segments) {
      const j = hay.indexOf(s, from);
      if (j < 0) return { found: false };
      if (first < 0) first = j;
      from = j + s.length;
    }
    return { found: true, method: "segments", index: first };
  }
  return { found: false };
}

export function nameAppears(pageText: string, name: string): boolean {
  const n = normalizeForMatch(name);
  if (!n) return false;
  return normalizeForMatch(pageText).includes(n);
}

export type VerifiableFact = Pick<Fact, "quote" | "nameOnPage" | "sourceUrl">;

export function verifyAgainstPage(fact: VerifiableFact, page: PageSnapshot, school: School): VerificationResult {
  const checkedAt = page.fetchedAt || new Date().toISOString();
  if (!isOfficialUrl(fact.sourceUrl, school)) {
    return { status: "failed", checkedAt, detail: "Source is not on an official school domain" };
  }
  if (!page.ok) {
    const gone = page.status === 404 || page.status === 410;
    return {
      status: gone ? "failed" : "unreachable",
      checkedAt,
      detail: gone ? `Page no longer exists (HTTP ${page.status})` : (page.problem ?? "Page could not be read"),
      finalUrl: page.finalUrl !== fact.sourceUrl ? page.finalUrl : undefined,
    };
  }
  if (!isOfficialUrl(page.finalUrl, school)) {
    return { status: "failed", checkedAt, detail: "Page redirected off the school's official domains", finalUrl: page.finalUrl };
  }
  const quote = findQuote(page.text, fact.quote);
  if (!quote.found) {
    return {
      status: "failed",
      checkedAt,
      detail: "Quoted text was not found on the current page",
      finalUrl: page.finalUrl !== fact.sourceUrl ? page.finalUrl : undefined,
    };
  }
  if (!nameAppears(page.text, fact.nameOnPage)) {
    return { status: "failed", checkedAt, detail: `Name "${fact.nameOnPage}" was not found on the current page` };
  }
  return {
    status: "verified",
    checkedAt,
    finalUrl: page.finalUrl !== fact.sourceUrl ? page.finalUrl : undefined,
  };
}

export async function verifyFact(
  fact: VerifiableFact,
  school: School,
  source: PageSource,
  opts: LoadOptions = {},
): Promise<{ result: VerificationResult; page: PageSnapshot | null }> {
  if (!isOfficialUrl(fact.sourceUrl, school)) {
    return {
      result: { status: "failed", checkedAt: new Date().toISOString(), detail: "Source is not on an official school domain" },
      page: null,
    };
  }
  const page = await source.load(fact.sourceUrl, { ...opts, isAllowedUrl: (u) => isOfficialUrl(u, school) });
  return { result: verifyAgainstPage(fact, page, school), page };
}
