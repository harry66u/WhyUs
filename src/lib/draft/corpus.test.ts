/**
 * Draft checker against the real seed corpora in /data/corpus (verified,
 * official-source facts). Every school detail in these drafts is taken from
 * the corpus itself, so the drafts state nothing that is not in the data.
 * Schools whose corpus is still empty are skipped. No database, no network.
 */
import { describe, expect, it } from "vitest";
import { isVerifiedFact } from "@/lib/matching/swap";
import { seedCorpus } from "@/lib/research/corpus-data";
import { getSchool, isOfficialUrl, listSchools } from "@/lib/schools/registry";
import type { Fact, School } from "@/lib/types";
import { checkDraft, type DraftCheckDeps } from "./check";
import { buildFactIndex } from "./facts-index";

const NOW = new Date("2026-11-06T12:00:00Z");
const CODE = /^([A-Z]{2,8}(?:&[A-Z]{1,3})?)[  -]?(\d{1,4}[A-Z]?(?:\.\d{1,3})?)\b/;

function factsOf(id: string): Fact[] {
  return (seedCorpus(id)?.facts ?? []).filter(isVerifiedFact);
}

const deps: Partial<DraftCheckDeps> = {
  getSchool,
  loadFacts: async (id) => factsOf(id),
  loadPages: async () => [],
  extractClaims: undefined,
  now: () => NOW,
};

const withCorpus = listSchools().filter((s) => factsOf(s.id).length > 0);

/** A course from the corpus with a code in its title, and a capitalized multi-word name the draft can use. */
function samples(school: School) {
  const facts = factsOf(school.id).sort((a, b) => a.id.localeCompare(b.id));
  const course = facts.find((f) => f.kind === "course" && CODE.test(f.title));
  const index = buildFactIndex(school, facts);
  const named = index.entries.find(
    (e) =>
      e.kind === "name" &&
      !e.exactCase &&
      !e.claimOnly &&
      ["lab", "center", "organization", "facility"].includes(e.fact.kind) &&
      e.display.split(/\s+/).length >= 2 &&
      e.display.split(/\s+/).every((w) => /^[\p{Lu}\p{N}]/u.test(w) || ["of", "for", "and", "the", "at", "in", "on"].includes(w)) &&
      !/^the\s/i.test(e.display),
  );
  return { course, named, facts };
}

describe("draft check with the real corpora", () => {
  it.skipIf(withCorpus.length === 0)("has at least one researched school to check against", () => {
    expect(withCorpus.length).toBeGreaterThan(0);
  });

  for (const school of withCorpus) {
    it(`confirms ${school.shortName} details from the corpus and cites their official pages`, async () => {
      const { course, named, facts } = samples(school);
      const urls = new Set(facts.map((f) => f.sourceUrl));
      const other = withCorpus.find((s) => s.id !== school.id) ?? listSchools().find((s) => s.id !== school.id)!;
      const code = course ? `${CODE.exec(course.title)![1]} ${CODE.exec(course.title)![2]}` : null;
      const sentences = [
        code ? `At ${school.shortName}, I want to take ${code}.` : null,
        named ? `I hope to join the ${named.display} next fall.` : null,
        `${school.shortName} offers many opportunities that will help me grow.`,
        `I also applied to ${other.name}.`,
      ].filter(Boolean);
      const text = sentences.join(" ");
      const result = await checkDraft(
        { text, schoolId: school.id, unitId: null, wordLimit: 250, otherSchoolIds: [other.id] },
        deps,
      );

      const verified = result.issues.filter((i) => i.type === "verified_claim");
      for (const v of verified) {
        expect(urls.has(v.sourceUrl!)).toBe(true);
        expect(isOfficialUrl(v.sourceUrl!, school)).toBe(true);
        expect(v.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
      if (code) expect(verified.map((v) => v.excerpt)).toContain(code);
      if (named) expect(verified.map((v) => v.excerpt)).toContain(named.display);

      expect(result.issues.some((i) => i.type === "unverified_claim")).toBe(false);
      expect(result.issues.find((i) => i.type === "wrong_school" && i.excerpt === other.name)?.otherSchools?.[0]?.schoolId).toBe(other.id);
      expect(result.issues.find((i) => i.type === "generic")?.excerpt).toBe(`${school.shortName} offers many opportunities that will help me grow.`);
      expect(result.withinLimit).toBe(true);
    });
  }

  it.skipIf(withCorpus.length < 2)("recognizes another school's distinctive detail as belonging to that school", async () => {
    const [a, b] = withCorpus;
    const hereIndex = buildFactIndex(a, factsOf(a.id));
    const entry = buildFactIndex(b, factsOf(b.id)).entries.find(
      (e) =>
        e.kind === "name" &&
        e.distinctive &&
        e.display.split(/\s+/).length >= 2 &&
        e.display.split(/\s+/).every((w) => /^[\p{Lu}\p{N}]/u.test(w) || ["of", "for", "and", "at", "in", "on"].includes(w)) &&
        !/^the\s/i.test(e.display) &&
        !hereIndex.byKey.has(e.key),
    );
    expect(entry).toBeDefined();
    const text = `I would love to spend time with the ${entry!.display} during my first year.`;
    const result = await checkDraft({ text, schoolId: a.id, unitId: null, wordLimit: null, otherSchoolIds: [b.id] }, deps);
    const wrong = result.issues.find((i) => i.type === "wrong_school");
    expect(wrong?.otherSchools?.[0]?.schoolId).toBe(b.id);
    expect(wrong?.excerpt).toContain(entry!.display.replace(/^(?:the|a|an)\s+/i, ""));
    expect(result.issues.some((i) => i.type === "verified_claim")).toBe(false);
  });
});
