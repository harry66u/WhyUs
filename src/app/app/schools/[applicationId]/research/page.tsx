import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ResearchView } from "@/components/research/research-view";
import type { FinalDossierView } from "@/components/research/types";
import { requireUser } from "@/lib/auth/session";
import { getApplication } from "@/lib/data/applications";
import { getDossierForApplication } from "@/lib/data/dossiers";
import { getLatestRun, reconcileRun } from "@/lib/research/runner";
import { getSchool, getUnit } from "@/lib/schools/registry";
import type { Dossier } from "@/lib/types";

export const metadata: Metadata = { title: "Live research" };

function toFinalView(d: Dossier): FinalDossierView {
  return {
    dossierId: d.id,
    uniquenessScore: d.uniquenessScore,
    generatedAt: d.generatedAt,
    details: d.details.map((x) => ({
      factId: x.factId,
      rank: x.rank,
      kind: x.kind,
      title: x.title,
      sentence: x.fit.sentence,
      uniqueness: { score: x.uniqueness.score, label: x.uniqueness.label, commonlyMentioned: x.uniqueness.commonlyMentioned },
      swap: x.swap,
      sourceUrl: x.sourceUrl,
      verifiedAt: x.verifiedAt,
    })),
    angles: d.angles.map((a) => ({ line: a.line, isLead: a.isLead })),
  };
}

export default async function LiveResearchPage({ params }: { params: Promise<{ applicationId: string }> }) {
  const { applicationId } = await params;
  const user = await requireUser(`/app/schools/${encodeURIComponent(applicationId)}/research`);
  const app = await getApplication(user.id, applicationId);
  if (!app) notFound();
  const school = getSchool(app.schoolId);
  if (!school) notFound();
  const unit = getUnit(school, app.unitId);
  const latest = await getLatestRun(app.id);
  const run = latest ? await reconcileRun(latest) : null;
  const dossier = run?.status === "done" ? await getDossierForApplication(user.id, app.id) : null;

  return (
    <ResearchView
      applicationId={app.id}
      schoolName={school.name}
      schoolShortName={school.shortName}
      unitName={unit && unit.name !== school.name ? unit.name : null}
      prompt={{ text: app.promptText, wordLimit: app.wordLimit }}
      initialRun={run ? { id: run.id, status: run.status, startedAt: run.startedAt, finishedAt: run.finishedAt, error: run.error } : null}
      final={dossier ? toFinalView(dossier) : null}
      dossierHref={`/app/schools/${encodeURIComponent(app.id)}`}
    />
  );
}
