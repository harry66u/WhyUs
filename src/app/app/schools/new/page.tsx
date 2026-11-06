import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { IconArrowLeft } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/misc";
import { requireUser } from "@/lib/auth/session";
import { canAddSchool } from "@/lib/billing/entitlements";
import { listApplications } from "@/lib/data/applications";
import { getActiveStudent } from "@/lib/data/students";
import { listSchools } from "@/lib/schools/registry";
import { AddSchoolForm } from "./add-school-form";
import { toSchoolOption } from "./resolve";

export const metadata: Metadata = { title: "Add a school" };

export default async function AddSchoolPage(props: { searchParams: Promise<{ school?: string | string[] }> }) {
  const user = await requireUser("/app/schools/new");
  const student = await getActiveStudent(user.id);
  if (!student) redirect(user.role === "student" ? "/onboarding" : "/app/students");

  const { school } = await props.searchParams;
  const [applications, check] = await Promise.all([listApplications(user.id, student.id), canAddSchool(user.id, student.id)]);
  const schools = [...listSchools()].sort((a, b) => a.name.localeCompare(b.name)).map(toSchoolOption);
  const taken = applications.map((a) => ({ schoolId: a.schoolId, unitId: a.unitId, applicationId: a.id }));

  return (
    <div className="max-w-3xl">
      <Link href="/app" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-fg">
        <IconArrowLeft size={14} />
        Schools
      </Link>
      <PageHeader
        title="Add a school"
        description={
          student.isSelf
            ? "Pick the school, the college you are applying to, and the prompt. WhyUs researches it from official sources."
            : `For ${student.name}. Pick the school, the college within it, and the prompt. WhyUs researches it from official sources.`
        }
      />
      <div className="mt-8">
        <AddSchoolForm
          key={student.id}
          studentId={student.id}
          schools={schools}
          taken={taken}
          initialSchoolId={typeof school === "string" ? school : undefined}
          blockedReason={check.ok ? null : check.reason}
        />
      </div>
    </div>
  );
}
