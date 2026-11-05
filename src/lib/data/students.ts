/**
 * Student profiles. Every read and write is scoped to the owning account:
 * callers pass the signed-in user's id and get nothing back for students they
 * do not own.
 */
import { and, asc, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db/client";
import { students } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import type { Activity, StudentProfile } from "@/lib/types";

export type StudentRow = typeof students.$inferSelect;

export const ACTIVE_STUDENT_COOKIE = "whyus_student";

export function toProfile(row: StudentRow): StudentProfile {
  return {
    id: row.id,
    name: row.name,
    graduationYear: row.graduationYear,
    highSchool: row.highSchool ?? undefined,
    location: row.location ?? undefined,
    intendedMajors: row.intendedMajors ?? [],
    interests: row.interests ?? [],
    activities: row.activities ?? [],
  };
}

export async function listStudents(userId: string): Promise<StudentRow[]> {
  const db = await getDb();
  return db.select().from(students).where(eq(students.ownerUserId, userId)).orderBy(asc(students.createdAt));
}

export async function getStudent(userId: string, studentId: string): Promise<StudentRow | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(students)
    .where(and(eq(students.id, studentId), eq(students.ownerUserId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

/** Internal use (background jobs) where ownership was checked earlier. */
export async function getStudentById(studentId: string): Promise<StudentRow | null> {
  const db = await getDb();
  const rows = await db.select().from(students).where(eq(students.id, studentId)).limit(1);
  return rows[0] ?? null;
}

export interface StudentInput {
  name: string;
  graduationYear: number;
  highSchool?: string | null;
  location?: string | null;
  intendedMajors?: string[];
  interests?: string[];
  activities?: Activity[];
  activitiesSource?: string | null;
  isSelf?: boolean;
}

export async function createStudent(userId: string, input: StudentInput): Promise<StudentRow> {
  const db = await getDb();
  const [row] = await db
    .insert(students)
    .values({
      id: newId(),
      ownerUserId: userId,
      name: input.name.trim(),
      graduationYear: input.graduationYear,
      highSchool: input.highSchool ?? null,
      location: input.location ?? null,
      intendedMajors: input.intendedMajors ?? [],
      interests: input.interests ?? [],
      activities: input.activities ?? [],
      activitiesSource: input.activitiesSource ?? null,
      isSelf: input.isSelf ?? false,
    })
    .returning();
  return row;
}

export async function updateStudent(userId: string, studentId: string, patch: Partial<StudentInput>): Promise<StudentRow | null> {
  const db = await getDb();
  const values: Partial<typeof students.$inferInsert> = { updatedAt: new Date() };
  if (patch.name !== undefined) values.name = patch.name.trim();
  if (patch.graduationYear !== undefined) values.graduationYear = patch.graduationYear;
  if (patch.highSchool !== undefined) values.highSchool = patch.highSchool;
  if (patch.location !== undefined) values.location = patch.location;
  if (patch.intendedMajors !== undefined) values.intendedMajors = patch.intendedMajors;
  if (patch.interests !== undefined) values.interests = patch.interests;
  if (patch.activities !== undefined) values.activities = patch.activities;
  if (patch.activitiesSource !== undefined) values.activitiesSource = patch.activitiesSource;
  const [row] = await db
    .update(students)
    .set(values)
    .where(and(eq(students.id, studentId), eq(students.ownerUserId, userId)))
    .returning();
  return row ?? null;
}

export async function deleteStudent(userId: string, studentId: string): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .delete(students)
    .where(and(eq(students.id, studentId), eq(students.ownerUserId, userId)))
    .returning({ id: students.id });
  return rows.length > 0;
}

/**
 * The student the signed-in account is currently working on: the one picked in
 * the student switcher (cookie), else the first one. Null when none exist yet.
 */
export async function getActiveStudent(userId: string): Promise<StudentRow | null> {
  const all = await listStudents(userId);
  if (all.length === 0) return null;
  const jar = await cookies();
  const picked = jar.get(ACTIVE_STUDENT_COOKIE)?.value;
  return all.find((s) => s.id === picked) ?? all[0];
}
