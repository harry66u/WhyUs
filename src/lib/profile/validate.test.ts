import { describe, expect, it } from "vitest";
import { mergeActivities, activityThemes, sameActivity } from "./activities";
import { normalizeTags, validateBasics, validateProfile } from "./validate";
import { graduationYearOptions, seniorClassYear } from "./years";
import type { Activity } from "@/lib/types";

let n = 0;
const makeId = () => `act-gen-${++n}`;

describe("validateBasics", () => {
  it("accepts a name and year and trims optional fields to null", () => {
    const r = validateBasics({ name: "  Alex   Example ", graduationYear: "2027", highSchool: " ", location: "" });
    expect(r).toEqual({ ok: true, value: { name: "Alex Example", graduationYear: 2027, highSchool: null, location: null } });
  });

  it("explains what is missing", () => {
    const r = validateBasics({ name: "", graduationYear: "soon" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.name).toBe("Enter a name.");
      expect(r.errors.graduationYear).toBe("Choose a graduation year.");
    }
  });
});

describe("validateProfile", () => {
  const base = { name: "Alex Example", graduationYear: 2027, highSchool: "Example High School", location: "Example City, OH" };

  it("normalizes tags and activities and keeps valid ids", () => {
    const r = validateProfile(
      {
        ...base,
        intendedMajors: ["Environmental Engineering", " environmental engineering ", ""],
        interests: ["water quality", "jazz"],
        activities: [
          { id: "act-1", title: "  Example Creek Monitors ", role: "Founder", description: "Built 6 sensors.\n\n\n\nShared data.", hoursPerWeek: "5", weeksPerYear: 40 },
          { id: "act-1", title: "Jazz band", description: "" },
          { id: "bad id!", title: "Debate", hoursPerWeek: "", weeksPerYear: null },
        ],
      },
      { makeId },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.intendedMajors).toEqual(["Environmental Engineering"]);
    expect(r.value.activities[0]).toEqual({
      id: "act-1",
      title: "Example Creek Monitors",
      role: "Founder",
      description: "Built 6 sensors.\n\nShared data.",
      hoursPerWeek: 5,
      weeksPerYear: 40,
    });
    // Duplicate and malformed ids are replaced.
    expect(r.value.activities[1].id).not.toBe("act-1");
    expect(r.value.activities[2].id).toMatch(/^act-gen-/);
    expect(r.value.activities[2].hoursPerWeek).toBeUndefined();
  });

  it("reports errors by field, with activity positions", () => {
    const r = validateProfile(
      {
        ...base,
        name: "",
        intendedMajors: Array.from({ length: 9 }, (_, i) => `Major ${i}`),
        activities: [{ title: "" }, { title: "Ok", hoursPerWeek: 200, weeksPerYear: 2.5 }],
      },
      { makeId },
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toMatchObject({
      name: "Enter a name.",
      intendedMajors: "List up to 8 intended majors.",
      "activities.0.title": "Give this activity a title.",
      "activities.1.hoursPerWeek": "Hours per week must be between 0 and 168.",
      "activities.1.weeksPerYear": "Weeks per year must be a whole number from 0 to 52.",
    });
  });

  it("caps the stored source text and accepts null to clear it", () => {
    const long = validateProfile({ ...base, activitiesSource: "x".repeat(200_000) }, { makeId });
    expect(long.ok && long.value.activitiesSource?.length).toBe(100_000);
    const cleared = validateProfile({ ...base, activitiesSource: null }, { makeId });
    expect(cleared.ok && cleared.value.activitiesSource).toBeNull();
    const untouched = validateProfile({ ...base }, { makeId });
    expect(untouched.ok && "activitiesSource" in untouched.value).toBe(false);
  });

  it("dedupes tags case-insensitively", () => {
    expect(normalizeTags(["Jazz", "jazz ", "  ", 4, "Debate"])).toEqual(["Jazz", "Debate"]);
  });
});

describe("activities helpers", () => {
  const existing: Activity[] = [
    { id: "a1", title: "Example Creek Monitors", organization: "Example Creek Monitors", description: "Built sensors." },
    { id: "a2", title: "Jazz Band", description: "" },
  ];

  it("merges imported activities after existing ones, skipping duplicates", () => {
    const imported: Activity[] = [
      { id: "a1", title: "example creek monitors", organization: "Example Creek Monitors!", description: "Different text" },
      { id: "a2", title: "Debate", description: "Captain." },
    ];
    const r = mergeActivities(existing, imported, "merge", () => "fresh");
    expect(r.added).toBe(1);
    expect(r.skipped).toBe(1);
    expect(r.activities.map((a) => a.title)).toEqual(["Example Creek Monitors", "Jazz Band", "Debate"]);
    // The imported id collided with an existing one, so it was replaced.
    expect(r.activities[2].id).toBe("fresh");
  });

  it("replaces the list", () => {
    const r = mergeActivities(existing, [{ id: "x", title: "Debate", description: "" }], "replace", () => "y");
    expect(r.activities.map((a) => a.id)).toEqual(["x"]);
  });

  it("compares activities ignoring case and punctuation", () => {
    expect(sameActivity({ title: "Jazz Band", organization: undefined }, { title: "jazz band.", organization: "" })).toBe(true);
    expect(sameActivity({ title: "Jazz Band", organization: "A" }, { title: "Jazz Band", organization: "B" })).toBe(false);
  });

  it("detects themes from every field, most specific first", () => {
    const themes = activityThemes({ title: "Example Creek Monitors", role: "Founder", description: "Built Arduino sensors that measure turbidity." });
    expect(themes).toEqual(expect.arrayContaining(["water", "sensors", "electrical-engineering"]));
  });
});

describe("graduation years", () => {
  it("rolls the senior class over in August", () => {
    expect(seniorClassYear(new Date("2026-11-05T12:00:00Z"))).toBe(2027);
    expect(seniorClassYear(new Date("2026-05-01T12:00:00Z"))).toBe(2026);
    expect(graduationYearOptions(new Date("2026-11-05T12:00:00Z"))).toEqual([2026, 2027, 2028, 2029, 2030, 2031]);
    expect(graduationYearOptions(new Date("2026-11-05T12:00:00Z"), 2024)[0]).toBe(2024);
  });
});
