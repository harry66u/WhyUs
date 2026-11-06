/**
 * Focused tests for the matching rules, on synthetic facts about a fictional
 * school (Example University, example.edu). Nothing here describes a real school.
 *
 * 1. substance       amenities, collections, and services never outrank or out-label academic details
 * 2. prompt focus    academic and unit prompts get academic, unit-scoped details
 * 3. connections     an activity is cited only through a specific, central shared theme
 * 4. redundancy      one detail per (activity, theme), two per activity, no interest-based repeats
 * 5. leads           distinct across schools, strongest total, academic before extracurricular
 * 6. angle lines     one line, theme through-line, activity plus at most two details
 * 7. questions       three details, specific, not answered by the page, varied
 */
import { describe, expect, it } from "vitest";
import type { Dossier, EssayAngle, Fact, School, StudentProfile } from "@/lib/types";
import { angleCandidates, chooseAngles, ideaLine, MAX_ANGLE_LENGTH, usedLeadsFrom, type RankedDetail } from "./angles";
import { coordinateAngles } from "./coordinate";
import { buildDossier } from "./engine";
import { explainFit } from "./explain";
import { essayProfile, factFeatures } from "./features";
import { throughLine } from "./framing";
import { studentThemes } from "./profile";
import { pickQuestions } from "./questions";
import { promptFocus, scoreFacts } from "./rank";
import { selectDetails } from "./select";
import { isSpecificTheme } from "./themes";
import { scoreUniqueness } from "./uniqueness";

/* ------------------------------------------------------------------ */
/* Fixtures                                                             */
/* ------------------------------------------------------------------ */

const SCHOOL: School = {
  id: "example",
  name: "Example University",
  shortName: "Example",
  city: "Exampleville",
  state: "EX",
  officialDomains: ["example.edu"],
  officialHosts: [],
  units: [
    { id: "engineering", name: "School of Engineering", shortName: "Example Engineering", aliases: ["Example Engineering"], hosts: ["engineering.example.edu"] },
    { id: "arts", name: "College of Arts and Sciences", aliases: ["Arts and Sciences"], hosts: ["arts.example.edu"] },
  ],
  prompts: [],
  seedUrls: [],
};

const STUDENT: StudentProfile = {
  id: "student-rules",
  name: "Test Student",
  graduationYear: 2027,
  intendedMajors: ["Environmental Engineering"],
  interests: ["water quality", "jazz trumpet", "bike repair", "urban heat and city data"],
  activities: [
    {
      id: "act-creek",
      title: "Creek Sensor Network",
      role: "Founder",
      category: "Environmental",
      description:
        "Built solar-powered Arduino sensors measuring turbidity and dissolved oxygen in a local creek; publish an open data dashboard used by the township conservation commission.",
      grades: "10, 11, 12",
      hoursPerWeek: 6,
      weeksPerYear: 40,
    },
    {
      id: "act-interp",
      title: "Volunteer Interpreter",
      role: "Spanish-English interpreter",
      description: "Interpret for Spanish-speaking families at township meetings on stormwater fees and at the annual community health fair.",
      grades: "11, 12",
      hoursPerWeek: 3,
      weeksPerYear: 30,
    },
    {
      id: "act-jazz",
      title: "Jazz Band",
      role: "Lead trumpet",
      category: "Music: Instrumental",
      description: "Lead trumpet in the school big band and a student combo.",
      grades: "9, 10, 11, 12",
      hoursPerWeek: 5,
      weeksPerYear: 36,
    },
    {
      id: "act-bike",
      title: "Community Bike Co-op",
      role: "Volunteer mechanic",
      description: "Repair donated bikes and teach basic maintenance to new riders.",
      grades: "10, 11, 12",
      hoursPerWeek: 4,
      weeksPerYear: 35,
    },
    {
      id: "act-heat",
      title: "Downtown Heat Island Map",
      role: "Independent project",
      category: "Research",
      description: "Built a bike-mounted temperature logger and mapped summer heat across downtown; presented the map to city council.",
      grades: "12",
      hoursPerWeek: 5,
      weeksPerYear: 12,
    },
  ],
};

let counter = 0;
function fact(p: Partial<Fact> & Pick<Fact, "kind" | "title" | "summary" | "hook">): Fact {
  counter++;
  return {
    id: p.id ?? `example:rules-${counter}`,
    schoolId: p.schoolId ?? "example",
    unitIds: p.unitIds ?? [],
    kind: p.kind,
    title: p.title,
    nameOnPage: p.nameOnPage ?? p.title,
    summary: p.summary,
    hook: p.hook,
    quote: p.quote ?? `${p.title}. ${p.summary}`,
    sourceUrl: p.sourceUrl ?? `https://www.example.edu/rules/${counter}`,
    sourceTitle: p.title,
    themes: p.themes ?? [],
    commonness: p.commonness ?? "rare",
    term: "2026-fall",
    verifiedAt: "2026-11-01",
  };
}

const ENG = ["engineering"];

// Academic, unit-scoped details with specific connections.
const watershed = fact({
  kind: "course",
  unitIds: ENG,
  title: "ENGR 41: Watershed Sensing",
  summary: "A course in which students build low-cost sensors that monitor creek water quality.",
  hook: "has students build low-cost sensors that monitor creek water quality",
});
const riverLab = fact({
  kind: "lab",
  unitIds: ENG,
  title: "River Chemistry Lab",
  summary: "A lab that studies stormwater and river chemistry with undergraduate researchers.",
  hook: "studies stormwater runoff and river chemistry with field sampling",
});
const urbanHeat = fact({
  kind: "course",
  unitIds: ENG,
  title: "ENGR 52: Urban Heat Mapping",
  summary: "A course on mapping urban heat islands with GIS and street-level sensors.",
  hook: "teaches students to map urban heat islands with GIS",
});
const interpCourse = fact({
  kind: "course",
  unitIds: ENG,
  title: "ENGR 18: Engineering Communication for Multilingual Communities",
  summary: "A course on interpreting technical information for bilingual and multilingual audiences.",
  hook: "trains engineers to interpret technical findings for multilingual communities",
});
const envEngMajor = fact({
  kind: "major",
  unitIds: ENG,
  title: "Environmental Engineering Major",
  summary: "The environmental engineering degree covers water treatment and air quality.",
  hook: "trains students in water treatment and air quality engineering",
});
const waterFellows = fact({
  kind: "program",
  unitIds: ENG,
  title: "Water Research Fellows",
  summary: "A paid summer research program on water quality with faculty mentors.",
  hook: "pairs students with faculty for paid summer water quality research",
});
const gisFaculty = fact({
  kind: "faculty",
  unitIds: ENG,
  title: "Robin Vale",
  people: ["Robin Vale"],
  summary: "A professor who teaches GIS and studies urban heat and city data.",
  hook: "researches urban heat islands with GIS and city data",
});

// University-wide extracurriculars and amenities, strongly matched.
const jazzOrchestra = fact({
  kind: "organization",
  title: "Example Jazz Orchestra",
  summary: "The student jazz orchestra and big band, open by audition.",
  hook: "lets students audition for the jazz orchestra and small combos",
});
const jazzCombos = fact({
  kind: "organization",
  title: "Jazz Combo Collective",
  summary: "A student jazz combo club with weekly jam sessions.",
  hook: "runs jazz combos and weekly jam sessions",
});
const jazzProgram = fact({
  kind: "program",
  title: "Jazz Performance Program",
  summary: "An auditioned jazz performance program with ensemble coaching.",
  hook: "offers auditioned jazz performance instruction",
});
const bikeStations = fact({
  kind: "facility",
  title: "Campus bike repair stations and Bike Map",
  summary: "Two campus bike repair stations and a map of bike lanes and bike parking.",
  hook: "gives cyclists two campus repair stations and a map of bike lanes",
});
const bikeShop = fact({
  kind: "organization",
  title: "Example Bikes",
  summary: "A student-run bike shop that repairs and refurbishes bikes.",
  hook: "trains students as bike mechanics in a student-run shop",
});
const sheetMusic = fact({
  kind: "facility",
  title: "Sheet Music Collection",
  summary: "A library collection of early jazz sheet music.",
  hook: "holds early jazz sheet music by big band composers",
});
const farmClub = fact({
  kind: "organization",
  title: "Farm Club",
  summary: "A student club that organizes educational, social, and volunteer activities at the campus farm.",
  hook: "organizes educational, social, and volunteer activities at the farm",
  themes: ["agriculture", "community-engagement", "education"],
});

const ACADEMIC = [watershed, riverLab, urbanHeat, interpCourse, envEngMajor, waterFellows, gisFaculty];
const EXTRA = [jazzOrchestra, jazzCombos, jazzProgram, bikeStations, bikeShop, sheetMusic, farmClub];

const MICHIGAN_LIKE =
  "Describe the unique qualities that attract you to the specific undergraduate college or school (including preferred admission and dual degree programs) to which you are applying. How would that curriculum support your interests?";

async function build(facts: Fact[], promptText: string, unitId: string | null = "engineering"): Promise<Dossier> {
  return buildDossier({
    dossierId: `d-${counter++}`,
    applicationId: "a-rules",
    student: STUDENT,
    school: SCHOOL,
    unitId,
    prompt: { text: promptText, wordLimit: 300 },
    verifiedFacts: facts,
    otherSchools: [],
    usedLeadAngleKeys: [],
    term: "2026-fall",
    stats: { pagesRead: 0, pagesBlocked: 0, factsConsidered: 0, factsVerified: facts.length, factsRejected: 0, durationMs: 0 },
  });
}

const byId = new Map([...ACADEMIC, ...EXTRA].map((f) => [f.id, f]));

/* ------------------------------------------------------------------ */
/* 1. Substance                                                         */
/* ------------------------------------------------------------------ */

describe("substance", () => {
  it("rates courses, labs, faculty, and research programs above amenities, collections, and services", () => {
    for (const f of [watershed, riverLab, gisFaculty, envEngMajor, waterFellows]) {
      const p = essayProfile(f);
      expect(p.academic).toBe(true);
      expect(p.substance).toBeGreaterThanOrEqual(0.9);
    }
    const stations = essayProfile(bikeStations);
    expect(stations.amenity).toBe(true);
    expect(stations.academic).toBe(false);
    expect(stations.substance).toBeLessThan(0.5);
    const collection = essayProfile(sheetMusic);
    expect(collection.amenity).toBe(true);
    expect(collection.substance).toBeLessThanOrEqual(0.5);
    const service = essayProfile({
      kind: "center",
      title: "Geospatial Help (Library)",
      summary: "The library connects students to GIS experts and services.",
      hook: "connects students to GIS experts and mapping software such as QGIS",
    });
    expect(service.academic).toBe(false);
    expect(service.substance).toBeLessThan(0.6);
    expect(essayProfile(jazzOrchestra).academic).toBe(false);
  });

  it("never labels a rare amenity Distinctive on rarity alone", () => {
    const none = [{ schoolId: "second", schoolName: "Second", status: "none" as const }];
    const amenity = factFeatures(bikeStations);
    const u = scoreUniqueness(bikeStations, none, amenity.specificity, amenity.substance);
    expect(u.label).not.toBe("Distinctive");
    expect(u.score).toBeLessThanOrEqual(64);
    expect(u.reason).toMatch(/amenity/i);
    const course = factFeatures(watershed);
    expect(scoreUniqueness(watershed, none, course.specificity, course.substance).label).toBe("Distinctive");
  });

  it("ranks a strongly matched amenity below academic details", () => {
    const scored = scoreFacts(studentThemes(STUDENT), [watershed, urbanHeat, bikeStations], { unitId: "engineering", promptText: "Why Example?" });
    const rank = (f: Fact) => scored.findIndex((s) => s.fact.id === f.id);
    expect(rank(bikeStations)).toBeGreaterThan(rank(watershed));
    expect(rank(bikeStations)).toBeGreaterThan(rank(urbanHeat));
  });
});

/* ------------------------------------------------------------------ */
/* 2. Prompt and unit focus                                             */
/* ------------------------------------------------------------------ */

describe("prompt focus", () => {
  it("reads what the prompt asks about", () => {
    expect(promptFocus(MICHIGAN_LIKE)).toMatchObject({ academic: true, unit: true, mode: "academic" });
    expect(promptFocus("Why do you think you would love to study at Example Engineering?")).toMatchObject({ unit: true, mode: "academic" });
    expect(
      promptFocus(
        "The College of Arts and Sciences is designed to foster discovery and connection. Describe something you are curious about and how you might pursue that curiosity in the College.",
      ).mode,
    ).toBe("academic");
    expect(promptFocus("What aspects of the college's academic program, community, and/or campus environment attract your interest?").mode).toBe("mixed");
    expect(promptFocus("How will you explore community at Example?").mode).toBe("community");
    expect(promptFocus("Why Example?").mode).toBe("open");
    // A unit named in the registry counts even without generic words.
    expect(promptFocus("Discuss how a Wharton education would help you.", ["Wharton"]).unit).toBe(true);
  });

  it("fills an academic or unit prompt with academic, unit-scoped details and caps extracurriculars", async () => {
    const d = await build([...ACADEMIC, ...EXTRA], MICHIGAN_LIKE);
    const academic = d.details.filter((x) => {
      const f = byId.get(x.factId)!;
      return factFeatures(f).academic && !["jazz", "music", "cycling"].includes(x.fit.themes[0] ?? "");
    });
    const universityWideExtra = d.details.filter((x) => (x.unitIds ?? []).length === 0 && !factFeatures(byId.get(x.factId)!).academic);
    expect(d.details.length).toBeGreaterThanOrEqual(6);
    expect(academic.length).toBeGreaterThanOrEqual(5);
    expect(universityWideExtra.length).toBeLessThanOrEqual(2);
    expect(d.details.some((x) => x.factId === bikeStations.id)).toBe(false);
    expect(d.details.some((x) => x.factId === sheetMusic.id)).toBe(false);
    // Unit-scoped details come first.
    expect(d.details.slice(0, 5).every((x) => (x.unitIds ?? []).includes("engineering"))).toBe(true);
  });

  it("selection enforces the academic minimum even when extracurriculars score higher", () => {
    const student = studentThemes(STUDENT);
    const scored = scoreFacts(student, [...ACADEMIC, ...EXTRA], { unitId: "engineering", promptText: MICHIGAN_LIKE });
    const boosted = (s: (typeof scored)[number]) => (s.academic ? 0.2 : 0.9) + s.score * 0.01; // extracurriculars look far better
    const picked = selectDetails(scored, { focus: { mode: "academic" }, value: boosted });
    expect(picked.filter((s) => s.academic).length).toBeGreaterThanOrEqual(5);
    expect(picked.filter((s) => !s.academic && s.unit !== "unit").length).toBeLessThanOrEqual(2);
  });
});

/* ------------------------------------------------------------------ */
/* 3. Specific connections                                              */
/* ------------------------------------------------------------------ */

describe("specific connections", () => {
  const profile = studentThemes(STUDENT);
  const act = (id: string) => profile.activities.find((a) => a.id === id)!;

  it("drops incidental themes and down-weights description-only ones", () => {
    expect(act("act-creek").themes.has("energy")).toBe(false); // "solar-powered" sensors
    expect(act("act-creek").themes.has("political-science")).toBe(false); // "township ... commission"
    expect(act("act-creek").themes.has("ecology")).toBe(false); // "conservation commission"
    expect(act("act-heat").themes.has("cycling")).toBe(false); // "bike-mounted" logger
    expect(act("act-heat").themes.has("political-science")).toBe(false); // presented "to city council"
    expect(act("act-interp").themes.has("political-science")).toBe(false); // "township meetings"
    expect(act("act-interp").themes.has("water")).toBe(false); // the agenda of a meeting, "stormwater fees"
    expect(act("act-interp").themes.has("public-health")).toBe(false); // the venue, a "health fair"
    // Title themes outweigh description-only themes.
    expect(act("act-creek").themes.get("water")).toBe(1);
    expect(act("act-creek").themes.get("data-science")!).toBeLessThan(0.75);
  });

  it("never cites an activity through generic themes alone", () => {
    const [s] = scoreFacts(profile, [farmClub], { unitId: null });
    expect(s.bases.some((b) => b.kind === "activity")).toBe(false);
    expect(explainFit(s).sentence).not.toMatch(/Interpreter|Bike Co-op/);
    expect(explainFit(s).basis).not.toBe("activity");
  });

  it("cites an activity through a specific, central shared theme", () => {
    const [s] = scoreFacts(profile, [watershed], { unitId: "engineering" });
    const e = explainFit(s);
    expect(e.basis).toBe("activity");
    expect(e.activityId).toBe("act-creek");
    expect(e.sentence).toMatch(/Creek Sensor Network/);
    expect(isSpecificTheme(s.bases[0].theme)).toBe(true);
  });

  it("ignores a theme the fact mentions only in passing", () => {
    const jazzCourse = fact({
      kind: "course",
      title: "MUS 30: Jazz Improvisation",
      summary: "A course on jazz improvisation for instrumentalists.",
      hook: "trains jazz players to improvise over standard forms",
      quote: "MUS 30 trains jazz players to improvise. The instructor commutes by bicycle.",
    });
    const [s] = scoreFacts(profile, [jazzCourse], { unitId: null });
    expect(s.bases.some((b) => b.kind === "activity" && b.sourceId === "act-bike")).toBe(false);
    expect(s.bases[0]?.sourceId).toBe("act-jazz");
  });
});

/* ------------------------------------------------------------------ */
/* 4. Redundancy                                                        */
/* ------------------------------------------------------------------ */

describe("redundancy", () => {
  it("keeps one detail per (activity, primary theme), two per activity, and no interest-based repeat", () => {
    const scored = scoreFacts(studentThemes(STUDENT), [...ACADEMIC, ...EXTRA], { unitId: "engineering", promptText: "Why Example?" });
    const picked = selectDetails(scored, { focus: { mode: "community" } });
    const slots = picked.filter((s) => s.cite).map((s) => `${s.cite!.kind}:${s.cite!.sourceId}|${s.cite!.theme}`);
    expect(new Set(slots).size).toBe(slots.length);
    const perActivity = new Map<string, number>();
    for (const s of picked) if (s.cite?.kind === "activity") perActivity.set(s.cite.sourceId, (perActivity.get(s.cite.sourceId) ?? 0) + 1);
    for (const n of perActivity.values()) expect(n).toBeLessThanOrEqual(2);
    // Three jazz facts are available and strongly matched; only one jazz detail is kept.
    const jazz = picked.filter((s) => [jazzOrchestra.id, jazzCombos.id, jazzProgram.id].includes(s.fact.id));
    expect(jazz.length).toBe(1);
  });

  it("shows angles that never share a detail with the lead", async () => {
    const d = await build([...ACADEMIC, ...EXTRA], "Why Example?");
    const lead = d.angles.find((a) => a.isLead)!;
    for (const a of d.angles.filter((x) => !x.isLead)) {
      expect(a.factIds.some((id) => lead.factIds.includes(id))).toBe(false);
      expect(a.activityIds[0] === lead.activityIds[0] && a.themes[0] === lead.themes[0]).toBe(false);
    }
  });
});

/* ------------------------------------------------------------------ */
/* 5. Lead assignment                                                   */
/* ------------------------------------------------------------------ */

function angle(key: string, strength: number, factIds: string[], academic = true): EssayAngle & { strength: number; academic: boolean } {
  const [activity, theme] = key.split("|");
  return { key, line: `${theme}: ${activity}.`, factIds, activityIds: activity.startsWith("act-") ? [activity] : [], themes: [theme], isLead: false, strength, academic };
}

function dossier(id: string, angles: EssayAngle[]): Dossier {
  const facts = [...new Set(angles.flatMap((a) => a.factIds))];
  return {
    id,
    applicationId: `app-${id}`,
    studentId: "student-rules",
    schoolId: id,
    schoolName: id,
    unitId: null,
    unitName: null,
    prompt: { text: "Why us?", wordLimit: null },
    generatedAt: "2026-11-06T00:00:00.000Z",
    term: "2026-fall",
    uniquenessScore: 70,
    details: facts.map((factId, i) => ({
      factId,
      rank: i + 1,
      kind: "course",
      title: factId,
      summary: "",
      quote: "",
      sourceUrl: "https://www.example.edu/",
      sourceTitle: "",
      verifiedAt: "2026-11-01",
      fit: { sentence: "", activityIds: [], themes: [], score: 0.6 },
      uniqueness: { score: 70, label: "Uncommon", commonlyMentioned: false, reason: "" },
      swap: [],
    })),
    angles: angles.map((a, i) => ({ ...a, isLead: i === 0 })),
    angleOptions: [],
    questions: [],
    policyNote: "",
    stats: { pagesRead: 0, pagesBlocked: 0, factsConsidered: 0, factsVerified: 0, factsRejected: 0, durationMs: 0, engine: "deterministic" },
  };
}

function leadsAfter(list: Dossier[]): Map<string, EssayAngle> {
  const byId = new Map(list.map((d) => [d.id, d]));
  for (const c of coordinateAngles(list)) byId.set(c.id, c);
  return new Map([...byId.values()].map((d) => [d.id, d.angles.find((a) => a.isLead)!]));
}

describe("lead assignment", () => {
  it("keeps leads distinct and maximizes total strength", () => {
    // A could lead with X (1.0) or Y (0.9); B only has X (1.0) or a weak Z (0.2).
    const a = dossier("a", [angle("act-x|water", 1.0, ["a1"]), angle("act-y|cities", 0.9, ["a2"])]);
    const b = dossier("b", [angle("act-x|water", 1.0, ["b1"]), angle("act-z|energy", 0.2, ["b2"])]);
    const leads = leadsAfter([a, b]);
    expect(leads.get("b")!.key).toBe("act-x|water");
    expect(leads.get("a")!.key).toBe("act-y|cities");
  });

  it("leads with an academic angle unless nothing academic of reasonable strength remains", () => {
    const strongAcademic = dossier("a", [angle("act-jazz|jazz", 1.0, ["a1"], false), angle("act-creek|water", 0.5, ["a2"])]);
    expect(leadsAfter([strongAcademic]).get("a")!.key).toBe("act-creek|water");
    const weakAcademic = dossier("b", [angle("act-jazz|jazz", 1.0, ["b1"], false), angle("act-creek|water", 0.1, ["b2"])]);
    expect(leadsAfter([weakAcademic]).get("b")!.key).toBe("act-jazz|jazz");
  });

  it("differs in activity and theme across up to twenty schools", () => {
    const list = Array.from({ length: 20 }, (_, i) =>
      dossier(`s${i}`, [
        angle(`act-${i % 7}|t${i % 5}`, 1 - i / 100, [`s${i}-1`]),
        angle(`act-${(i + 3) % 11}|u${i}`, 0.8, [`s${i}-2`]),
        angle(`act-${i}|v${i}`, 0.5, [`s${i}-3`]),
      ]),
    );
    const leads = [...leadsAfter(list).values()];
    expect(new Set(leads.map((l) => l.key)).size).toBe(20);
    expect(new Set(leads.map((l) => l.activityIds[0])).size).toBe(20);
    expect(new Set(leads.map((l) => l.themes[0])).size).toBe(20);
  });

  it("picks secondary angles that share no detail with the new lead", () => {
    const d = dossier("a", [angle("act-x|water", 0.5, ["f1", "f2"]), angle("act-y|cities", 1.0, ["f2", "f3"]), angle("act-z|energy", 0.4, ["f4"])]);
    const other = dossier("b", [angle("act-y|cities", 2.0, ["g1"]), angle("act-w|jazz", 0.1, ["g2"])]);
    const byId = new Map([d, other].map((x) => [x.id, x]));
    for (const c of coordinateAngles([d, other])) byId.set(c.id, c);
    const after = byId.get("a")!;
    const lead = after.angles.find((x) => x.isLead)!;
    for (const s of after.angles.filter((x) => !x.isLead)) expect(s.factIds.some((id) => lead.factIds.includes(id))).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* 6. Angle lines                                                       */
/* ------------------------------------------------------------------ */

describe("angle lines", () => {
  it("frames each theme with its own through-line", () => {
    expect(throughLine("water")).toBe("measurement that changes what a town decides about its water");
    expect(throughLine("sensors")).toBe("building instruments that answer real questions");
    expect(throughLine("environmental-policy")).toBe("where engineering analysis meets policy argument");
    expect(throughLine("cities")).toBe("mapping a city's problems street by street");
    expect(throughLine("language-access")).toBe("making technical information usable for every neighbor");
    expect(throughLine("water", 1)).not.toBe(throughLine("water"));
  });

  it("names the activity and at most two details in one idea line", async () => {
    const d = await build([...ACADEMIC, ...EXTRA], "Why Example?");
    for (const a of d.angles) {
      expect(a.line.length).toBeLessThanOrEqual(MAX_ANGLE_LENGTH);
      expect(a.line).not.toMatch(/\b(?:I|I'm|I've|my|me|we|our)\b/);
      expect(a.line).not.toMatch(/Politics and government/);
      expect(a.factIds.length).toBeLessThanOrEqual(2);
      if (a.activityIds[0]) expect(a.line).toMatch(/\bfrom your\b/);
    }
    const scored = scoreFacts(studentThemes(STUDENT), [watershed], { unitId: "engineering" });
    const line = ideaLine("water", "your Creek Sensor Network", "your Creek Sensor Network", [{ scored: scored[0], rank: 1 }]);
    expect(line).toBe("Measurement that changes what a town decides about its water: from your Creek Sensor Network to ENGR 41 (Watershed Sensing).");
  });

  it("never labels an angle with an incidental theme", () => {
    const council = fact({
      kind: "program",
      title: "Township Government Fellows",
      summary: "A fellowship placing students with township governments and city councils.",
      hook: "places students with township governments for summer fellowships",
    });
    const scored = scoreFacts(studentThemes(STUDENT), [council, watershed], { unitId: null });
    const ranked: RankedDetail[] = selectDetails(scored, { min: 1, max: 2 }).map((s, i) => ({ scored: s, rank: i + 1, cite: s.cite }));
    const { shown } = chooseAngles(angleCandidates(ranked), usedLeadsFrom([]));
    expect(shown.every((c) => c.theme !== "political-science")).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* 7. Questions                                                         */
/* ------------------------------------------------------------------ */

describe("questions", () => {
  it("asks about three different details, never what the page already answers", async () => {
    const d = await build([...ACADEMIC, ...EXTRA], MICHIGAN_LIKE);
    expect(d.questions).toHaveLength(3);
    expect(new Set(d.questions.map((q) => q.factId)).size).toBe(3);
    expect(new Set(d.questions.map((q) => q.audience)).size).toBe(2);
    for (const q of d.questions) {
      const f = byId.get(q.factId!)!;
      expect(q.text.endsWith("?")).toBe(true);
      // ENGR 41 says students build sensors: a hands-on question would be answered already.
      if (f.id === watershed.id) expect(q.text).not.toMatch(/hands-on/);
    }
  });

  it("does not ask whether first-year students can take an introductory course", () => {
    const intro = fact({
      kind: "course",
      unitIds: ENG,
      title: "ENGR 10: Introduction to Water Sensing",
      summary: "An introductory course open to first-year students on building water sensors.",
      hook: "introduces first-year students to building water quality sensors",
    });
    const scored = scoreFacts(studentThemes(STUDENT), [intro], { unitId: "engineering" });
    const detail: RankedDetail = { scored: scored[0], rank: 1 };
    for (const seed of ["a", "b", "c", "d", "e", "f"]) {
      for (const q of pickQuestions([detail], { seed })) expect(q.text).not.toMatch(/Can first-year students take/);
    }
  });

  it("varies phrasing by school and draws on the detail's own words", () => {
    const scored = scoreFacts(studentThemes(STUDENT), ACADEMIC, { unitId: "engineering" });
    const details: RankedDetail[] = scored.slice(0, 6).map((s, i) => ({ scored: s, rank: i + 1 }));
    const texts = new Set<string>();
    let specific = 0;
    for (const seed of ["dartmouth", "penn", "cornell", "umich"]) {
      const qs = pickQuestions(details, { seed });
      expect(qs).toHaveLength(3);
      for (const q of qs) {
        texts.add(q.text);
        if (/^Since |research on |\bon [a-z]/.test(q.text)) specific++;
      }
    }
    expect(texts.size).toBeGreaterThan(3);
    expect(specific).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ */
/* Robustness                                                           */
/* ------------------------------------------------------------------ */

describe("robustness", () => {
  it("still builds a complete dossier for a profile with nothing to connect", async () => {
    const d = await buildDossier({
      dossierId: "d-empty",
      applicationId: "a-empty",
      student: { id: "empty", name: "Empty", graduationYear: 2027, intendedMajors: [], interests: [], activities: [] },
      school: SCHOOL,
      unitId: null,
      prompt: { text: "", wordLimit: null },
      verifiedFacts: [...ACADEMIC, ...EXTRA],
      otherSchools: [],
      usedLeadAngleKeys: [],
      term: "2026-fall",
      stats: { pagesRead: 0, pagesBlocked: 0, factsConsidered: 0, factsVerified: 14, factsRejected: 0, durationMs: 0 },
    });
    expect(d.details.length).toBeGreaterThanOrEqual(6);
    expect(d.angles.length).toBeGreaterThanOrEqual(2);
    expect(d.angles.filter((a) => a.isLead)).toHaveLength(1);
    expect(d.questions).toHaveLength(3);
    for (const x of d.details) expect(x.fit.sentence).toMatch(/^Not tied to a specific activity/);
  });

  it("grounds details in interests and majors when the profile lists no activities", async () => {
    const d = await buildDossier({
      dossierId: "d-interests",
      applicationId: "a-interests",
      student: { ...STUDENT, id: "interests-only", activities: [] },
      school: SCHOOL,
      unitId: "engineering",
      prompt: { text: MICHIGAN_LIKE, wordLimit: 300 },
      verifiedFacts: [...ACADEMIC, ...EXTRA],
      otherSchools: [],
      usedLeadAngleKeys: [],
      term: "2026-fall",
      stats: { pagesRead: 0, pagesBlocked: 0, factsConsidered: 0, factsVerified: 14, factsRejected: 0, durationMs: 0 },
    });
    expect(d.details.length).toBeGreaterThanOrEqual(6);
    expect(d.details.some((x) => /^(?:Matches your interest in|Fits your plan to study) /.test(x.fit.sentence))).toBe(true);
    expect(d.angles.length).toBeGreaterThanOrEqual(2);
    expect(d.questions).toHaveLength(3);
  });
});
