import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getEntitlements } from "@/lib/billing/entitlements";
import { listApplications } from "@/lib/data/applications";
import { getActiveStudent, listStudents } from "@/lib/data/students";
import { graduationYearOptions, seniorClassYear } from "@/lib/profile/years";
import { type StudentListRow, StudentsManager } from "./students-manager";

export const metadata: Metadata = { title: "Students" };

export default async function StudentsPage() {
  const user = await requireUser("/app/students");
  if (user.role === "student") redirect("/app/profile");

  const [students, active, entitlements] = await Promise.all([listStudents(user.id), getActiveStudent(user.id), getEntitlements(user.id)]);
  const schoolCounts = await Promise.all(students.map((s) => listApplications(user.id, s.id).then((apps) => apps.length)));

  const rows: StudentListRow[] = students.map((s, i) => ({
    id: s.id,
    name: s.name,
    graduationYear: s.graduationYear,
    highSchool: s.highSchool,
    location: s.location,
    schools: schoolCounts[i],
    activities: (s.activities ?? []).length,
    active: s.id === active?.id,
    isSelf: s.isSelf,
  }));

  const count = rows.length === 1 ? "1 student" : `${rows.length} students`;
  const summary = entitlements.counselorPlan.active
    ? `${rows.length} of ${entitlements.counselorPlan.maxStudents} students on your counselor plan. Each has a private profile, list of schools, and dossiers.`
    : `${count}. Each has a private profile, list of schools, and dossiers.`;

  return <StudentsManager rows={rows} years={graduationYearOptions()} defaultYear={seniorClassYear()} summary={summary} />;
}
