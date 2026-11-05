/**
 * Structural checks for corpus facts (independent of live verification).
 */
import { factId } from "@/lib/ids";
import { isThemeKey } from "@/lib/matching/themes";
import { isOfficialUrl } from "@/lib/schools/registry";
import { FACT_KINDS, type CorpusFile, type Fact, type School } from "@/lib/types";
import { normalizeForMatch } from "./normalize";

export interface LintIssue {
  factId: string;
  field: string;
  message: string;
  severity: "error" | "warning";
}

const COMMONNESS = new Set(["common", "moderate", "rare"]);

export function expectedFactId(f: Pick<Fact, "schoolId" | "title" | "sourceUrl" | "quote">): string {
  return factId(f.schoolId, f.title, f.sourceUrl, f.quote);
}

export function lintFact(f: Fact, school: School): LintIssue[] {
  const issues: LintIssue[] = [];
  const add = (field: string, message: string, severity: "error" | "warning" = "error") =>
    issues.push({ factId: f.id || f.title || "(unnamed)", field, message, severity });

  if (f.schoolId !== school.id) add("schoolId", `expected "${school.id}"`);
  if (!FACT_KINDS.includes(f.kind)) add("kind", `unknown kind "${f.kind}"`);
  if (!f.title || f.title.length > 160) add("title", "required, at most 160 characters");
  if (!f.nameOnPage || f.nameOnPage.length > 140) add("nameOnPage", "required, at most 140 characters");
  if (!f.summary || f.summary.length < 20 || f.summary.length > 280) add("summary", "20-280 characters");
  if (!f.hook || f.hook.length < 8 || f.hook.length > 180) add("hook", "8-180 characters");
  const q = normalizeForMatch(f.quote ?? "");
  if (q.length < 25) add("quote", "verbatim quote of at least 25 characters is required");
  if (q.length > 900) add("quote", "quote longer than 900 characters; quote the key sentence(s) only", "warning");
  try {
    const u = new URL(f.sourceUrl);
    if (u.protocol !== "https:") add("sourceUrl", "must be https", "warning");
    if (u.hash) add("sourceUrl", "remove the #fragment", "warning");
  } catch {
    add("sourceUrl", "not a valid URL");
  }
  if (!isOfficialUrl(f.sourceUrl, school)) add("sourceUrl", "not on an official school domain or official host");
  if (!Array.isArray(f.themes) || f.themes.length === 0) add("themes", "at least one theme key is required");
  for (const k of f.themes ?? []) if (!isThemeKey(k)) add("themes", `unknown theme key "${k}"`);
  if (!COMMONNESS.has(f.commonness)) add("commonness", `must be common | moderate | rare`);
  const unitIds = new Set(school.units.map((u) => u.id));
  for (const u of f.unitIds ?? []) if (!unitIds.has(u)) add("unitIds", `unknown unit "${u}"`);
  if (/\b(?:I|my|me)\b/.test(f.summary ?? "")) add("summary", "write summaries in third person", "warning");
  return issues;
}

export function lintCorpus(corpus: CorpusFile, school: School): LintIssue[] {
  const issues: LintIssue[] = [];
  const seenIds = new Set<string>();
  const seenQuotes = new Map<string, string>();
  const seenTitles = new Map<string, string>();
  for (const f of corpus.facts) {
    issues.push(...lintFact(f, school));
    if (f.id && seenIds.has(f.id)) issues.push({ factId: f.id, field: "id", message: "duplicate id", severity: "error" });
    if (f.id) seenIds.add(f.id);
    const qk = `${f.sourceUrl}\n${normalizeForMatch(f.quote ?? "")}`;
    if (seenQuotes.has(qk)) issues.push({ factId: f.id, field: "quote", message: `duplicates ${seenQuotes.get(qk)}`, severity: "error" });
    seenQuotes.set(qk, f.id);
    const tk = normalizeForMatch(f.title ?? "");
    if (seenTitles.has(tk)) issues.push({ factId: f.id, field: "title", message: `same title as ${seenTitles.get(tk)}`, severity: "warning" });
    seenTitles.set(tk, f.id);
  }
  return issues;
}
