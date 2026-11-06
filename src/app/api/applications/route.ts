/**
 * GET /api/applications?studentId=...
 *
 * The schools on one student's list with research status and progress, the
 * uniqueness score, and the lead angle once ready. The dashboard polls this
 * every two seconds while research is running. Owner-scoped.
 */
import { loadDashboardRows } from "@/app/app/_dashboard/summary";
import { getUserOr401 } from "@/lib/auth/session";
import { getStudent } from "@/lib/data/students";

export async function GET(request: Request): Promise<Response> {
  const user = await getUserOr401();
  if (user instanceof Response) return user;
  const studentId = new URL(request.url).searchParams.get("studentId")?.trim() ?? "";
  if (!studentId || studentId.length > 64) {
    return Response.json({ error: "Missing studentId" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const student = await getStudent(user.id, studentId);
  if (!student) return Response.json({ error: "Student not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  const applications = await loadDashboardRows(user.id, student);
  return Response.json(
    { studentId: student.id, applications, refreshedAt: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
