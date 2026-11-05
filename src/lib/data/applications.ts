/**
 * Applications: one school (and unit, and prompt) on a student's list.
 * Ownership is enforced through the student: an application is visible only to
 * the account that owns its student.
 */
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { applications, students } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import type { ApplicationInput, ApplicationStatus } from "@/lib/types";

export type ApplicationRow = typeof applications.$inferSelect;

export async function listApplications(userId: string, studentId: string): Promise<ApplicationRow[]> {
  const db = await getDb();
  const rows = await db
    .select({ app: applications })
    .from(applications)
    .innerJoin(students, eq(students.id, applications.studentId))
    .where(and(eq(applications.studentId, studentId), eq(students.ownerUserId, userId)))
    .orderBy(asc(applications.createdAt));
  return rows.map((r) => r.app);
}

/** All applications for a student (no ownership check; for background jobs). */
export async function listApplicationsForStudent(studentId: string): Promise<ApplicationRow[]> {
  const db = await getDb();
  return db.select().from(applications).where(eq(applications.studentId, studentId)).orderBy(asc(applications.createdAt));
}

export async function getApplication(userId: string, applicationId: string): Promise<ApplicationRow | null> {
  const db = await getDb();
  const rows = await db
    .select({ app: applications })
    .from(applications)
    .innerJoin(students, eq(students.id, applications.studentId))
    .where(and(eq(applications.id, applicationId), eq(students.ownerUserId, userId)))
    .limit(1);
  return rows[0]?.app ?? null;
}

/** No ownership check; for background jobs that already validated access. */
export async function getApplicationById(applicationId: string): Promise<ApplicationRow | null> {
  const db = await getDb();
  const rows = await db.select().from(applications).where(eq(applications.id, applicationId)).limit(1);
  return rows[0] ?? null;
}

export async function countApplicationsForUser(userId: string): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select({ id: applications.id })
    .from(applications)
    .innerJoin(students, eq(students.id, applications.studentId))
    .where(eq(students.ownerUserId, userId));
  return rows.length;
}

export async function createApplication(input: ApplicationInput): Promise<ApplicationRow> {
  const db = await getDb();
  const [row] = await db
    .insert(applications)
    .values({
      id: newId(),
      studentId: input.studentId,
      schoolId: input.schoolId,
      unitId: input.unitId,
      promptId: input.promptId,
      promptText: input.promptText.trim(),
      wordLimit: input.wordLimit,
      status: "queued",
      progress: 0,
    })
    .returning();
  return row;
}

export async function setApplicationStatus(
  applicationId: string,
  status: ApplicationStatus,
  progress?: number,
  error?: string | null,
): Promise<void> {
  const db = await getDb();
  await db
    .update(applications)
    .set({
      status,
      ...(progress !== undefined ? { progress: Math.max(0, Math.min(100, Math.round(progress))) } : {}),
      ...(error !== undefined ? { error } : {}),
      updatedAt: new Date(),
    })
    .where(eq(applications.id, applicationId));
}

export async function setApplicationProgress(applicationId: string, progress: number): Promise<void> {
  const db = await getDb();
  await db
    .update(applications)
    .set({ progress: Math.max(0, Math.min(100, Math.round(progress))), updatedAt: new Date() })
    .where(eq(applications.id, applicationId));
}

export async function deleteApplication(userId: string, applicationId: string): Promise<boolean> {
  const app = await getApplication(userId, applicationId);
  if (!app) return false;
  const db = await getDb();
  await db.delete(applications).where(eq(applications.id, applicationId));
  return true;
}
