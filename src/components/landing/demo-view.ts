import type { DemoView, LandingDemo } from "./types";

/** The replay's client payload: only what the research demo renders. */
export function toDemoView(demo: LandingDemo): DemoView {
  const details = [...demo.dossier.details]
    .sort((a, b) => a.rank - b.rank)
    .map((d) => ({
      factId: d.factId,
      rank: d.rank,
      kind: d.kind,
      title: d.title,
      sourceUrl: d.sourceUrl,
      score: Math.max(0, Math.min(100, Math.round(d.uniqueness.score))),
      label: d.uniqueness.commonlyMentioned ? "Commonly mentioned" : d.uniqueness.label,
      commonlyMentioned: d.uniqueness.commonlyMentioned,
      swap: (d.swap ?? []).map((r) => ({ schoolId: r.schoolId, schoolName: r.schoolName, status: r.status })),
    }));
  return {
    source: demo.source,
    school: demo.school,
    unit: demo.unit,
    prompt: { text: demo.prompt.text, wordLimit: demo.prompt.wordLimit },
    events: demo.events,
    verifiedOn: demo.verifiedOn,
    compared: demo.compared,
    summary: demo.summary,
    details,
    leadAngle: demo.dossier.angles.find((a) => a.isLead)?.line ?? demo.dossier.angles[0]?.line ?? null,
  };
}
