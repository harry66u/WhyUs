import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";
import { IconPlus } from "@/components/ui/icons";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { requireUser } from "@/lib/auth/session";
import { getEntitlements } from "@/lib/billing/entitlements";
import { getActiveStudent, toProfile } from "@/lib/data/students";
import { profileHasDetails } from "@/lib/profile/activities";
import { SchoolsList } from "./_dashboard/schools-list";
import { entitlementHint, loadDashboardRows } from "./_dashboard/summary";

export const metadata: Metadata = { title: "Schools" };

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

export default async function SchoolsPage() {
  const user = await requireUser("/app");
  const student = await getActiveStudent(user.id);

  if (!student) {
    if (user.role === "student") redirect("/onboarding");
    return (
      <div>
        <PageHeader title="Schools" description="Each student you manage has their own list of schools and dossiers." />
        <EmptyState
          className="mt-8"
          title="Add your first student"
          body="Start with their name and class year. You can build their profile and add schools right after."
          action={
            <ButtonLink href="/app/students" variant="primary">
              Add student
            </ButtonLink>
          }
        />
      </div>
    );
  }

  const [rows, entitlements] = await Promise.all([loadDashboardRows(user.id, student), getEntitlements(user.id)]);
  const profile = toProfile(student);
  const hasDetails = profileHasDetails(profile);
  const hint = entitlementHint(entitlements, student.id);
  const own = student.isSelf;
  const who = own ? "your" : `${firstName(student.name)}'s`;
  const count = rows.length === 1 ? "1 school" : `${rows.length} schools`;

  return (
    <div>
      <PageHeader
        title={student.name}
        description={
          <>
            <span className="tabular">{count}</span> on the list. {hint.text}
            {hint.action ? (
              <>
                {" "}
                <Link href={hint.action.href} className="text-fg underline decoration-line-strong underline-offset-[3px] hover:decoration-accent-line">
                  {hint.action.label}
                </Link>
              </>
            ) : null}
          </>
        }
        actions={
          <ButtonLink href="/app/schools/new" variant={hasDetails ? "primary" : "secondary"}>
            <IconPlus />
            Add school
          </ButtonLink>
        }
      />

      {!hasDetails ? (
        <section
          aria-labelledby="profile-callout"
          className="mt-8 flex flex-col gap-5 rounded-lg bg-raised px-6 py-6 shadow-raise sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="max-w-xl">
            <h2 id="profile-callout" className="text-md font-medium text-fg">
              Build {who} profile first
            </h2>
            <p className="mt-1.5 text-sm text-muted">
              WhyUs ranks each school&apos;s details by how directly they connect to {own ? "your" : `${firstName(student.name)}'s`} real
              activities. Add activities by hand, or import a Common App activities list or a resume.
            </p>
          </div>
          <ButtonLink href="/app/profile" variant="primary" className="shrink-0">
            Build profile
          </ButtonLink>
        </section>
      ) : null}

      <div className="mt-8">
        {rows.length === 0 ? (
          <EmptyState
            title="Add the first school on your list"
            body="Pick the school, the college within it, and the prompt. WhyUs reads official pages, verifies every fact, and builds a one-page dossier in about two minutes."
            action={
              <ButtonLink href="/app/schools/new" variant={hasDetails ? "primary" : "secondary"}>
                <IconPlus />
                Add school
              </ButtonLink>
            }
          />
        ) : (
          <SchoolsList key={student.id} studentId={student.id} initialRows={rows} />
        )}
      </div>
    </div>
  );
}
