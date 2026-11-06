/**
 * Draft checker against fictional schools (example.edu, *.example) and
 * fictional facts. No database, no network: research bases and cached pages
 * are injected.
 */
import { describe, expect, it, vi } from "vitest";
import type { Fact, FactKind, School } from "@/lib/types";
import { checkDraft, type DraftCheckDeps, type DraftCheckInput } from "./check";
import { NEVER_REWRITES, UNVERIFIED_MESSAGE } from "./messages";
import type { CachedPage } from "./page-search";
import type { CheckedIssue } from "./present";
import { countWords } from "./text";

const NOW = new Date("2026-11-06T12:00:00Z");

const EXAMPLE: School = {
  id: "example",
  name: "Example University",
  shortName: "Example",
  city: "Exampleville",
  state: "EX",
  officialDomains: ["example.edu"],
  officialHosts: [],
  units: [
    { id: "engineering", name: "School of Engineering", shortName: "Example Engineering", aliases: ["Example Engineering"], hosts: ["engineering.example.edu"] },
    { id: "arts", name: "College of Arts and Sciences", shortName: "Arts and Sciences", aliases: ["Arts and Sciences"], hosts: [] },
  ],
  prompts: [],
  seedUrls: [],
};

const SECOND: School = {
  id: "second",
  name: "Second College",
  shortName: "Second",
  city: "Lakeport",
  state: "EX",
  officialDomains: ["second.example"],
  officialHosts: [],
  units: [
    { id: "college", name: "Second College", aliases: [], hosts: [] },
    { id: "thornbury", name: "Thornbury School of Design", shortName: "Thornbury", aliases: ["Thornbury School"], hosts: [] },
  ],
  prompts: [],
  seedUrls: [],
};

/** A school with no research base yet. */
const NORTHFIELD: School = {
  id: "northfield",
  name: "Northfield Institute",
  shortName: "Northfield",
  city: "Granite Falls",
  state: "EX",
  officialDomains: ["northfield.example"],
  officialHosts: [],
  units: [{ id: "college", name: "Northfield Institute", aliases: [], hosts: [] }],
  prompts: [],
  seedUrls: [],
};

/** Short name that is also a state name: only "at Ohio" counts as the school. */
const OHIO: School = {
  id: "ohio-example",
  name: "Ohio Example Institute",
  shortName: "Ohio",
  city: "Example Springs",
  state: "OH",
  officialDomains: ["ohio-institute.example"],
  officialHosts: [],
  units: [],
  prompts: [],
  seedUrls: [],
};

const SCHOOLS = new Map([EXAMPLE, SECOND, NORTHFIELD, OHIO].map((s) => [s.id, s]));

let counter = 0;
function fact(schoolId: string, kind: FactKind, title: string, extra: Partial<Fact> = {}): Fact {
  counter++;
  const host = schoolId === "example" ? "www.example.edu" : `www.${SCHOOLS.get(schoolId)?.officialDomains[0]}`;
  return {
    id: `${schoolId}:fact-${counter}`,
    schoolId,
    unitIds: [],
    kind,
    title,
    nameOnPage: extra.nameOnPage ?? title,
    summary: extra.summary ?? `A fictional ${kind} used in draft-check tests.`,
    hook: "is a fictional entry",
    quote: extra.quote ?? `${title} is a fictional entry used in tests.`,
    sourceUrl: extra.sourceUrl ?? `https://${host}/${kind}/${counter}`,
    sourceTitle: `${title} | Fictional`,
    themes: extra.themes ?? [],
    commonness: "rare",
    people: extra.people,
    term: "2026-fall",
    verifiedAt: extra.verifiedAt ?? "2026-10-20",
    verification: extra.verification ?? { status: "verified", checkedAt: "2026-10-20T10:00:00.000Z" },
  };
}

const ENGR41 = fact("example", "course", "ENGR 41: Watershed Systems", { nameOnPage: "ENGR 41", themes: ["water"] });
const RIVER_LAB = fact("example", "lab", "River Sensing Lab", { themes: ["water", "sensors"] });
const WHITFIELD = fact("example", "faculty", "Dana Whitfield, Professor of Civil Engineering", { nameOnPage: "Dana Whitfield", people: ["Dana Whitfield"] });
const OUTING = fact("example", "organization", "Example Outing Club", { themes: ["outdoors"] });
const HALVORSEN = fact("example", "center", "Halvorsen Center for Watershed Policy", { themes: ["water", "environmental-policy"] });
const WINTERFEST = fact("example", "tradition", "Winterfest");
const FAILED = fact("example", "lab", "Cormorant Imaging Lab", { verifiedAt: null, verification: { status: "failed", checkedAt: "2026-10-20T10:00:00.000Z" } });

const SECOND_OUTING = fact("second", "organization", "Second Outing Club", { themes: ["outdoors"] });
const HYDR210 = fact("second", "course", "HYDR 210: River Science", { nameOnPage: "HYDR 210" });
const MARLOWE = fact("second", "center", "Marlowe Institute for Coastal Studies", { themes: ["marine"] });
const RAMAN = fact("second", "faculty", "Priya Raman, Professor of Hydrology", { nameOnPage: "Priya Raman", people: ["Priya Raman"] });

const FACTS: Record<string, Fact[]> = {
  example: [ENGR41, RIVER_LAB, WHITFIELD, OUTING, HALVORSEN, WINTERFEST, FAILED],
  second: [SECOND_OUTING, HYDR210, MARLOWE, RAMAN],
  northfield: [],
  "ohio-example": [],
};

const PAGE: CachedPage = {
  url: "https://www.example.edu/research/field-stations",
  title: "Field stations | Example University",
  text: "Field stations\nStudents spend a week at the Osprey Field Station on the estuary, recording tide and salinity data.",
  fetchedAt: "2026-11-01T09:00:00.000Z",
};

function deps(overrides: Partial<DraftCheckDeps> = {}): Partial<DraftCheckDeps> {
  return {
    getSchool: (id) => SCHOOLS.get(id),
    loadFacts: async (id) => FACTS[id] ?? [],
    loadPages: async (s) => (s.id === "example" ? [PAGE] : []),
    extractClaims: undefined,
    now: () => NOW,
    ...overrides,
  };
}

const STUDENT: DraftCheckInput["student"] = {
  activities: [
    {
      id: "a1",
      title: "Creek Watch Sensor Network",
      organization: "Mill Creek Watershed Council",
      description: "Built low-cost sensors and mapped outfalls along Mill Creek.",
    },
  ],
  location: "Riverton, Ohio",
};

const DRAFT = [
  "Ever since I was young, I have been fascinated by rivers. Last summer I founded the Lincoln Robotics Club and mapped outfalls along Mill Creek.",
  "",
  "At Example, I want to take ENGR 41 and work with Professor Dana Whitfield in the River Sensing Lab. I would also join the Example Outing Club. The Osprey Field Station and the Halvorsen Center for Watershed Policy would let me keep measuring rivers. I hope to join the Heron Robotics Lab and study with Professor Whitfeld.",
  "",
  "Example University's prestigious reputation and beautiful campus make it my dream school. Example offers many opportunities that will help me grow. I also admire the Marlowe Institute for Coastal Studies and the lakefront in Lakeport. Second College's Outing Club looks fun too. I cannot wait to take HYDR 210 with Priya Raman.",
].join("\n");

const INPUT: DraftCheckInput = {
  text: DRAFT,
  schoolId: "example",
  unitId: "engineering",
  wordLimit: 120,
  otherSchoolIds: ["second", "northfield"],
  otherSchools: [
    { schoolId: "second", unitId: "college" },
    { schoolId: "northfield", unitId: null },
  ],
  student: STUDENT,
};

function find(issues: CheckedIssue[], type: CheckedIssue["type"], excerpt: string): CheckedIssue | undefined {
  return issues.find((i) => i.type === type && i.excerpt === excerpt);
}

describe("checkDraft on a fictional school", () => {
  it("counts words with the stated rule and flags the limit", async () => {
    const r = await checkDraft(INPUT, deps());
    expect(r.wordCount).toBe(countWords(DRAFT));
    expect(r.wordLimit).toBe(120);
    expect(r.withinLimit).toBe(false);
    expect(r.issues[0]).toMatchObject({ type: "word_count", severity: "problem" });
    expect(r.issues[0].message).toBe(`This draft has ${r.wordCount} words, ${r.wordCount - 120} over the 120-word limit.`);
    expect(r.checkedAt).toBe(NOW.toISOString());
    expect(r.summary.sentences).toBe(11);
  });

  it("confirms school facts against verified facts and cached official pages, with source and date", async () => {
    const { issues, summary } = await checkDraft(INPUT, deps());
    const verified = issues.filter((i) => i.type === "verified_claim");
    expect(verified.map((i) => i.excerpt)).toEqual([
      "ENGR 41",
      "Professor Dana Whitfield",
      "River Sensing Lab",
      "Example Outing Club",
      "Osprey Field Station",
      "Halvorsen Center for Watershed Policy",
    ]);
    expect(summary.verifiedClaims).toBe(6);
    expect(find(issues, "verified_claim", "ENGR 41")).toMatchObject({
      severity: "info",
      sourceUrl: ENGR41.sourceUrl,
      verifiedAt: "2026-10-20",
      matchedTitle: "ENGR 41: Watershed Systems",
      message: "Matches “ENGR 41: Watershed Systems” on an official Example page.",
    });
    expect(find(issues, "verified_claim", "Professor Dana Whitfield")?.sourceUrl).toBe(WHITFIELD.sourceUrl);
    // Not in the research base, but the exact phrase is on a cached official page.
    expect(find(issues, "verified_claim", "Osprey Field Station")).toMatchObject({
      sourceUrl: PAGE.url,
      verifiedAt: "2026-11-01",
      message: "Appears on an official Example page.",
    });
    for (const v of verified) expect(new URL(v.sourceUrl!).hostname.endsWith("example.edu")).toBe(true);
  });

  it("flags claims it cannot confirm, without proposing other wording", async () => {
    const { issues, summary } = await checkDraft(INPUT, deps());
    const unverified = issues.filter((i) => i.type === "unverified_claim");
    expect(unverified.map((i) => i.excerpt)).toEqual(["Heron Robotics Lab", "Professor Whitfeld"]);
    expect(summary.unverifiedClaims).toBe(2);
    for (const u of unverified) expect(u).toMatchObject({ severity: "warning", message: UNVERIFIED_MESSAGE });
    // A near miss points to the closest official page; it never spells out a correction.
    expect(find(issues, "unverified_claim", "Professor Whitfeld")?.sourceUrl).toBe(WHITFIELD.sourceUrl);
    expect(find(issues, "unverified_claim", "Heron Robotics Lab")?.sourceUrl).toBeUndefined();
    for (const u of unverified) expect(u.message).not.toContain("Whitfield");
  });

  it("leaves the student's own past alone", async () => {
    const { issues } = await checkDraft(INPUT, deps());
    const texts = issues.map((i) => i.excerpt ?? "");
    expect(texts).not.toContain("Lincoln Robotics Club");
    expect(texts).not.toContain("Mill Creek");
  });

  it("flags names, towns, and details that belong to another school on the list", async () => {
    const { issues } = await checkDraft(INPUT, deps());
    const wrong = issues.filter((i) => i.type === "wrong_school");
    expect(wrong.map((i) => i.excerpt)).toEqual([
      "Marlowe Institute for Coastal Studies",
      "Lakeport",
      "Second College's Outing Club",
      "HYDR 210",
      "Priya Raman",
    ]);
    for (const w of wrong) expect(w.otherSchools).toEqual([{ schoolId: "second", schoolName: "Second" }]);
    expect(find(issues, "wrong_school", "Marlowe Institute for Coastal Studies")).toMatchObject({
      severity: "problem",
      sourceUrl: MARLOWE.sourceUrl,
      message: "Matches “Marlowe Institute for Coastal Studies” at Second, another school on your list.",
    });
    expect(find(issues, "wrong_school", "Lakeport")).toMatchObject({ severity: "warning", message: "Lakeport is home to Second, another school on your list." });
    // The possessive belongs with the name, and the detail is Second's own.
    expect(find(issues, "wrong_school", "Second College's Outing Club")).toMatchObject({
      sourceUrl: SECOND_OUTING.sourceUrl,
      message: "Matches “Second Outing Club” at Second, another school on your list.",
    });
    expect(find(issues, "wrong_school", "HYDR 210")?.message).toBe("Matches “HYDR 210: River Science” at Second, another school on your list.");
    // Details of other schools are never shown as confirmed for this one.
    expect(issues.filter((i) => i.type === "verified_claim").some((i) => /second\.example/.test(i.sourceUrl ?? ""))).toBe(false);
  });

  it("runs the swap test per sentence", async () => {
    const { issues, summary } = await checkDraft(INPUT, deps());
    const swap = find(issues, "swappable", "I would also join the Example Outing Club.");
    expect(swap).toMatchObject({
      severity: "warning",
      otherSchools: [{ schoolId: "second", schoolName: "Second", equivalentTitle: "Second Outing Club" }],
      message: "Second has an equivalent, so this sentence could also go in your Second essay.",
    });
    expect(summary.swappableSentences).toBeGreaterThanOrEqual(1);
    // A school with no research base is never counted as having an equivalent.
    for (const s of issues.filter((i) => i.type === "swappable")) expect(s.otherSchools?.map((o) => o.schoolId)).not.toContain("northfield");
  });

  it("marks generic sentences and explains each in one sentence", async () => {
    const { issues, summary } = await checkDraft(INPUT, deps());
    const generic = issues.filter((i) => i.type === "generic");
    expect(generic.map((i) => [i.excerpt, i.severity])).toEqual([
      ["Ever since I was young, I have been fascinated by rivers.", "warning"],
      ["Example University's prestigious reputation and beautiful campus make it my dream school.", "warning"],
      ["Example offers many opportunities that will help me grow.", "warning"],
    ]);
    expect(summary.genericSentences).toBe(3);
    expect(generic[0].message).toBe("“Ever since I was young” is an opening many essays share.");
    expect(generic[1].message).toBe("“prestigious”, “beautiful campus”, and “dream school” are phrases admissions readers see in many essays.");
    expect(generic[2].message).toBe("Nothing here is specific to Example; any school on your list could say the same.");
    for (const g of generic) expect(g.message).not.toMatch(/[.!?]\s+\p{Lu}/u);
  });

  it("flags a stock phrase inside an otherwise specific sentence", async () => {
    const { issues } = await checkDraft({ ...INPUT, text: "I want to work in the world-renowned River Sensing Lab." }, deps());
    const phrase = issues.find((i) => i.type === "generic");
    expect(phrase).toMatchObject({ severity: "info", excerpt: "world-renowned" });
    expect(phrase?.message).toBe("“world-renowned” praises reputation, which every school on your list could claim.");
  });

  it("returns ranges into the draft that match each excerpt, in reading order", async () => {
    const { issues } = await checkDraft(INPUT, deps());
    let last = -1;
    for (const i of issues.filter((x) => x.range)) {
      const { start, end } = i.range!;
      expect(start).toBeGreaterThanOrEqual(0);
      expect(end).toBeLessThanOrEqual(DRAFT.length);
      expect(DRAFT.slice(start, end)).toBe(i.excerpt);
      expect(start).toBeGreaterThanOrEqual(last);
      last = start;
    }
  });

  it("never writes or suggests text", async () => {
    const { issues } = await checkDraft(INPUT, deps());
    const forbidden = /\b(?:try|consider|instead|replace|rewrite|rephrase|reword|you could write|for example|such as|suggest)\b/i;
    for (const i of issues) {
      expect(i.message).not.toMatch(forbidden);
      expect(i.message).not.toContain("\n");
    }
    expect(NEVER_REWRITES).toBe("WhyUs points out problems. It never rewrites your essay.");
  });

  it("is deterministic", async () => {
    const a = await checkDraft(INPUT, deps());
    const b = await checkDraft(INPUT, deps());
    expect(b).toEqual(a);
  });
});

describe("checkDraft details", () => {
  it("handles empty drafts and missing limits", async () => {
    const empty = await checkDraft({ ...INPUT, text: "  \n " }, deps());
    expect(empty).toMatchObject({ wordCount: 0, withinLimit: true, issues: [], summary: { sentences: 0, verifiedClaims: 0 } });
    const noLimit = await checkDraft({ ...INPUT, text: "I want to take ENGR 41.", wordLimit: null }, deps());
    expect(noLimit.withinLimit).toBeNull();
    expect(noLimit.issues.some((i) => i.type === "word_count")).toBe(false);
    const within = await checkDraft({ ...INPUT, text: "I want to take ENGR 41.", wordLimit: 100 }, deps());
    expect(within.withinLimit).toBe(true);
  });

  it("rejects an unknown school", async () => {
    await expect(checkDraft({ ...INPUT, schoolId: "nowhere" }, deps())).rejects.toThrow(/Unknown school/);
  });

  it("does not treat the school's own names and units as claims", async () => {
    const { issues } = await checkDraft(
      { ...INPUT, text: "I hope to study in the School of Engineering at Example University, close to Exampleville." },
      deps(),
    );
    expect(issues.filter((i) => i.type !== "generic")).toEqual([]);
  });

  it("reads possessives: the school's own names point at the school, other people's do not", async () => {
    const { issues } = await checkDraft(
      { ...INPUT, text: "Last year I joined my friend Sam's Robotics Club. I hope to see Example's Heron Imaging Lab next fall." },
      deps(),
    );
    expect(issues.map((i) => [i.type, i.excerpt])).toEqual([["unverified_claim", "Heron Imaging Lab"]]);
  });

  it("does not count facts whose last check failed", async () => {
    const { issues } = await checkDraft({ ...INPUT, text: "I would like to join the Cormorant Imaging Lab." }, deps());
    expect(issues.map((i) => [i.type, i.excerpt])).toEqual([["unverified_claim", "Cormorant Imaging Lab"]]);
  });

  it("names units and keeps similar names of other schools apart", async () => {
    const { issues } = await checkDraft(
      {
        ...INPUT,
        text: "The Thornbury School of Design studio is next door. My cousin goes to Northfield State University. Northfield has a great view.",
        otherSchoolIds: ["second", "northfield"],
        otherSchools: undefined,
      },
      deps(),
    );
    const wrong = issues.filter((i) => i.type === "wrong_school");
    expect(wrong.map((i) => [i.excerpt, i.severity, i.message])).toEqual([
      ["Thornbury School of Design", "problem", "Thornbury School of Design is part of Second, another school on your list."],
      ["Northfield", "problem", "Names Northfield, another school on your list."],
    ]);
  });

  it("only treats a state-named school as a school after “at”", async () => {
    const { issues } = await checkDraft(
      { ...INPUT, text: "I grew up in Ohio near the lake. Students at Ohio build canoes.", otherSchoolIds: ["ohio-example"], otherSchools: undefined },
      deps(),
    );
    expect(issues.filter((i) => i.type === "wrong_school").map((i) => [i.excerpt, i.severity])).toEqual([["Ohio", "warning"]]);
    expect(issues.find((i) => i.type === "wrong_school")?.range?.start).toBe("I grew up in Ohio near the lake. Students at ".length);
  });

  it("reads cached pages only when the research base does not settle a claim", async () => {
    const loadPages = vi.fn(async () => [PAGE]);
    await checkDraft({ ...INPUT, text: "I want to take ENGR 41 and join the River Sensing Lab." }, deps({ loadPages }));
    expect(loadPages).not.toHaveBeenCalled();
    await checkDraft({ ...INPUT, text: "I want to visit the Osprey Field Station." }, deps({ loadPages }));
    expect(loadPages).toHaveBeenCalledTimes(1);
  });

  it("still checks wording and other schools when a school has no research base", async () => {
    const { issues } = await checkDraft(
      { ...INPUT, text: "I hope to join the River Sensing Lab. Second College is also on my list. Example offers many opportunities that will help me grow." },
      deps({ loadFacts: async (id) => (id === "example" ? [] : (FACTS[id] ?? [])), loadPages: async () => [] }),
    );
    expect(issues.map((i) => [i.type, i.excerpt])).toEqual([
      ["unverified_claim", "River Sensing Lab"],
      ["wrong_school", "Second College"],
      ["generic", "Example offers many opportunities that will help me grow."],
    ]);
  });

  it("uses extra spans from the optional extractor only when they appear verbatim", async () => {
    const extractClaims = vi.fn(async () => [
      { text: "Winterfest", kind: "other" as const },
      { text: "An Invented Program That Is Not In The Draft", kind: "program" as const },
      { text: "ENGR 41", kind: "course" as const },
    ]);
    const { issues } = await checkDraft({ ...INPUT, text: "I cannot wait for Winterfest and for ENGR 41." }, deps({ extractClaims }));
    expect(extractClaims).toHaveBeenCalledWith("I cannot wait for Winterfest and for ENGR 41.", { schoolName: "Example University" });
    expect(issues.map((i) => [i.type, i.excerpt])).toEqual([
      ["verified_claim", "Winterfest"],
      ["verified_claim", "ENGR 41"],
    ]);
  });

  it("falls back to the patterns when the extractor fails", async () => {
    const extractClaims = vi.fn(async () => {
      throw new Error("timeout");
    });
    const { issues } = await checkDraft({ ...INPUT, text: "I want to take ENGR 41." }, deps({ extractClaims }));
    expect(issues.filter((i) => i.type === "verified_claim").map((i) => i.excerpt)).toEqual(["ENGR 41"]);
    const throwsAtOnce = (() => {
      throw new Error("misconfigured");
    }) as unknown as DraftCheckDeps["extractClaims"];
    const again = await checkDraft({ ...INPUT, text: "I want to take ENGR 41." }, deps({ extractClaims: throwsAtOnce }));
    expect(again.issues.filter((i) => i.type === "verified_claim").map((i) => i.excerpt)).toEqual(["ENGR 41"]);
  });
});
