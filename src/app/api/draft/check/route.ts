/**
 * POST /api/draft/check
 *
 * Body (JSON): { applicationId: string, text: string }
 *
 * Checks a draft for one school on the signed-in account's list: word count
 * against the application's limit, school facts against official sources, the
 * swap test against the student's other schools, and generic sentences.
 * Owner-scoped. The draft is checked in memory and never stored or logged.
 * The result only points out problems; it never contains rewritten text.
 */
import { getUserOr401 } from "@/lib/auth/session";
import { getApplication, listApplications } from "@/lib/data/applications";
import { getStudent } from "@/lib/data/students";
import { checkDraft } from "@/lib/draft/check";
import { MAX_DRAFT_CHARS } from "@/lib/draft/text";
import { getSchool } from "@/lib/schools/registry";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: NO_STORE });
}

function error(message: string, status: number): Response {
  return json({ error: message }, status);
}

export async function POST(request: Request): Promise<Response> {
  // Only WhyUs pages call this (the result is never shared with other sites).
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return error("This request must come from WhyUs itself.", 403);

  const user = await getUserOr401();
  if (user instanceof Response) return user;

  if (!/^application\/json\b/i.test(request.headers.get("content-type") ?? "")) return error("Send the draft as JSON.", 415);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return error("The request body is not valid JSON.", 400);
  }
  const { applicationId, text } = (body && typeof body === "object" ? body : {}) as { applicationId?: unknown; text?: unknown };
  if (typeof applicationId !== "string" || !applicationId.trim() || applicationId.length > 64) return error("Choose a school to check the draft against.", 400);
  if (typeof text !== "string") return error("The draft text is missing.", 400);
  if (!text.trim()) return error("Paste your draft first.", 400);
  if (text.length > MAX_DRAFT_CHARS) {
    return error(`This draft is longer than ${MAX_DRAFT_CHARS.toLocaleString("en-US")} characters. Check one essay at a time.`, 413);
  }

  const app = await getApplication(user.id, applicationId.trim());
  if (!app) return error("That school is not on your list.", 404);
  const school = getSchool(app.schoolId);
  if (!school) return error("Drafts for this school cannot be checked yet.", 404);

  const [student, applications] = await Promise.all([getStudent(user.id, app.studentId), listApplications(user.id, app.studentId)]);
  const others = applications.filter((a) => a.id !== app.id && a.schoolId !== app.schoolId);

  try {
    const result = await checkDraft({
      text,
      schoolId: app.schoolId,
      unitId: app.unitId,
      wordLimit: app.wordLimit,
      otherSchoolIds: others.map((a) => a.schoolId),
      otherSchools: others.map((a) => ({ schoolId: a.schoolId, unitId: a.unitId })),
      student: student
        ? { activities: student.activities ?? [], location: student.location, highSchool: student.highSchool }
        : undefined,
    });
    return json(result);
  } catch {
    return error("The draft could not be checked right now. Try again in a minute.", 500);
  }
}
