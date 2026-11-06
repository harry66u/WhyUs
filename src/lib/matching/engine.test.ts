/**
 * Matching engine invariants, using the real verified corpora in /data and the
 * sample student. No network: facts are treated as verified as stored.
 */
import { describe, expect, it } from "vitest";
import sample from "@data/sample-student.json";
import { seedCorpus } from "@/lib/research/corpus-data";
import { getSchool } from "@/lib/schools/registry";
import type { Dossier, Fact, School, StudentProfile } from "@/lib/types";
import { buildDossier, coordinateAngles, rankFacts, swapTest } from "./engine";

const student = sample as StudentProfile;
const UNITS: Record<string, string> = { dartmouth: "college", penn: "college", cornell: "engineering", tufts: "engineering", umich: "taubman" };
const ids = Object.keys(UNITS).filter((id) => (seedCorpus(id)?.facts.length ?? 0) > 0);

function factsFor(id: string): Fact[] {
  return (seedCorpus(id)?.facts ?? []).filter((f) => f.verifiedAt);
}

async function build(id: string, usedLeadAngleKeys: string[] = []): Promise<Dossier> {
  const school = getSchool(id) as School;
  const others = ids.filter((o) => o !== id).map((o) => ({ school: getSchool(o) as School, facts: factsFor(o) }));
  return buildDossier({
    dossierId: `d-${id}`,
    applicationId: `a-${id}`,
    student,
    school,
    unitId: UNITS[id],
    prompt: { text: `Why ${school.shortName}?`, wordLimit: 250 },
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
