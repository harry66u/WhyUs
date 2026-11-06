import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DraftChecker } from "@/components/draft/draft-checker";
import { ButtonLink } from "@/components/ui/button";
import { IconArrowLeft } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/misc";
import { getCurrentUser, requireUser } from "@/lib/auth/session";
import { getApplication } from "@/lib/data/applications";
import { isVerifiedFact } from "@/lib/matching/swap";
import { getSchoolFacts } from "@/lib/research/corpus-store";
import { getSchool, getUnit } from "@/lib/schools/registry";

type Props = { params: Promise<{ applicationId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { applicationId } = await params;
  const user = await getCurrentUser();
  const app = user ? await getApplication(user.id, applicationId) : null;
  const school = app ? getSchool(app.schoolId) : undefined;
  return { title: school ? `${school.shortName} draft check` : "Draft check" };
}

export default async function DraftCheckPage({ params }: Props) {
  const { applicationId } = await params;
  const user = await requireUser(`/app/draft/${encodeURIComponent(applicationId)}`);
  const app = await getApplication(user.id, applicationId);
  if (!app) notFound();
  const school = getSchool(app.schoolId);
  if (!school) notFound();

  const unit = getUnit(school, app.unitId);
  const libraryPrompt = app.promptId ? school.prompts.find((p) => p.id === app.promptId) : undefined;
  const verifiedFacts = (await getSchoolFacts(school.id)).filter(isVerifiedFact).length;

  return (
    <div>
      <Link href="/app/draft" className="mb-6 inline-flex items-center gap-1.5 rounded-md text-sm text-muted transition-colors hover:text-fg">
        <IconArrowLeft size={14} />
        Draft check
      </Link>
      <PageHeader
        title={school.name}
        description={unit && unit.name !== school.name ? `Draft check for ${unit.name}` : "Draft check"}
        actions={
          app.status === "ready" ? (
            <ButtonLink href={`/app/schools/${encodeURIComponent(app.id)}`} variant="secondary">
              View dossier
            </ButtonLink>
          ) : null
        }
      />

      <figure className="mt-8 max-w-[68ch]">
        <figcaption className="text-xs text-subtle">
          {libraryPrompt ? `${libraryPrompt.title}, ` : "The prompt, "}
          <span className="tabular">{app.wordLimit ? `${app.wordLimit} words` : "no word limit"}</span>
        </figcaption>
        <blockquote className="mt-2 font-serif text-lg/[1.6] text-pretty text-fg">
          <p>{app.promptText}</p>
        </blockquote>
      </figure>

      <DraftChecker
        className="mt-10"
        applicationId={app.id}
        schoolName={school.shortName || school.name}
        wordLimit={app.wordLimit}
        hasResearch={verifiedFacts > 0}
      />
    </div>
  );
}
