/**
 * Matching engine invariants, using the real verified corpora in /data and the
 * sample student. No network: facts are treated as verified as stored.
 */
import { describe, expect, it } from "vitest";
import sample from "@data/sample-student.json";
import { seedCorpus } from "@/lib/research/corpus-data";
import { getSchool, promptsFor } from "@/lib/schools/registry";
import type { Dossier, Fact, School, StudentProfile } from "@/lib/types";
import { buildDossier, coordinateAngles, rankFacts, studentThemes, swapTest } from "./engine";
import { factFeatures } from "./features";
import { GENERIC_THEMES, HOBBY_GROUPS, themeGroup } from "./themes";

const student = sample as StudentProfile;
const UNITS: Record<string, string> = { dartmouth: "college", penn: "college", cornell: "engineering", tufts: "engineering", umich: "taubman" };
const ids = Object.keys(UNITS).filter((id) => (seedCorpus(id)?.facts.length ?? 0) > 0);

function factsFor(id: string): Fact[] {
  return (seedCorpus(id)?.facts ?? []).filter((f) => f.verifiedAt);
}

/** The 2026-27 "why" prompt for the sample student's unit, as the done check picks it. */
function whyPrompt(id: string): string {
  const school = getSchool(id) as School;
  const prompts = promptsFor(school, UNITS[id]);
  return (prompts.find((p) => p.kind === "why_school") ?? prompts[0])?.text ?? `Why ${school.shortName}?`;
}

async function build(id: string, usedLeadAngleKeys: string[] = [], promptText?: string): Promise<Dossier> {
  const school = getSchool(id) as School;
  const others = ids.filter((o) => o !== id).map((o) => ({ school: getSchool(o) as School, facts: factsFor(o) }));
  return buildDossier({
    dossierId: `d-${id}`,
    applicationId: `a-${id}`,
    student,
    school,
    unitId: UNITS[id],
    prompt: { text: promptText ?? `Why ${school.shortName}?`, wordLimit: 250 },
    verifiedFacts: factsFor(id),
    otherSchools: others,
    usedLeadAngleKeys,
    term: "2026-fall",
    stats: { pagesRead: 0, pagesBlocked: 0, factsConsidered: 0, factsVerified: 0, factsRejected: 0, durationMs: 0 },
  });
}

describe.skipIf(ids.length === 0)("matching engine on real corpora", () => {
  it("ranks deterministically and never returns facts scoped only to other units", () => {
    for (const id of ids) {
      const a = rankFacts(student, factsFor(id), { unitId: UNITS[id] });
      const b = rankFacts(student, factsFor(id), { unitId: UNITS[id] });
      expect(a.map((r) => r.fact.id)).toEqual(b.map((r) => r.fact.id));
      for (const r of a) {
        expect(r.fact.unitIds.length === 0 || r.fact.unitIds.includes(UNITS[id])).toBe(true);
        expect(r.score).toBeGreaterThanOrEqual(0);
        expect(r.score).toBeLessThanOrEqual(1);
      }
    }
  });

  it("builds a complete dossier from verified facts only", async () => {
    for (const id of ids) {
      const d = await build(id);
      const allowed = new Set(factsFor(id).map((f) => f.id));
      expect(d.details.length).toBeGreaterThanOrEqual(6);
      expect(d.details.length).toBeLessThanOrEqual(8);
      expect(d.angles.length).toBeGreaterThanOrEqual(2);
      expect(d.angles.length).toBeLessThanOrEqual(3);
      expect(d.questions).toHaveLength(3);
      expect(d.angles.filter((a) => a.isLead)).toHaveLength(1);
      expect(d.uniquenessScore).toBeGreaterThanOrEqual(0);
      expect(d.uniquenessScore).toBeLessThanOrEqual(100);
      for (const detail of d.details) {
        expect(allowed.has(detail.factId)).toBe(true);
        expect(detail.fit.sentence.length).toBeGreaterThan(20);
        expect(detail.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(detail.swap.map((s) => s.schoolId).sort()).toEqual(ids.filter((o) => o !== id).sort());
      }
      for (const a of d.angles) {
        expect(a.line.length).toBeLessThanOrEqual(160);
        expect(a.line).not.toMatch(/\b(I|I'm|I've|my)\b/); // ideas, never first-person essay prose
      }
    }
  });

  it("reports unknown, never none, for a school without a research base", () => {
    const id = ids[0];
    const fact = factsFor(id)[0];
    const empty = { ...(getSchool(ids[1] ?? id) as School), id: "no-research-yet", name: "No Research Yet" };
    const [result] = swapTest(fact, [{ school: empty, facts: [] }]);
    expect(result.status).toBe("unknown");
  });

  it("keeps lead angles distinct across the student's schools", async () => {
    const dossiers: Dossier[] = [];
    for (const id of ids) dossiers.push(await build(id, dossiers.map((d) => d.angles.find((a) => a.isLead)!.key)));
    const changed = coordinateAngles(dossiers);
    const byId = new Map(dossiers.map((d) => [d.id, d]));
    for (const c of changed) byId.set(c.id, c);
    const leads = [...byId.values()].map((d) => d.angles.find((a) => a.isLead)!);
    expect(new Set(leads.map((l) => l.key)).size).toBe(leads.length);
    expect(new Set(leads.map((l) => l.activityIds[0])).size).toBe(leads.length);
  });
});

/** Builds every school's dossier with its real prompt, then coordinates leads like the pipeline does. */
async function coordinatedSet(): Promise<Map<string, Dossier>> {
  const dossiers: Dossier[] = [];
  for (const id of ids) {
    const used = dossiers.map((d) => d.angles.find((a) => a.isLead)!.key);
    dossiers.push(await build(id, used, whyPrompt(id)));
    for (const c of coordinateAngles(dossiers)) dossiers[dossiers.findIndex((d) => d.id === c.id)] = c;
  }
  return new Map(dossiers.map((d) => [d.schoolId, d]));
}

const profile = studentThemes(student);
const majorGroups = new Set(profile.majors.flatMap((m) => [...m.themes.keys()].map(themeGroup)));
const factById = new Map(ids.flatMap((id) => factsFor(id)).map((f) => [f.id, f]));
/** Academic for this student: an academic detail whose subject is not only a hobby (jazz, cycling). */
function academicDetail(factId: string): boolean {
  const f = factFeatures(factById.get(factId)!);
  const hobbyOnly = [...f.central].every((k) => {
    const g = themeGroup(k);
    return g != null && HOBBY_GROUPS.has(g) && !majorGroups.has(g);
  });
  return f.academic && !hobbyOnly;
}

describe.skipIf(ids.length === 0)("matching quality on the sample student with the real prompts", () => {
  it("fills academic and unit prompts with academic details and few extracurriculars", async () => {
    const set = await coordinatedSet();
    for (const id of ["penn", "cornell", "umich"].filter((x) => set.has(x))) {
      const d = set.get(id)!;
      const academic = d.details.filter((x) => academicDetail(x.factId));
      const extra = d.details.filter((x) => (x.unitIds ?? []).length === 0 && !academicDetail(x.factId));
      expect(academic.length, id).toBeGreaterThanOrEqual(5);
      expect(extra.length, id).toBeLessThanOrEqual(2);
    }
    const umich = set.get("umich");
    if (umich) {
      expect(umich.details.some((x) => /Sheet Music Collection/.test(x.title))).toBe(false);
      expect(umich.details.filter((x) => (x.unitIds ?? []).includes("taubman")).length).toBeGreaterThanOrEqual(5);
    }
  });

  it("never rates an amenity Distinctive and keeps it out of academic prompts", async () => {
    const set = await coordinatedSet();
    for (const d of set.values()) {
      for (const x of d.details) {
        if (factFeatures(factById.get(x.factId)!).amenity) expect(x.uniqueness.label, x.title).not.toBe("Distinctive");
      }
    }
    expect(set.get("penn")?.details.some((x) => /bike repair stations/i.test(x.title)) ?? false).toBe(false);
  });

  it("cites an activity only through a specific theme the activity is about", async () => {
    const set = await coordinatedSet();
    for (const d of set.values()) {
      for (const x of d.details) {
        const actId = x.fit.activityIds[0];
        if (!actId || !/^(?:Builds directly on|Connects to|Relates to) /.test(x.fit.sentence)) continue;
        const theme = x.fit.themes[0];
        const salience = profile.activities.find((a) => a.id === actId)!.themes.get(theme) ?? 0;
        expect(GENERIC_THEMES.has(theme), `${x.title}: ${theme}`).toBe(false);
        expect(salience, `${x.title} -> ${actId} via ${theme}`).toBeGreaterThanOrEqual(0.5);
      }
      expect(d.details.some((x) => /Organic Farm Club/.test(x.title) && /Interpreter/.test(x.fit.sentence))).toBe(false);
    }
  });

  it("keeps one detail per activity and theme, two per activity, one jazz detail", async () => {
    const set = await coordinatedSet();
    for (const d of set.values()) {
      const cited = d.details.filter((x) => x.fit.activityIds[0] && /^(?:Builds directly on|Connects to|Relates to) /.test(x.fit.sentence));
      const pairs = cited.map((x) => `${x.fit.activityIds[0]}|${x.fit.themes[0]}`);
      expect(new Set(pairs).size, d.schoolId).toBe(pairs.length);
      const perActivity = new Map<string, number>();
      for (const x of cited) perActivity.set(x.fit.activityIds[0], (perActivity.get(x.fit.activityIds[0]) ?? 0) + 1);
      for (const n of perActivity.values()) expect(n, d.schoolId).toBeLessThanOrEqual(2);
      expect(d.details.filter((x) => x.fit.themes[0] === "jazz" || x.fit.themes[0] === "music").length, d.schoolId).toBeLessThanOrEqual(1);
    }
  });

  it("leads with distinct academic angles: Dartmouth not with jazz, Michigan with the heat map", async () => {
    const set = await coordinatedSet();
    const leads = [...set.values()].map((d) => d.angles.find((a) => a.isLead)!);
    expect(new Set(leads.map((l) => l.key)).size).toBe(leads.length);
    expect(new Set(leads.map((l) => l.activityIds[0])).size).toBe(leads.length);
    expect(new Set(leads.map((l) => l.themes[0])).size).toBe(leads.length);
    for (const l of leads) expect(["jazz", "music", "cycling"]).not.toContain(l.themes[0]);
    const umichLead = set.get("umich")?.angles.find((a) => a.isLead);
    if (umichLead) expect(umichLead.activityIds[0]).toBe("act-heat-map");
  });

  it("writes idea lines with a through-line and secondary angles that add new details", async () => {
    const set = await coordinatedSet();
    for (const d of set.values()) {
      const lead = d.angles.find((a) => a.isLead)!;
      for (const a of d.angles) {
        expect(a.line.length).toBeLessThanOrEqual(160);
        expect(a.line).not.toMatch(/^(?:Jazz|Politics and government|Mapping and GIS|Water resources): from /);
        expect(a.line).not.toMatch(/\b(?:I|my|we|our)\b/);
        if (a !== lead) expect(a.factIds.some((id) => lead.factIds.includes(id)), `${d.schoolId}: ${a.line}`).toBe(false);
      }
    }
  });

  it("asks three specific questions per school without repeating one", async () => {
    const set = await coordinatedSet();
    const all: string[] = [];
    for (const d of set.values()) {
      expect(new Set(d.questions.map((q) => q.factId)).size).toBe(3);
      for (const q of d.questions) {
        expect(q.text).not.toMatch(/look like week to week/);
        all.push(q.text);
      }
    }
    expect(new Set(all).size).toBe(all.length);
  });
});
