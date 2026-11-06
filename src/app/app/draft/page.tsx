import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { IconCheck, IconChevronRight, IconClock, IconPlus, IconX } from "@/components/ui/icons";
import { EmptyState, LiveDot, PageHeader } from "@/components/ui/misc";
import { requireUser } from "@/lib/auth/session";
import { listApplications } from "@/lib/data/applications";
import { getActiveStudent } from "@/lib/data/students";
import { NEVER_REWRITES } from "@/lib/draft/messages";
import type { ApplicationStatus } from "@/lib/types";
import { draftPickerRows, statusText } from "./rows";

export const metadata: Metadata = { title: "Draft check" };

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

const GRID = "lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.5fr)_6rem_9.5rem_1rem]";

function StatusCell({ status }: { status: ApplicationStatus }) {
  const glyph =
    status === "ready" ? (
      <IconCheck size={14} className="text-ok" />
    ) : status === "researching" ? (
      <LiveDot className="mx-[3px]" />
    ) : status === "queued" ? (
      <IconClock size={14} className="text-subtle" />
    ) : (
      <IconX size={14} className="text-subtle" />
    );
  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted">
      {glyph}
      {statusText(status)}
    </span>
  );
}

const CHECKS: { title: string; body: string }[] = [
  { title: "Word count", body: "Counted against the prompt's limit as you type." },
  { title: "School facts", body: "Each course, professor, lab, program, and place is looked up on official pages, with the source and date." },
  { title: "Other schools", body: "Names, colleges, and towns of the other schools on the list are flagged." },
  { title: "Swap test", body: "Sentences whose details exist at your other schools too are marked." },
  { title: "Generic sentences", body: "Stock phrases and praise that any school could claim are underlined." },
];

export default async function DraftPickerPage() {
  const user = await requireUser("/app/draft");
  const student = await getActiveStudent(user.id);

  if (!student) {
    if (user.role === "student") redirect("/onboarding");
    return (
      <div>
        <PageHeader title="Draft check" description="Each student you manage checks drafts against their own list of schools." />
        <EmptyState
          className="mt-8"
          title="Add your first student"
          body="Start with their name and class year, then add the schools they are writing for."
          action={
            <ButtonLink href="/app/students" variant="primary">
              Add student
            </ButtonLink>
          }
        />
      </div>
    );
  }

  const rows = draftPickerRows(await listApplications(user.id, student.id));
  const whose = student.isSelf ? "your" : `${firstName(student.name)}'s`;

  return (
    <div>
      <PageHeader
        title="Draft check"
        description={`Pick the school a draft is for. The check compares it with that school's official sources and with ${whose} other schools.`}
      />

      <div className="mt-8 grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <section aria-labelledby="draft-schools" className="min-w-0">
          <h2 id="draft-schools" className="sr-only">
            Schools
          </h2>
          {rows.length === 0 ? (
            <EmptyState
              title="Add the school this draft is for"
              body="Draft check compares a draft with the school's verified research and with the other schools on the list. Add a school first."
              action={
                <ButtonLink href="/app/schools/new" variant="primary">
                  <IconPlus />
                  Add school
                </ButtonLink>
              }
            />
          ) : (
            <>
              <div className={cn("hidden gap-x-4 px-4 pb-2 text-2xs text-subtle lg:grid", GRID)} aria-hidden="true">
                <span>School</span>
                <span>Prompt</span>
                <span>Limit</span>
                <span>Research</span>
                <span />
              </div>
              <ul role="list" className="divide-y divide-line overflow-hidden rounded-lg bg-raised shadow-raise">
                {rows.map((row) => (
                  <li
                    key={row.id}
                    className={cn(
                      "group relative grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-5 gap-y-2 px-4 py-4 transition-colors duration-150 hover:bg-hover lg:py-3.5",
                      GRID,
                    )}
                  >
                    <div className="col-span-2 min-w-0 pr-8 lg:col-span-1 lg:pr-0">
                      <Link
                        href={row.href}
                        className="font-medium tracking-[-0.01em] text-fg after:absolute after:inset-0 after:content-['']"
                        aria-label={`Check a draft for ${row.schoolName}${row.unitName ? `, ${row.unitName}` : ""}`}
                      >
                        {row.schoolName}
                      </Link>
                      {row.unitName ? <p className="truncate text-xs text-muted">{row.unitName}</p> : null}
                    </div>
                    <p className="col-span-2 min-w-0 truncate text-sm text-muted lg:col-span-1" title={row.promptTitle}>
                      <span className="sr-only">Prompt: </span>
                      {row.promptTitle}
                    </p>
                    <p className="tabular text-sm text-muted">
                      <span className="sr-only">Word limit: </span>
                      {row.wordLimit ? `${row.wordLimit} words` : "No limit"}
                    </p>
                    <StatusCell status={row.status} />
                    <IconChevronRight
                      size={14}
                      className="absolute top-5 right-4 text-subtle transition-colors group-hover:text-fg lg:static"
                    />
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-subtle">
                Checks use each school&apos;s verified research, so a draft can be checked while research is still running.
              </p>
            </>
          )}
        </section>

        <aside aria-labelledby="draft-covers" className="lg:border-l lg:border-line lg:pl-8">
          <h2 id="draft-covers" className="text-sm font-medium text-fg">
            What the check covers
          </h2>
          <dl className="mt-4 space-y-4">
            {CHECKS.map((c) => (
              <div key={c.title}>
                <dt className="text-sm text-fg">{c.title}</dt>
                <dd className="mt-0.5 text-xs leading-relaxed text-muted">{c.body}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-6 border-t border-line pt-4 text-sm font-medium text-fg">{NEVER_REWRITES}</p>
          <p className="mt-1.5 text-xs leading-relaxed text-muted">Drafts are checked and discarded. WhyUs does not store them.</p>
        </aside>
      </div>
    </div>
  );
}
