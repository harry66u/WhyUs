/**
 * The plan summary shown in Settings: what the account has, what it has used,
 * what it can buy, and its purchase history. Everything is plain data (strings,
 * numbers, booleans) so it can be passed to client components as is.
 */
import { formatDate } from "@/lib/format";
import { getSchool, getUnit } from "@/lib/schools/registry";
import type { AccountRole, PurchaseKind } from "@/lib/types";
import { getBillingState } from "./entitlements";
import { type BillingConfig, countingRules, formatMoney, MAX_CREDITS_PER_PURCHASE, purchaseTitle } from "./plans";
import { checkPurchase, type PurchaseStatus } from "./rules";
import { simulationAvailable, stripeConfigured } from "./stripe";

export type PaymentsMode = "stripe" | "simulated" | "unavailable";

export function paymentsMode(): PaymentsMode {
  if (stripeConfigured()) return "stripe";
  return simulationAvailable() ? "simulated" : "unavailable";
}

export interface BuyAvailability {
  available: boolean;
  /** Why it cannot be bought right now. */
  reason: string | null;
}

export interface OverviewStudent {
  id: string;
  name: string;
  isSelf: boolean;
  schools: number;
  unlimitedEndsAt: string | null;
  unlimitedEndedAt: string | null;
  unlimited: BuyAvailability;
}

export interface OverviewPurchase {
  id: string;
  kind: PurchaseKind;
  title: string;
  amount: string;
  status: PurchaseStatus;
  date: string;
}

export interface BillingOverview {
  role: AccountRole | null;
  payments: PaymentsMode;
  prices: { school: string; unlimited: string; counselor: string; schoolCents: number };
  config: BillingConfig;
  maxCreditsPerPurchase: number;
  freeSchool: { available: boolean; usedFor: string | null };
  credits: { purchased: number; used: number; left: number };
  counselorPlan: { active: boolean; maxStudents: number; endsAt: string | null; endedAt: string | null };
  studentLimit: number;
  students: OverviewStudent[];
  schools: number;
  /** True when every school this account can add is covered by a plan. */
  everyStudentCovered: boolean;
  buy: { schoolCredit: BuyAvailability; counselor: BuyAvailability };
  purchases: OverviewPurchase[];
  rules: string[];
}

function day(date: Date | null): string | null {
  return date ? formatDate(date.toISOString()) : null;
}

function availability(check: { ok: true } | { ok: false; error: string }): BuyAvailability {
  return check.ok ? { available: true, reason: null } : { available: false, reason: check.error };
}

export async function getBillingOverview(userId: string, now: Date = new Date()): Promise<BillingOverview> {
  const { rows, input, state } = await getBillingState(userId, now);
  const config = input.config;

  const schoolsByStudent = new Map<string, number>();
  for (const a of rows.applications) schoolsByStudent.set(a.studentId, (schoolsByStudent.get(a.studentId) ?? 0) + 1);

  const freeApp = state.freeSchool.applicationId ? rows.applications.find((a) => a.id === state.freeSchool.applicationId) : undefined;
  let usedFor: string | null = null;
  if (freeApp) {
    const school = getSchool(freeApp.schoolId);
    const unit = school ? getUnit(school, freeApp.unitId) : undefined;
    const named = unit && school && school.units.length > 1 && unit.name !== school.name;
    usedFor = school ? (named ? `${school.name}, ${unit.name}` : school.name) : freeApp.schoolId;
  }

  const names = new Map(rows.students.map((s) => [s.id, s.name]));
  const students: OverviewStudent[] = rows.students.map((s) => {
    const active = state.unlimited.find((u) => u.studentId === s.id);
    const ended = state.endedUnlimited.find((u) => u.studentId === s.id);
    return {
      id: s.id,
      name: s.name,
      isSelf: s.isSelf,
      schools: schoolsByStudent.get(s.id) ?? 0,
      unlimitedEndsAt: day(active?.endsAt ?? null),
      unlimitedEndedAt: day(ended?.endedAt ?? null),
      unlimited: availability(checkPurchase(state, input, { kind: "unlimited", quantity: 1, studentId: s.id })),
    };
  });

  const purchases: OverviewPurchase[] = [...rows.purchases]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((p) => {
      let title = purchaseTitle(p.kind, p.quantity);
      if (p.kind === "unlimited") {
        const who = p.studentId ? names.get(p.studentId) : undefined;
        title = who ? `Unlimited schools for ${who}` : "Unlimited schools for a student who was deleted";
      }
      return { id: p.id, kind: p.kind, title, amount: formatMoney(p.amountCents, p.currency), status: p.status, date: formatDate(p.createdAt.toISOString()) };
    });

  return {
    role: rows.role,
    payments: paymentsMode(),
    prices: {
      school: formatMoney(config.schoolCents),
      unlimited: formatMoney(config.unlimitedCents),
      counselor: formatMoney(config.counselorCents),
      schoolCents: config.schoolCents,
    },
    config,
    maxCreditsPerPurchase: MAX_CREDITS_PER_PURCHASE,
    freeSchool: { available: state.freeSchool.available, usedFor },
    credits: state.credits,
    counselorPlan: {
      active: state.counselorPlan.active,
      maxStudents: state.counselorPlan.maxStudents,
      endsAt: day(state.counselorPlan.endsAt),
      endedAt: day(state.counselorPlan.endedAt),
    },
    studentLimit: state.studentLimit,
    students,
    schools: rows.applications.length,
    everyStudentCovered: state.entitlements.remainingSchools === Number.POSITIVE_INFINITY,
    buy: {
      schoolCredit: availability(checkPurchase(state, input, { kind: "school_credit", quantity: 1, studentId: null })),
      counselor: availability(checkPurchase(state, input, { kind: "counselor", quantity: 1, studentId: null })),
    },
    purchases,
    rules: countingRules(config),
  };
}
