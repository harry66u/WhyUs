/**
 * Naming another college in a "Why <school>" draft is flagged even when that
 * college is not on the student's list (a copy-paste error from another essay);
 * the swap test still only compares against schools on the list.
 */
import { describe, expect, it } from "vitest";
import { seedCorpus } from "@/lib/research/corpus-data";
import { getSchool, listSchools } from "@/lib/schools/registry";
import { checkDraft, type DraftCheckDeps } from "./check";

const deps: DraftCheckDeps = {
  getSchool,
  listSchools,
  loadFacts: async (id) => seedCorpus(id)?.facts ?? [],
  loadPages: async () => [],
  now: () => new Date("2026-11-06T12:00:00Z"),
};

describe.skipIf((seedCorpus("cornell")?.facts.length ?? 0) === 0)("other schools not on the list", () => {
  it("flags another school's name and verified course in a Dartmouth draft", async () => {
    const result = await checkDraft(
      {
        text: "I want to design river sensors. Cornell's CEE 4795 course first showed me what sensor design could be.",
        schoolId: "dartmouth",
        unitId: "college",
        wordLimit: 100,
        otherSchoolIds: [],
      },
      deps,
    );
    const wrong = result.issues.filter((i) => i.type === "wrong_school");
    expect(wrong.length).toBeGreaterThan(0);
    expect(wrong.some((i) => (i.otherSchools ?? []).some((o) => o.schoolId === "cornell"))).toBe(true);
    // No swap test against schools that are not on the list.
    expect(result.issues.some((i) => i.type === "swappable")).toBe(false);
  });
});
