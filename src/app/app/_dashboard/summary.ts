/**
 * Dashboard rows: one per school on a student's list, shaped for the list UI
 * and for the polling endpoint (GET /api/applications).
 * Server-only (reads the database).
 */
import { type ApplicationRow, listApplications } from "@/lib/data/applications";
import { listLatestDossiersForStudent } from "@/lib/data/dossiers";
import type { StudentRow } from "@/lib/data/students";
import { getSchool, getUnit } from "@/lib/schools/registry";
import type { Dossier, Entitlements, School } from "@/lib/types";
import type { DashboardRow } from "./rows";

export type { DashboardRow } from "./rows";

function excerpt(text: string, max = 90): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > 40 ? cut.slice(0, space) : cut).replace(/[\s,;:.]+$/, "")}…`;
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function summarizeApplications(
  apps: ApplicationRow[],
  dossiers: Dossier[],
  opts: { profileUpdatedAt?: Date | string | null; lookupSchool?: (id: string) => School | undefined } = {},
): DashboardRow[] {
  const lookup = opts.lookupSchool ?? getSchool;
  const byApplication = new Map(dossiers.map((d) => [d.applicationId, d]));
  const profileUpdated = toIso(opts.profileUpdatedAt);
  return apps.map((app) => {
    const school = lookup(app.schoolId);
    const unit = school ? getUnit(school, app.unitId) : undefined;
    const libraryPrompt = app.promptId ? school?.prompts.find((p) => p.id === app.promptId) : undefined;
    const dossier = app.status === "ready" ? byApplication.get(app.id) : undefined;
    const lead = dossier ? (dossier.angles.find((a) => a.isLead) ?? dossier.angles[0]) : undefined;
    const ready = app.status === "ready";
    return {
      id: app.id,
      schoolId: app.schoolId,
      schoolName: school?.name ?? dossier?.schoolName ?? app.schoolId,
      unitName: unit?.name ?? dossier?.unitName ?? null,
      promptTitle: libraryPrompt?.title ?? excerpt(app.promptText),
      promptIsCustom: !libraryPrompt,
      wordLimit: app.wordLimit ?? null,
      status: app.status,
      progress: ready ? 100 : Math.max(0, Math.min(100, app.progress ?? 0)),
      error: app.status === "failed" ? app.error ?? null : null,
      uniquenessScore: dossier ? Math.round(dossier.uniquenessScore) : null,
      leadAngle: lead?.line ?? null,
      updatedAt: toIso(app.updatedAt) ?? new Date(0).toISOString(),
      href: ready ? `/app/schools/${app.id}` : `/app/schools/${app.id}/research`,
      profileChangedSinceResearch: Boolean(dossier && profileUpdated && toIso(dossier.generatedAt) && profileUpdated > (toIso(dossier.generatedAt) as string)),
    };
  });
}

/** Rows for one student. The caller must have checked that `userId` owns `student`. */
export async function loadDashboardRows(userId: string, student: Pick<StudentRow, "id" | "updatedAt">): Promise<DashboardRow[]> {
  const [apps, dossiers] = await Promise.all([listApplications(userId, student.id), listLatestDossiersForStudent(student.id)]);
  return summarizeApplications(apps, dossiers, { profileUpdatedAt: student.updatedAt });
}

export interface EntitlementHint {
  text: string;
  /** Shown as a link after the text when buying more is the next step. */
  action?: { label: string; href: string };
}

/** One line about what the account can still add for this student. */
export function entitlementHint(ent: Entitlements, studentId: string): EntitlementHint {
  if (ent.unlimitedStudentIds.includes(studentId)) return { text: "Unlimited schools for this student." };
  if (ent.counselorPlan.active) return { text: "Covered by your counselor plan." };
  if (ent.remainingSchools === Number.POSITIVE_INFINITY) return { text: "Unlimited schools." };
  if (ent.freeSchoolAvailable) return { text: "Your first school is free." };
  if (ent.credits > 0) return { text: ent.credits === 1 ? "1 school credit left." : `${ent.credits} school credits left.` };
  return { text: "No school credits left.", action: { label: "See plans", href: "/app/settings#plan" } };
}
