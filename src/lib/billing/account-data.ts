/**
 * "Download my data": everything WhyUs stores for one account, as one JSON
 * document. Every query is scoped to the account; nothing from other accounts
 * or from the shared school research is included.
 */
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { applications, dossiers, purchases, researchRuns, shareLinks, students, users } from "@/lib/db/schema";
import { getSchool, getUnit } from "@/lib/schools/registry";
import type { AccountRole, Activity, Dossier, PurchaseKind } from "@/lib/types";

export const EXPORT_FORMAT = "whyus-account-export";
export const EXPORT_VERSION = 1;

export interface AccountExport {
  format: typeof EXPORT_FORMAT;
  version: number;
  exportedAt: string;
  notes: string[];
  account: { email: string; name: string | null; accountType: AccountRole | null; createdAt: string; updatedAt: string };
  students: {
    id: string;
    name: string;
    graduationYear: number;
    highSchool: string | null;
    location: string | null;
    intendedMajors: string[];
    interests: string[];
    activities: Activity[];
    activitiesSource: string | null;
    ownProfile: boolean;
    createdAt: string;
    updatedAt: string;
  }[];
  applications: {
    id: string;
    studentId: string;
    schoolId: string;
    schoolName: string | null;
    unitId: string | null;
    unitName: string | null;
    promptId: string | null;
    promptText: string;
    wordLimit: number | null;
    status: string;
    progress: number;
    error: string | null;
    createdAt: string;
    updatedAt: string;
  }[];
  dossiers: { id: string; applicationId: string; studentId: string; schoolId: string; uniquenessScore: number; createdAt: string; dossier: Dossier }[];
  researchRuns: { id: string; applicationId: string; status: string; engine: string; startedAt: string; finishedAt: string | null; error: string | null }[];
  shareLinks: { dossierId: string; url: string | null; createdAt: string; revokedAt: string | null }[];
  purchases: {
    id: string;
    kind: PurchaseKind;
    quantity: number;
    studentId: string | null;
    amountCents: number;
    currency: string;
    status: string;
    stripeCheckoutSessionId: string | null;
    createdAt: string;
  }[];
}

const iso = (d: Date) => d.toISOString();
const isoOrNull = (d: Date | null) => (d ? d.toISOString() : null);

export async function buildAccountExport(userId: string, opts: { origin: string; now?: Date }): Promise<AccountExport | null> {
  const db = await getDb();
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return null;

  const owned = eq(students.ownerUserId, userId);
  const [studentRows, appRows, dossierRows, runRows, linkRows, purchaseRows] = await Promise.all([
    db.select().from(students).where(owned).orderBy(asc(students.createdAt)),
    db
      .select({ app: applications })
      .from(applications)
      .innerJoin(students, eq(students.id, applications.studentId))
      .where(owned)
      .orderBy(asc(applications.createdAt)),
    db
      .select({ dossier: dossiers })
      .from(dossiers)
      .innerJoin(students, eq(students.id, dossiers.studentId))
      .where(owned)
      .orderBy(asc(dossiers.createdAt)),
    db
      .select({ run: researchRuns })
      .from(researchRuns)
      .innerJoin(applications, eq(applications.id, researchRuns.applicationId))
      .innerJoin(students, eq(students.id, applications.studentId))
      .where(owned)
      .orderBy(asc(researchRuns.startedAt)),
    db
      .select({ link: shareLinks })
      .from(shareLinks)
      .innerJoin(dossiers, eq(dossiers.id, shareLinks.dossierId))
      .innerJoin(students, eq(students.id, dossiers.studentId))
      .where(owned)
      .orderBy(asc(shareLinks.createdAt)),
    db.select().from(purchases).where(eq(purchases.userId, userId)).orderBy(asc(purchases.createdAt)),
  ]);

  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: iso(opts.now ?? new Date()),
    notes: [
      "This file holds everything WhyUs stores for this account: the account, student profiles, schools and prompts, dossiers, research runs, share links, and purchases.",
      "Shared school research (official pages and verified facts) is not included: it contains no student data and is the same for every account.",
      "Card details are held by Stripe, never by WhyUs.",
    ],
    account: { email: user.email, name: user.name, accountType: user.role, createdAt: iso(user.createdAt), updatedAt: iso(user.updatedAt) },
    students: studentRows.map((s) => ({
      id: s.id,
      name: s.name,
      graduationYear: s.graduationYear,
      highSchool: s.highSchool,
      location: s.location,
      intendedMajors: s.intendedMajors ?? [],
      interests: s.interests ?? [],
      activities: s.activities ?? [],
      activitiesSource: s.activitiesSource,
      ownProfile: s.isSelf,
      createdAt: iso(s.createdAt),
      updatedAt: iso(s.updatedAt),
    })),
    applications: appRows.map(({ app }) => {
      const school = getSchool(app.schoolId);
      const unit = school ? getUnit(school, app.unitId) : undefined;
      return {
        id: app.id,
        studentId: app.studentId,
        schoolId: app.schoolId,
        schoolName: school?.name ?? null,
        unitId: app.unitId,
        unitName: unit?.name ?? null,
        promptId: app.promptId,
        promptText: app.promptText,
        wordLimit: app.wordLimit,
        status: app.status,
        progress: app.progress,
        error: app.error,
        createdAt: iso(app.createdAt),
        updatedAt: iso(app.updatedAt),
      };
    }),
    dossiers: dossierRows.map(({ dossier: d }) => ({
      id: d.id,
      applicationId: d.applicationId,
      studentId: d.studentId,
      schoolId: d.schoolId,
      uniquenessScore: d.uniquenessScore,
      createdAt: iso(d.createdAt),
      dossier: d.payload,
    })),
    researchRuns: runRows.map(({ run }) => ({
      id: run.id,
      applicationId: run.applicationId,
      status: run.status,
      engine: run.engine,
      startedAt: iso(run.startedAt),
      finishedAt: isoOrNull(run.finishedAt),
      error: run.error,
    })),
    shareLinks: linkRows.map(({ link }) => ({
      dossierId: link.dossierId,
      url: link.revokedAt ? null : new URL(`/d/${encodeURIComponent(link.token)}`, opts.origin).toString(),
      createdAt: iso(link.createdAt),
      revokedAt: isoOrNull(link.revokedAt),
    })),
    purchases: purchaseRows.map((p) => ({
      id: p.id,
      kind: p.kind,
      quantity: p.quantity,
      studentId: p.studentId,
      amountCents: p.amountCents,
      currency: p.currency,
      status: p.status,
      stripeCheckoutSessionId: p.stripeSessionId,
      createdAt: iso(p.createdAt),
    })),
  };
}

/** "whyus-data-2026-11-06.json" */
export function exportFilename(now: Date = new Date()): string {
  return `whyus-data-${now.toISOString().slice(0, 10)}.json`;
}

/** Where the browser goes after the account is deleted. */
export const DELETED_REDIRECT = "/?deleted=1";

/** Deleting the account is confirmed by typing its email address (case and outer spaces ignored). */
export function confirmationMatches(typed: unknown, email: string): boolean {
  return typeof typed === "string" && typed.trim().toLowerCase() === email.trim().toLowerCase();
}
