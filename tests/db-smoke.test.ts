import { describe, expect, it } from "vitest";
import { getDb } from "@/lib/db/client";
import { users, students } from "@/lib/db/schema";
import { createApplication, listApplications } from "@/lib/data/applications";
import { getSchoolFacts } from "@/lib/research/corpus-store";
import { findQuote } from "@/lib/research/verify";
import { parseRobots, isAllowed } from "@/lib/research/robots";
import { detectThemes } from "@/lib/matching/themes";
import { findUnitsInText, getSchool, isOfficialUrl } from "@/lib/schools/registry";

describe("skeleton smoke", () => {
  it("migrates, inserts, and scopes applications by owner", async () => {
    const db = await getDb();
    await db.insert(users).values([{ id: "u1", email: "a@example.com" }, { id: "u2", email: "b@example.com" }]);
    await db.insert(students).values({ id: "s1", ownerUserId: "u1", name: "Sam", graduationYear: 2027 });
    await createApplication({ studentId: "s1", schoolId: "dartmouth", unitId: "college", promptId: null, promptText: "Why Dartmouth?", wordLimit: 100 });
    expect((await listApplications("u1", "s1")).length).toBe(1);
    expect((await listApplications("u2", "s1")).length).toBe(0);
    expect(Array.isArray(await getSchoolFacts("dartmouth"))).toBe(true);
  });
  it("verifies quotes strictly but tolerates typography", () => {
    const page = "Students design and build “field” sensors.\nThey deploy them on the river.";
    expect(findQuote(page, 'students design and build "field" sensors. they deploy').found).toBe(true);
    expect(findQuote(page, "Students design and build lab sensors").found).toBe(false);
  });
  it("parses robots.txt per RFC 9309", () => {
    const p = parseRobots("User-agent: *\nDisallow: /private\nAllow: /private/ok\n\nUser-agent: WhyUsResearchBot\nDisallow: /nobots$", "WhyUsResearchBot");
    expect(isAllowed(p, "/nobots")).toBe(false);
    expect(isAllowed(p, "/private")).toBe(true); // specific group replaces *
    const star = parseRobots("User-agent: *\nDisallow: /private\nAllow: /private/ok", "WhyUsResearchBot");
    expect(isAllowed(star, "/private/x")).toBe(false);
    expect(isAllowed(star, "/private/ok")).toBe(true);
  });
  it("tags themes and scopes units", () => {
    expect(detectThemes("Built solar-powered Arduino sensors measuring turbidity in Mill Creek")).toEqual(expect.arrayContaining(["water", "sensors", "electrical-engineering", "energy"]));
    const cornell = getSchool("cornell")!;
    expect(findUnitsInText(cornell, "How do your interests connect with Cornell Engineering?").map((u) => u.id)).toContain("engineering");
    expect(isOfficialUrl("https://cornell.campusgroups.com/x", cornell)).toBe(true);
    expect(isOfficialUrl("https://en.wikipedia.org/wiki/Cornell", cornell)).toBe(false);
  });
});
