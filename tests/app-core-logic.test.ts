/**
 * App core: add-school resolution and dashboard rows.
 * Uses a fictional school (Example University, example.edu) so no fact here can
 * be mistaken for a real college's.
 */
import { describe, expect, it } from "vitest";
import { entitlementHint, summarizeApplications } from "@/app/app/_dashboard/summary";
import { formatWordLimit } from "@/app/app/schools/new/options";
import { CUSTOM_PROMPT, resolveAddSchool, toSchoolOption, unitLabel } from "@/app/app/schools/new/resolve";
import type { ApplicationRow } from "@/lib/data/applications";
import { EXAMPLE_DOSSIER } from "@/lib/fixtures/example-dossier";
import type { Entitlements, School } from "@/lib/types";

const EXAMPLE: School = {
  id: "example",
  name: "Example University",
  shortName: "Example",
  city: "Example City",
  state: "EX",
  officialDomains: ["example.edu"],
  officialHosts: [],
  units: [
    { id: "engineering", name: "School of Engineering", shortName: "Example Engineering", aliases: ["Example Engineering"], hosts: [] },
    { id: "arts", name: "College of Arts and Sciences", aliases: [], hosts: [] },
  ],
  prompts: [
    {
      id: "example-why",
      schoolId: "example",
      unitIds: [],
      cycle: "2026-27",
      kind: "why_school",
      title: "Why Example",
      text: "Which parts of Example University fit the way you want to learn?",
      wordLimit: { max: 250 },
      sourceUrl: "https://admissions.example.edu/supplement",
      verifiedAt: "2026-11-05",
    },
    {
      id: "example-eng",
      schoolId: "example",
      unitIds: ["engineering"],
      cycle: "2026-27",
      kind: "why_major",
      title: "Why Example Engineering",
      text: "How would the School of Engineering at Example shape what you build?",
      wordLimit: { min: 100, max: 300 },
      sourceUrl: "https://engineering.example.edu/apply",
      verifiedAt: "2026-11-05",
    },
  ],
  seedUrls: [],
};

const SMALL: School = {
  ...EXAMPLE,
  id: "example-college",
  name: "Example College",
  shortName: "Example College",
  units: [{ id: "college", name: "Example College", aliases: [], hosts: [] }],
  prompts: [],
};

const lookup = (id: string) => [EXAMPLE, SMALL].find((s) => s.id === id);
const values = (v: Partial<Parameters<typeof resolveAddSchool>[0]>) => ({
  schoolId: "",
  unitId: "",
  promptChoice: "",
  customPrompt: "",
  customWordLimit: "",
  ...v,
});

describe("resolveAddSchool", () => {
  it("uses the exact library prompt text and its word limit", () => {
    const r = resolveAddSchool(values({ schoolId: "example", unitId: "engineering", promptChoice: "example-eng" }), { getSchool: lookup, existing: [] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.input).toEqual({
      schoolId: "example",
      unitId: "engineering",
      promptId: "example-eng",
      promptText: "How would the School of Engineering at Example shape what you build?",
      wordLimit: 300,
    });
  });

  it("only offers prompts that apply to the chosen unit", () => {
    const r = resolveAddSchool(values({ schoolId: "example", unitId: "arts", promptChoice: "example-eng" }), { getSchool: lookup, existing: [] });
    expect(r).toMatchObject({ ok: false, errors: { promptChoice: expect.stringMatching(/does not apply/) } });
  });

  it("requires a unit when a school has several, and preselects a single one", () => {
    expect(resolveAddSchool(values({ schoolId: "example", promptChoice: "example-why" }), { getSchool: lookup, existing: [] })).toMatchObject({
      ok: false,
      errors: { unitId: expect.any(String) },
    });
    const single = resolveAddSchool(values({ schoolId: "example-college", customPrompt: "Why are you drawn to Example College in particular?" }), {
      getSchool: lookup,
      existing: [],
    });
    expect(single).toMatchObject({ ok: true, input: { unitId: "college", promptId: null, wordLimit: null } });
  });

  it("validates pasted prompts and word limits", () => {
    const short = resolveAddSchool(values({ schoolId: "example", unitId: "arts", promptChoice: CUSTOM_PROMPT, customPrompt: "Why?" }), { getSchool: lookup, existing: [] });
    expect(short).toMatchObject({ ok: false, errors: { customPrompt: expect.any(String) } });
    const badLimit = resolveAddSchool(
      values({ schoolId: "example", unitId: "arts", promptChoice: CUSTOM_PROMPT, customPrompt: "Tell us why Example is the right place for you.", customWordLimit: "lots" }),
      { getSchool: lookup, existing: [] },
    );
    expect(badLimit).toMatchObject({ ok: false, errors: { customWordLimit: expect.any(String) } });
    const ok = resolveAddSchool(
      values({ schoolId: "example", unitId: "arts", promptChoice: CUSTOM_PROMPT, customPrompt: "  Tell us why Example is the right place for you.  ", customWordLimit: "1,000 words" }),
      { getSchool: lookup, existing: [] },
    );
    expect(ok).toMatchObject({ ok: true, input: { promptText: "Tell us why Example is the right place for you.", wordLimit: 1000, promptId: null } });
  });

  it("refuses a school and unit that is already on the list", () => {
    const r = resolveAddSchool(values({ schoolId: "example", unitId: "engineering", promptChoice: "example-why" }), {
      getSchool: lookup,
      existing: [{ id: "app-1", schoolId: "example", unitId: "engineering" }],
    });
    expect(r).toMatchObject({ ok: false, duplicateOf: "app-1", errors: { form: "School of Engineering at Example University is already on this list." } });
    // A different unit of the same school is fine.
    expect(
      resolveAddSchool(values({ schoolId: "example", unitId: "arts", promptChoice: "example-why" }), {
        getSchool: lookup,
        existing: [{ id: "app-1", schoolId: "example", unitId: "engineering" }],
      }).ok,
    ).toBe(true);
  });

  it("rejects unknown schools", () => {
    expect(resolveAddSchool(values({ schoolId: "nowhere" }), { getSchool: lookup, existing: [] })).toMatchObject({ ok: false, errors: { schoolId: "Choose a school." } });
  });

  it("builds picker options with unit-specific prompts first", () => {
    const opt = toSchoolOption(EXAMPLE);
    expect(opt.units.find((u) => u.id === "engineering")?.prompts.map((p) => p.id)).toEqual(["example-eng", "example-why"]);
    expect(opt.units.find((u) => u.id === "arts")?.prompts.map((p) => p.id)).toEqual(["example-why"]);
    expect(opt.searchText).toContain("example engineering");
    expect(unitLabel(SMALL, SMALL.units[0])).toBe("Example College");
    expect(formatWordLimit({ min: 100, max: 300 })).toBe("100–300 words");
    expect(formatWordLimit(null)).toBe("No word limit");
  });
});

function app(partial: Partial<ApplicationRow>): ApplicationRow {
  return {
    id: "app",
    studentId: "student",
    schoolId: "example",
    unitId: "engineering",
    promptId: "example-eng",
    promptText: "How would the School of Engineering at Example shape what you build?",
    wordLimit: 300,
    status: "queued",
    progress: 0,
    error: null,
    createdAt: new Date("2026-11-05T15:00:00Z"),
    updatedAt: new Date("2026-11-05T15:01:00Z"),
    ...partial,
  };
}

describe("summarizeApplications", () => {
  const dossier = { ...EXAMPLE_DOSSIER, applicationId: "app-ready", generatedAt: "2026-11-05T15:02:00.000Z" };

  it("shapes each status for the dashboard", () => {
    const rows = summarizeApplications(
      [
        app({ id: "app-ready", status: "ready", progress: 100 }),
        app({ id: "app-live", unitId: "arts", promptId: null, promptText: "A long pasted prompt that goes on for a while about why this particular college fits you and your goals.", status: "researching", progress: 42 }),
        app({ id: "app-failed", unitId: "arts", status: "failed", error: "Official pages could not be reached." }),
      ],
      [dossier],
      { lookupSchool: lookup, profileUpdatedAt: new Date("2026-11-05T15:00:30Z") },
    );
    expect(rows[0]).toMatchObject({
      schoolName: "Example University",
      unitName: "School of Engineering",
      promptTitle: "Why Example Engineering",
      promptIsCustom: false,
      status: "ready",
      uniquenessScore: 74,
      leadAngle: "From a creek you instrumented yourself to a river lab that does the same work at scale.",
      href: "/app/schools/app-ready",
      profileChangedSinceResearch: false,
    });
    expect(rows[1]).toMatchObject({ status: "researching", progress: 42, href: "/app/schools/app-live/research", promptIsCustom: true, uniquenessScore: null });
    expect(rows[1].promptTitle.endsWith("…")).toBe(true);
    expect(rows[1].promptTitle.length).toBeLessThanOrEqual(91);
    expect(rows[2]).toMatchObject({ status: "failed", error: "Official pages could not be reached.", href: "/app/schools/app-failed/research" });
  });

  it("flags dossiers built before the latest profile edit", () => {
    const [row] = summarizeApplications([app({ id: "app-ready", status: "ready" })], [dossier], {
      lookupSchool: lookup,
      profileUpdatedAt: "2026-11-05T16:00:00Z",
    });
    expect(row.profileChangedSinceResearch).toBe(true);
  });
});

describe("entitlementHint", () => {
  const base: Entitlements = { remainingSchools: 0, freeSchoolAvailable: false, credits: 0, unlimitedStudentIds: [], counselorPlan: { active: false, maxStudents: 25 } };
  it("says what the account can still add", () => {
    expect(entitlementHint({ ...base, freeSchoolAvailable: true, remainingSchools: 1 }, "s").text).toBe("Your first school is free.");
    expect(entitlementHint({ ...base, credits: 2, remainingSchools: 2 }, "s").text).toBe("2 school credits left.");
    expect(entitlementHint({ ...base, unlimitedStudentIds: ["s"], remainingSchools: Infinity }, "s").text).toBe("Unlimited schools for this student.");
    expect(entitlementHint({ ...base, counselorPlan: { active: true, maxStudents: 25 } }, "s").text).toBe("Covered by your counselor plan.");
    expect(entitlementHint(base, "s")).toEqual({ text: "No school credits left.", action: { label: "See plans", href: "/pricing" } });
  });
});
