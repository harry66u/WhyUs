import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DossierDocument, DossierPrintStyles, dossierPdfFileName, firstName } from "@/components/dossier";
import { originFromHeaders, publicOrigin, shareUrl, withDetailScopes } from "@/components/dossier/load";
import { IconArrowLeft } from "@/components/ui/icons";
import { EmptyState } from "@/components/ui/misc";
import { getCurrentUser, requireUser } from "@/lib/auth/session";
import { getApplication } from "@/lib/data/applications";
import { getActiveShareToken, getDossierForApplication } from "@/lib/data/dossiers";
import { getStudent } from "@/lib/data/students";
import { getSchool } from "@/lib/schools/registry";
import { DossierToolbar } from "./dossier-toolbar";
import { RerunResearchButton } from "./rerun-research-button";

type Props = { params: Promise<{ applicationId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { applicationId } = await params;
  const user = await getCurrentUser();
  const app = user ? await getApplication(user.id, applicationId) : null;
  const school = app ? getSchool(app.schoolId) : undefined;
  return { title: school ? `${school.shortName} dossier` : "Dossier" };
}

export default async function DossierPage({ params }: Props) {
  const { applicationId } = await params;
  const user = await requireUser(`/app/schools/${encodeURIComponent(applicationId)}`);
  const app = await getApplication(user.id, applicationId);
  if (!app) notFound();

  // The briefing exists only once research has finished; until then the live view is the page.
  if (app.status !== "ready") redirect(`/app/schools/${encodeURIComponent(app.id)}/research`);

  const stored = await getDossierForApplication(user.id, app.id);
  if (!stored) {
    const school = getSchool(app.schoolId);
    return (
      <div className="mx-auto w-full max-w-[760px]">
        <Link href="/app" className="inline-flex items-center gap-1.5 rounded-md text-sm text-muted transition-colors hover:text-fg">
          <IconArrowLeft />
          All schools
        </Link>
        <EmptyState
          className="mt-10"
          title="This dossier is not available"
          body={`Research on ${school?.name ?? "this school"} finished, but no dossier was saved. Run the research again to rebuild it.`}
          action={<RerunResearchButton applicationId={app.id} />}
        />
      </div>
    );
  }

  const [dossier, student, token, requestHeaders] = await Promise.all([
    withDetailScopes(stored),
    getStudent(user.id, app.studentId),
    getActiveShareToken(user.id, stored.id),
    headers(),
  ]);
  const initialShareUrl = token ? shareUrl(token, publicOrigin(originFromHeaders(requestHeaders))) : null;

  return (
    <div className="mx-auto w-full max-w-[760px]">
      <DossierPrintStyles />
      <DossierToolbar
        applicationId={app.id}
        dossierId={dossier.id}
        schoolName={dossier.schoolName}
        initialShareUrl={initialShareUrl}
        pdfFileName={dossierPdfFileName(dossier)}
      />
      <DossierDocument dossier={dossier} preparedFor={firstName(student?.name)} animated />
    </div>
  );
}
