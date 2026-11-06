import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/misc";
import { requireUser } from "@/lib/auth/session";
import { listApplications } from "@/lib/data/applications";
import { getActiveStudent, toProfile } from "@/lib/data/students";
import { graduationYearOptions } from "@/lib/profile/years";
import { valuesFromProfile } from "./editable";
import { ProfileEditor } from "./profile-editor";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const user = await requireUser("/app/profile");
  const student = await getActiveStudent(user.id);
  if (!student) redirect(user.role === "student" ? "/onboarding" : "/app/students");

  const profile = toProfile(student);
  const applications = await listApplications(user.id, student.id);
  const hasDossiers = applications.some((a) => a.status === "ready");

  return (
    <div>
      <PageHeader
        title={student.isSelf ? "Your profile" : student.name}
        description={
          student.isSelf
            ? "Your intended majors, interests, and activities. WhyUs matches each school's verified details to these, and nothing here is ever used to train anything."
            : `${student.name}'s intended majors, interests, and activities. WhyUs matches each school's verified details to these, and nothing here is ever used to train anything.`
        }
      />
      <ProfileEditor
        key={student.id}
        studentId={student.id}
        isSelf={student.isSelf}
        initial={valuesFromProfile(profile)}
        years={graduationYearOptions(new Date(), profile.graduationYear)}
        savedAt={student.updatedAt.toISOString()}
        hasDossiers={hasDossiers}
      />
    </div>
  );
}
