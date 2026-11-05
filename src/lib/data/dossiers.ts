/**
 * Dossiers and share links.
 */
import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { applications, dossiers, shareLinks, students } from "@/lib/db/schema";
import { newToken } from "@/lib/ids";
import type { Dossier } from "@/lib/types";

export type DossierRow = typeof dossiers.$inferSelect;

export async function saveDossier(d: Dossier): Promise<void> {
  const db = await getDb();
  const lead = d.angles.find((a) => a.isLead)?.key ?? null;
  await db
    .insert(dossiers)
    .values({
      id: d.id,
      applicationId: d.applicationId,
      studentId: d.studentId,
      schoolId: d.schoolId,
      uniquenessScore: Math.round(d.uniquenessScore),
      leadAngleKey: lead,
      payload: d,
    })
    .onConflictDoUpdate({
      target: dossiers.id,
      set: { uniquenessScore: Math.round(d.uniquenessScore), leadAngleKey: lead, payload: d },
    });
}

/** Latest dossier for an application (owner-scoped). */
export async function getDossierForApplication(userId: string, applicationId: string): Promise<Dossier | null> {
  const db = await getDb();
  const rows = await db
    .select({ payload: dossiers.payload })
    .from(dossiers)
    .innerJoin(students, eq(students.id, dossiers.studentId))
    .where(and(eq(dossiers.applicationId, applicationId), eq(students.ownerUserId, userId)))
    .orderBy(desc(dossiers.createdAt))
    .limit(1);
  return rows[0]?.payload ?? null;
}

export async function getDossier(userId: string, dossierId: string): Promise<Dossier | null> {
  const db = await getDb();
  const rows = await db
    .select({ payload: dossiers.payload })
    .from(dossiers)
    .innerJoin(students, eq(students.id, dossiers.studentId))
    .where(and(eq(dossiers.id, dossierId), eq(students.ownerUserId, userId)))
    .limit(1);
  return rows[0]?.payload ?? null;
}

/** Latest dossier per application for a student (no ownership check; background use). */
export async function listLatestDossiersForStudent(studentId: string): Promise<Dossier[]> {
  const db = await getDb();
  const rows = await db
    .select({ payload: dossiers.payload, applicationId: dossiers.applicationId, createdAt: dossiers.createdAt })
    .from(dossiers)
    .innerJoin(applications, eq(applications.id, dossiers.applicationId))
    .where(eq(dossiers.studentId, studentId))
    .orderBy(desc(dossiers.createdAt));
  const seen = new Set<string>();
  const out: Dossier[] = [];
  for (const r of rows) {
    if (seen.has(r.applicationId)) continue;
    seen.add(r.applicationId);
    out.push(r.payload);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Share links                                                         */
/* ------------------------------------------------------------------ */

export async function createShareLink(userId: string, dossierId: string): Promise<string | null> {
  const d = await getDossier(userId, dossierId);
  if (!d) return null;
  const db = await getDb();
  const existing = await db
    .select({ token: shareLinks.token })
    .from(shareLinks)
    .where(and(eq(shareLinks.dossierId, dossierId), isNull(shareLinks.revokedAt)))
    .limit(1);
  if (existing[0]) return existing[0].token;
  const token = newToken(16);
  await db.insert(shareLinks).values({ token, dossierId, createdByUserId: userId });
  return token;
}

export async function getActiveShareToken(userId: string, dossierId: string): Promise<string | null> {
  const d = await getDossier(userId, dossierId);
  if (!d) return null;
  const db = await getDb();
  const rows = await db
    .select({ token: shareLinks.token })
    .from(shareLinks)
    .where(and(eq(shareLinks.dossierId, dossierId), isNull(shareLinks.revokedAt)))
    .limit(1);
  return rows[0]?.token ?? null;
}

export async function revokeShareLinks(userId: string, dossierId: string): Promise<void> {
  const d = await getDossier(userId, dossierId);
  if (!d) return;
  const db = await getDb();
  await db.update(shareLinks).set({ revokedAt: new Date() }).where(and(eq(shareLinks.dossierId, dossierId), isNull(shareLinks.revokedAt)));
}

/** Public lookup for /d/[token]. Returns null for unknown or revoked tokens. */
export async function getSharedDossier(token: string): Promise<Dossier | null> {
  if (!token || token.length > 64) return null;
  const db = await getDb();
  const rows = await db
    .select({ payload: dossiers.payload })
    .from(shareLinks)
    .innerJoin(dossiers, eq(dossiers.id, shareLinks.dossierId))
    .where(and(eq(shareLinks.token, token), isNull(shareLinks.revokedAt)))
    .limit(1);
  return rows[0]?.payload ?? null;
}
