/**
 * Activity parsing. All samples are fictional (example names), written for these tests.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestPdf } from "../../../tests/helpers/make-test-pdf";
import type { Activity } from "@/lib/types";

vi.mock("@/lib/llm/client", () => ({
  llmAvailable: vi.fn(() => false),
  generateStructured: vi.fn(),
}));

import { generateStructured, llmAvailable } from "@/lib/llm/client";
import { createGroundingIndex } from "./grounding";
import { extractPdfText, groundLlmActivities, parseActivitiesText, PdfTextError, removeRepeatedPageLines } from "./parse";
import { detectFormat, parseActivitiesDeterministic, splitRoleOrg } from "./parse-text";

const LABELED = `Activities

Activity 1
Activity type: Environmental
Position/Leadership description: Founder and lead engineer
Organization Name: Example Creek Monitors
Please describe this activity, including what you accomplished and any recognition you received, etc.: Built 6 solar-powered sensors that log stream temperature and turbidity; data shared with the county parks office.
Participation grade levels: 10, 11, 12
Timing of participation: During school year, During school break
Hours spent per week: 5
Weeks spent per year: 40
I intend to participate in a similar activity in college.: Yes

Activity 2
Activity type: Debate/Speech
Position/Leadership description: Captain
Organization Name: Example High School Forensics
Please describe this activity, including what you accomplished and any recognition you received, etc.: Lead a 24-member team; state semifinalist in public forum; run weekly research drills for novices.
Participation grade levels: 9, 10, 11, 12
Timing of participation: During school year
Hours spent per week: 8
Weeks spent per year: 30
I intend to participate in a similar activity in college.: No
`;

/** Labels on their own lines and a label that wraps, as text often comes out of a PDF. */
const LABELED_PDF_LAYOUT = `Activity type
Music: Instrumental
Position/Leadership
description
Section leader, trumpet
Organization Name
Example Youth Jazz Orchestra
Please describe this activity, including what you accomplished and any
recognition you received, etc.
Lead the brass section of a 20-piece big band; arrange two charts each season
for our spring concert.
Participation grade levels
9, 10, 11, 12
Timing of participation
During school year
Hours spent per week
6
Weeks spent per year
36
I intend to participate in a similar activity in college.
Yes
Activity type
Family Responsibilities
Position/Leadership description
Caregiver
Organization Name
Family
Please describe this activity, including what you accomplished and any recognition you received, etc.
Care for two younger siblings after school three days a week, including homework help and dinner.
Participation grade levels
11, 12
Hours spent per week
10
Weeks spent per year
48
`;

const NUMBERED = `Activities

1. Science/Math
Founder, Example Math Circle
Started a weekly problem-solving circle for middle school students at the public library; 14 regulars.
Grades: 10, 11, 12
Timing: During school year
4 hr/wk, 30 wk/yr

2. Work (Paid)
Line cook, Example Diner
Prep and line work on weekend shifts; trained two new hires.
Grades: 11, 12
Timing: All year
12 hr/wk, 50 wk/yr

3 Athletics: JV/Varsity
Varsity rower, Example Rowing Club
Stroke seat in the varsity eight.
Grades: 9, 10, 11, 12 | 15 hr/wk, 35 wk/yr
`;

const RESUME = `ALEX EXAMPLE
alex@example.com | (555) 010-0199

EDUCATION
Example High School, Class of 2027
GPA 3.9

LEADERSHIP & ACTIVITIES
Founder & Lead Engineer, Example Creek Monitors          Sept 2023 – Present
• Built 6 solar-powered sensors that log stream temperature and turbidity
• Publish an open data dashboard used by the county parks office
Captain, Example High School Forensics                   2022 – Present
• Lead a 24-member team; state semifinalist in public forum

WORK EXPERIENCE
Example Diner — Line Cook                                 Summer 2025
• Prep and line work on weekend shifts

SKILLS
Python, CAD, Spanish (fluent)
`;

const LIST = `Example Robotics Team - Programming lead
Wrote the vision code for our competition robot and taught Python to six new members.

Community garden volunteer
Weekly volunteer at the Example Street garden; built raised beds with neighbors.

Piano
`;

/** Every text field of every activity must be found in the source. */
function expectGrounded(source: string, activities: Activity[]) {
  const index = createGroundingIndex(source);
  for (const a of activities) {
    expect(index.contains(a.title), `title "${a.title}"`).toBe(true);
    if (a.role) expect(index.contains(a.role), `role "${a.role}"`).toBe(true);
    if (a.organization) expect(index.contains(a.organization), `organization "${a.organization}"`).toBe(true);
    if (a.description) expect(index.containsDescription(a.description), `description "${a.description}"`).toBe(true);
  }
}

describe("deterministic parser: Common App labels", () => {
  it("reads every field of the labeled layout", () => {
    const r = parseActivitiesDeterministic(LABELED);
    expect(r.format).toBe("commonapp");
    expect(r.confident).toBe(true);
    expect(r.activities).toHaveLength(2);
    const [creek, debate] = r.activities;
    expect(creek).toMatchObject({
      title: "Example Creek Monitors",
      role: "Founder and lead engineer",
      organization: "Example Creek Monitors",
      category: "Environmental",
      description: "Built 6 solar-powered sensors that log stream temperature and turbidity; data shared with the county parks office.",
      grades: "10, 11, 12",
      hoursPerWeek: 5,
      weeksPerYear: 40,
    });
    expect(debate).toMatchObject({
      title: "Example High School Forensics",
      role: "Captain",
      category: "Debate/Speech",
      grades: "9, 10, 11, 12",
      hoursPerWeek: 8,
      weeksPerYear: 30,
    });
    expect(debate.description).toBe("Lead a 24-member team; state semifinalist in public forum; run weekly research drills for novices.");
    expectGrounded(LABELED, r.activities);
  });

  it("reads labels on their own lines, wrapped labels, and multi-line descriptions", () => {
    const r = parseActivitiesDeterministic(LABELED_PDF_LAYOUT);
    expect(r.format).toBe("commonapp");
    expect(r.activities).toHaveLength(2);
    const [jazz, family] = r.activities;
    expect(jazz).toMatchObject({
      title: "Example Youth Jazz Orchestra",
      role: "Section leader, trumpet",
      category: "Music: Instrumental",
      description: "Lead the brass section of a 20-piece big band; arrange two charts each season for our spring concert.",
      grades: "9, 10, 11, 12",
      hoursPerWeek: 6,
      weeksPerYear: 36,
    });
    expect(family).toMatchObject({
      title: "Family",
      role: "Caregiver",
      category: "Family Responsibilities",
      description: "Care for two younger siblings after school three days a week, including homework help and dinner.",
      grades: "11, 12",
      hoursPerWeek: 10,
      weeksPerYear: 48,
    });
    expectGrounded(LABELED_PDF_LAYOUT, r.activities);
  });

  it("splits fields that a PDF ran together on one line", () => {
    const text =
      "Activity type: Research Position/Leadership description: Student researcher Organization Name: Example Soil Lab\n" +
      "Please describe this activity, including what you accomplished and any recognition you received, etc.: Ran 40 soil pH tests for a county survey.\n" +
      "Participation grade levels: 11 Timing of participation: During school break Hours spent per week: 20 Weeks spent per year: 6";
    const r = parseActivitiesDeterministic(text);
    expect(r.activities).toHaveLength(1);
    expect(r.activities[0]).toMatchObject({
      title: "Example Soil Lab",
      role: "Student researcher",
      category: "Research",
      description: "Ran 40 soil pH tests for a county survey.",
      grades: "11",
      hoursPerWeek: 20,
      weeksPerYear: 6,
    });
  });
});

describe("deterministic parser: numbered printed layout", () => {
  it("reads type, position and organization, description, grades, and hours", () => {
    const r = parseActivitiesDeterministic(NUMBERED);
    expect(r.format).toBe("commonapp-numbered");
    expect(r.activities).toHaveLength(3);
    expect(r.activities[0]).toMatchObject({
      title: "Example Math Circle",
      role: "Founder",
      category: "Science/Math",
      description: "Started a weekly problem-solving circle for middle school students at the public library; 14 regulars.",
      grades: "10, 11, 12",
      hoursPerWeek: 4,
      weeksPerYear: 30,
    });
    expect(r.activities[1]).toMatchObject({
      title: "Example Diner",
      role: "Line cook",
      category: "Work (Paid)",
      hoursPerWeek: 12,
      weeksPerYear: 50,
      grades: "11, 12",
    });
    expect(r.activities[2]).toMatchObject({
      title: "Example Rowing Club",
      role: "Varsity rower",
      category: "Athletics: JV/Varsity",
      description: "Stroke seat in the varsity eight.",
      grades: "9, 10, 11, 12",
      hoursPerWeek: 15,
      weeksPerYear: 35,
    });
    expectGrounded(NUMBERED, r.activities);
  });
});

describe("deterministic parser: resumes and lists", () => {
  it("keeps activity sections, joins bullets, and skips education, skills, and contact details", () => {
    const r = parseActivitiesDeterministic(RESUME);
    expect(r.format).toBe("resume");
    expect(r.confident).toBe(false);
    expect(r.activities.map((a) => a.title)).toEqual(["Example Creek Monitors", "Example High School Forensics", "Example Diner"]);
    expect(r.activities[0]).toMatchObject({
      role: "Founder & Lead Engineer",
      description: "Built 6 solar-powered sensors that log stream temperature and turbidity; Publish an open data dashboard used by the county parks office",
    });
    expect(r.activities[1]).toMatchObject({ role: "Captain", description: "Lead a 24-member team; state semifinalist in public forum" });
    expect(r.activities[2]).toMatchObject({ role: "Line Cook", description: "Prep and line work on weekend shifts" });
    expect(r.warnings.join(" ")).toMatch(/skipped/);
    expectGrounded(RESUME, r.activities);
  });

  it("reads a plain list of paragraphs and single lines", () => {
    const r = parseActivitiesDeterministic(LIST);
    expect(r.format).toBe("list");
    expect(r.activities).toHaveLength(3);
    expect(r.activities[0]).toMatchObject({
      title: "Example Robotics Team",
      role: "Programming lead",
      description: "Wrote the vision code for our competition robot and taught Python to six new members.",
    });
    expect(r.activities[1].title).toBe("Community garden volunteer");
    expect(r.activities[2]).toMatchObject({ title: "Piano", description: "" });
    expect(r.warnings).toContain("One activity has no description yet.");
    expectGrounded(LIST, r.activities);
  });

  it("gives stable ids, so importing the same text twice yields the same activities", () => {
    const a = parseActivitiesDeterministic(LABELED).activities.map((x) => x.id);
    const b = parseActivitiesDeterministic(LABELED).activities.map((x) => x.id);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(a.length);
  });

  it("returns nothing (and says so) for text without activities", () => {
    const r = parseActivitiesDeterministic("   \n\n");
    expect(r.activities).toEqual([]);
    expect(r.warnings[0]).toMatch(/No activities were found/);
  });

  it("splits role and organization by role words, either order", () => {
    expect(splitRoleOrg("Founder, Example Creek Monitors")).toMatchObject({ role: "Founder", organization: "Example Creek Monitors" });
    expect(splitRoleOrg("Example Jazz Ensemble | Lead trumpet")).toMatchObject({ role: "Lead trumpet", organization: "Example Jazz Ensemble" });
    expect(splitRoleOrg("Intern at Example Water District")).toMatchObject({ role: "Intern", organization: "Example Water District" });
    expect(splitRoleOrg("Example Choir (Section leader)")).toMatchObject({ role: "Section leader", organization: "Example Choir" });
    expect(splitRoleOrg("Example Creek Monitors, Lakeview")).toEqual({ title: "Example Creek Monitors, Lakeview" });
  });

  it("detects formats", () => {
    expect(detectFormat(LABELED)).toBe("commonapp");
    expect(detectFormat(NUMBERED)).toBe("commonapp-numbered");
    expect(detectFormat(RESUME)).toBe("resume");
    expect(detectFormat(LIST)).toBe("list");
  });

  it("handles very long input without stalling", () => {
    const big = `${"Debate team captain; ".repeat(4000)}\n${LABELED}`;
    const started = Date.now();
    const r = parseActivitiesDeterministic(big);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(r.activities.length).toBeGreaterThan(0);
  });
});

describe("parseActivitiesText with Claude", () => {
  const mockedAvailable = vi.mocked(llmAvailable);
  const mockedGenerate = vi.mocked(generateStructured);

  beforeEach(() => {
    mockedAvailable.mockReset();
    mockedGenerate.mockReset();
  });

  it("uses the deterministic parser without an API key", async () => {
    mockedAvailable.mockReturnValue(false);
    const r = await parseActivitiesText(RESUME);
    expect(r.engine).toBe("deterministic");
    expect(mockedGenerate).not.toHaveBeenCalled();
    expect(r.activities).toHaveLength(3);
  });

  it("does not call Claude for a cleanly parsed Common App list", async () => {
    mockedAvailable.mockReturnValue(true);
    const r = await parseActivitiesText(LABELED);
    expect(r.engine).toBe("deterministic");
    expect(mockedGenerate).not.toHaveBeenCalled();
  });

  it("keeps only activities whose text is in the source", async () => {
    mockedAvailable.mockReturnValue(true);
    mockedGenerate.mockResolvedValue({
      activities: [
        {
          title: "Example Creek Monitors",
          role: "Founder & Lead Engineer",
          organization: "Example Creek Monitors",
          category: null,
          description: "Built 6 solar-powered sensors that log stream temperature and turbidity; Publish an open data dashboard used by the county parks office",
          grades: null,
          hoursPerWeek: null,
          weeksPerYear: null,
        },
        {
          title: "Example High School Forensics",
          role: "Captain",
          organization: "Example High School Forensics",
          category: null,
          description: "Led the team to a national title.", // not in the text
          grades: null,
          hoursPerWeek: 7, // not in the text
          weeksPerYear: null,
        },
        {
          title: "Example Model UN", // invented
          role: "Secretary-General",
          organization: null,
          category: "Debate/Speech",
          description: "Ran a 300-delegate conference.",
          grades: null,
          hoursPerWeek: null,
          weeksPerYear: null,
        },
      ],
    });
    const r = await parseActivitiesText(RESUME);
    expect(r.engine).toBe("llm");
    expect(r.activities.map((a) => a.title)).toEqual(["Example Creek Monitors", "Example High School Forensics"]);
    expect(r.activities[1].description).toBe("");
    expect(r.activities[1].hoursPerWeek).toBeUndefined();
    expect(r.warnings.join(" ")).toMatch(/did not match your text/);
    expectGrounded(RESUME, r.activities);
  });

  it("falls back to the deterministic parser when Claude fails", async () => {
    mockedAvailable.mockReturnValue(true);
    mockedGenerate.mockRejectedValue(new Error("overloaded"));
    const r = await parseActivitiesText(RESUME);
    expect(r.engine).toBe("deterministic");
    expect(r.activities).toHaveLength(3);
  });

  it("falls back when Claude returns nothing grounded", async () => {
    mockedAvailable.mockReturnValue(true);
    mockedGenerate.mockResolvedValue({
      activities: [
        {
          title: "Invented Club",
          role: null,
          organization: null,
          category: null,
          description: "Something that is not in the text at all.",
          grades: null,
          hoursPerWeek: null,
          weeksPerYear: null,
        },
      ],
    });
    const r = await parseActivitiesText(LIST);
    expect(r.engine).toBe("deterministic");
    expect(r.activities.map((a) => a.title)).toContain("Example Robotics Team");
  });

  it("grounds numbers and categories too", () => {
    const source = "Example Choir, Section leader. Rehearse 4 hours each week. Activity type: Music: Vocal";
    const { drafts } = groundLlmActivities(source, [
      {
        title: "Example Choir",
        role: "Section leader",
        organization: "Example Choir",
        category: "Music: Vocal",
        description: "Rehearse 4 hours each week.",
        grades: "12",
        hoursPerWeek: 4,
        weeksPerYear: 30,
      },
    ]);
    expect(drafts[0]).toMatchObject({ category: "Music: Vocal", hoursPerWeek: 4, weeksPerYear: undefined, grades: undefined });
  });
});

describe("PDF text", () => {
  it("extracts text and parses a two-page Common App PDF, dropping repeated page headers", async () => {
    const header = "Alex Example  CAID 4410001";
    const lines = LABELED.split("\n").filter((l) => l.trim());
    const pdf = makeTestPdf([
      [header, ...lines.slice(0, 13), "Page 1 of 2"],
      [header, ...lines.slice(13), "Page 2 of 2"],
    ]);
    const text = await extractPdfText(pdf);
    expect(text).toContain("Example Creek Monitors");
    expect(text).not.toContain("CAID");
    expect(pdf.byteLength).toBeGreaterThan(0); // the caller's buffer is not detached
    const r = await parseActivitiesText(text);
    expect(r.activities.map((a) => a.title)).toEqual(["Example Creek Monitors", "Example High School Forensics"]);
    expect(r.activities[0].description).toBe(
      "Built 6 solar-powered sensors that log stream temperature and turbidity; data shared with the county parks office.",
    );
  });

  it("rejects files that are not PDFs", async () => {
    await expect(extractPdfText(new TextEncoder().encode("not a pdf at all"))).rejects.toBeInstanceOf(PdfTextError);
  });

  it("removes running headers and footers but never labels or values", () => {
    const pages = [
      "Alex Example CAID 4410001\nActivity type\nArt\nPosition/Leadership description\nPainter\n40\nPage 1",
      "Alex Example CAID 4410001\nActivity type\nResearch\nOrganization Name\nExample Lab\n40\nPage 2",
    ];
    expect(removeRepeatedPageLines(pages)).toEqual([
      "Activity type\nArt\nPosition/Leadership description\nPainter\n40",
      "Activity type\nResearch\nOrganization Name\nExample Lab\n40",
    ]);
    expect(removeRepeatedPageLines(["only page\nPage 1"])).toEqual(["only page\nPage 1"]);
  });
});

describe("Common App combined position label", () => {
  it("reads 'Position/Leadership description and organization name' as one label", async () => {
    const text = [
      "1. Activity type: Science/Math",
      "Position/Leadership description and organization name: Founder and President, Example Robotics Outreach",
      "Please describe this activity, including what you accomplished and any recognition you received, etc.: Started a club that runs free robotics workshops.",
      "Participation grade levels: 10, 11, 12",
      "Hours spent per week: 4",
      "Weeks spent per year: 30",
    ].join("\n");
    const { activities } = await parseActivitiesText(text, { useLlm: false });
    expect(activities).toHaveLength(1);
    const a = activities[0];
    expect([a.title, a.role, a.organization].filter(Boolean).join(" | ")).not.toMatch(/(^|\|\s)and(\s\||$)/);
    expect(a.role ?? a.title).toMatch(/Founder and President/);
    expect(`${a.title} ${a.organization ?? ""}`).toMatch(/Example Robotics Outreach/);
    expect(a.hoursPerWeek).toBe(4);
    expect(a.weeksPerYear).toBe(30);
  });
});
