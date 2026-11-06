/**
 * Entitlement rules. Pure and deterministic: the answer depends only on the
 * account type, its student profiles, the schools on their lists now, the
 * account's purchases, and the current time.
 *
 * 1. Covered schools. Every school of a student with active unlimited, and every
 *    school on an account with an active counselor plan, is covered. Covered
 *    schools never use the free school or credits.
 * 2. Free school. The account's first school is free. It counts as used once a
 *    school that is not covered is on a list, or once the account has bought school
 *    credits. Plans (unlimited, counselor) do not use it: buying one never costs
 *    the free school.
 * 3. Credits. Each school credit adds one school. Schools that are not covered use
 *    the free school first, then credits.
 * 4. Removing a school. The database keeps no record of removed schools (and this
 *    module may not add one), so usage is counted from the schools on the lists now:
 *    - removing a school that used a credit returns that credit;
 *    - once the account has bought credits, the free school stays with the school
 *      it was used for: it covers the earliest uncovered school still listed that
 *      was added before the first credit purchase, and nothing else. Removing that
 *      school does not bring the free school back;
 *    - before any credit purchase, removing the only uncovered school makes the
 *      free school available again. That gives nothing a second sign-up email
 *      would not, so it is not worth a durable counter.
 *    A checkout for credits is refused while the free school is unused, so buying
 *    credits never costs anyone their free school either.
 * 5. Students. A student account has one profile, its own. A parent account
 *    manages up to 5 students. A counselor account manages up to 3, or up to
 *    COUNSELOR_MAX_STUDENTS for each active counselor plan.
 * 6. Purchases count when paid. Refunded purchases never count; simulated ones
 *    (development without Stripe) count only outside production.
 */
import { formatDate } from "@/lib/format";
import type { AccountRole, Entitlements, PurchaseKind } from "@/lib/types";
import {
  type BillingConfig,
  COUNSELOR_STUDENTS_WITHOUT_PLAN,
  formatMoney,
  MAX_CREDITS_PER_PURCHASE,
  PARENT_MAX_STUDENTS,
  PURCHASE_KINDS,
  planEndsAt,
} from "./plans";

export type PurchaseStatus = "paid" | "refunded" | "simulated";

export interface BillingPurchase {
  id: string;
  kind: PurchaseKind;
  quantity: number;
  /** The student an unlimited purchase applies to. */
  studentId: string | null;
  status: PurchaseStatus;
  createdAt: Date;
}

export interface BillingStudent {
  id: string;
  name?: string;
  createdAt?: Date;
}

export interface BillingApplication {
  id: string;
  studentId: string;
  createdAt: Date;
}

export interface BillingInput {
  role: AccountRole | null;
  students: BillingStudent[];
  applications: BillingApplication[];
  purchases: BillingPurchase[];
  now: Date;
  config: BillingConfig;
  /** Whether simulated purchases count (true outside production). */
  countSimulated: boolean;
}

export interface BillingState {
  /** The shared contract read by the dashboard and other modules. */
  entitlements: Entitlements;
  freeSchool: {
    available: boolean;
    /** The school on a list that the free school currently covers, if any. */
    applicationId: string | null;
  };
  credits: { purchased: number; used: number; left: number };
  /** Active unlimited plans for students on the account. */
  unlimited: { studentId: string; endsAt: Date }[];
  /** Unlimited plans that ended, for students without an active one. */
  endedUnlimited: { studentId: string; endedAt: Date }[];
  counselorPlan: { active: boolean; maxStudents: number; endsAt: Date | null; endedAt: Date | null };
  /** Schools covered by unlimited or the counselor plan. */
  coveredApplicationIds: string[];
  /** How many student profiles the account may have. */
  studentLimit: number;
  /** Whether at least one purchase counts (paid, or simulated in development). */
  hasPurchases: boolean;
}

export type AddSchoolCheck = { ok: true; uses: "free" | "credit" | "unlimited" | "counselor" } | { ok: false; reason: string };
export type AddStudentCheck = { ok: true } | { ok: false; reason: string };

function byCreated<T extends { createdAt: Date; id: string }>(a: T, b: T): number {
  return a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

function latest(dates: Date[]): Date | null {
  return dates.reduce<Date | null>((max, d) => (!max || d > max ? d : max), null);
}

export function purchaseCounts(p: Pick<BillingPurchase, "status">, countSimulated: boolean): boolean {
  return p.status === "paid" || (p.status === "simulated" && countSimulated);
}

export function studentLimitFor(role: AccountRole | null, counselor: { active: boolean; maxStudents: number }): number {
  if (role === "parent") return counselor.active ? Math.max(PARENT_MAX_STUDENTS, counselor.maxStudents) : PARENT_MAX_STUDENTS;
  if (role === "counselor") return counselor.active ? counselor.maxStudents : COUNSELOR_STUDENTS_WITHOUT_PLAN;
  return 1;
}

export function computeBilling(input: BillingInput): BillingState {
  const { now, config } = input;
  const valid = input.purchases.filter((p) => purchaseCounts(p, input.countSimulated));
  const isActive = (p: BillingPurchase) => planEndsAt(p.createdAt).getTime() > now.getTime();

  // Counselor plan: each active plan adds config.counselorMaxStudents seats.
  const counselorBuys = valid.filter((p) => p.kind === "counselor");
  const activeCounselor = counselorBuys.filter(isActive);
  const counselorActive = activeCounselor.length > 0;
  const plans = activeCounselor.reduce((n, p) => n + Math.max(1, p.quantity), 0);
  const counselorPlan = {
    active: counselorActive,
    maxStudents: config.counselorMaxStudents * Math.max(1, plans),
    endsAt: counselorActive ? latest(activeCounselor.map((p) => planEndsAt(p.createdAt))) : null,
    endedAt: !counselorActive && counselorBuys.length > 0 ? latest(counselorBuys.map((p) => planEndsAt(p.createdAt))) : null,
  };

  // Unlimited, per student on the account.
  const studentIds = new Set(input.students.map((s) => s.id));
  const unlimitedEnds = new Map<string, Date>();
  const unlimitedEnded = new Map<string, Date>();
  for (const p of valid) {
    if (p.kind !== "unlimited" || !p.studentId || !studentIds.has(p.studentId)) continue;
    const ends = planEndsAt(p.createdAt);
    const target = isActive(p) ? unlimitedEnds : unlimitedEnded;
    const prev = target.get(p.studentId);
    if (!prev || ends > prev) target.set(p.studentId, ends);
  }
  for (const id of unlimitedEnds.keys()) unlimitedEnded.delete(id);

  const covered = (studentId: string) => counselorActive || unlimitedEnds.has(studentId);
  const apps = [...input.applications].sort(byCreated);
  const coveredApps = apps.filter((a) => covered(a.studentId));
  const uncovered = apps.filter((a) => !covered(a.studentId));

  // The free school: unused until an uncovered school is listed or credits are bought.
  const creditBuys = valid.filter((p) => p.kind === "school_credit");
  const firstCreditBuy = creditBuys.length > 0 ? creditBuys.reduce((min, p) => (p.createdAt < min ? p.createdAt : min), creditBuys[0].createdAt) : null;
  const freeAvailable = uncovered.length === 0 && creditBuys.length === 0;
  const earliest = uncovered[0];
  const freeApp = earliest && (firstCreditBuy === null || earliest.createdAt < firstCreditBuy) ? earliest : null;

  const purchased = creditBuys.reduce((n, p) => n + Math.max(0, p.quantity), 0);
  const used = uncovered.length - (freeApp ? 1 : 0);
  const left = Math.max(0, purchased - used);

  const everyStudentCovered = input.students.length > 0 && input.students.every((s) => covered(s.id));
  const remainingSchools = counselorActive || everyStudentCovered ? Number.POSITIVE_INFINITY : (freeAvailable ? 1 : 0) + left;

  const unlimited = [...unlimitedEnds].map(([studentId, endsAt]) => ({ studentId, endsAt }));
  return {
    entitlements: {
      remainingSchools,
      freeSchoolAvailable: freeAvailable,
      credits: left,
      unlimitedStudentIds: unlimited.map((u) => u.studentId),
      counselorPlan: { active: counselorPlan.active, maxStudents: counselorPlan.maxStudents },
    },
    freeSchool: { available: freeAvailable, applicationId: freeApp?.id ?? null },
    credits: { purchased, used, left },
    unlimited,
    endedUnlimited: [...unlimitedEnded].map(([studentId, endedAt]) => ({ studentId, endedAt })),
    counselorPlan,
    coveredApplicationIds: coveredApps.map((a) => a.id),
    studentLimit: studentLimitFor(input.role, counselorPlan),
    hasPurchases: valid.length > 0,
  };
}

function day(date: Date): string {
  return formatDate(date.toISOString());
}

/** Whether one more school can be added for `studentId`, and what it would use. */
export function checkAddSchool(state: BillingState, input: BillingInput, studentId: string): AddSchoolCheck {
  if (!input.students.some((s) => s.id === studentId)) {
    return { ok: false, reason: "That student profile could not be found. Reload the page and try again." };
  }
  if (state.counselorPlan.active) return { ok: true, uses: "counselor" };
  if (state.unlimited.some((u) => u.studentId === studentId)) return { ok: true, uses: "unlimited" };
  if (state.freeSchool.available) return { ok: true, uses: "free" };
  if (state.credits.left > 0) return { ok: true, uses: "credit" };

  const credit = formatMoney(input.config.schoolCents);
  const unlimited = formatMoney(input.config.unlimitedCents);
  const parts: string[] = [];
  const ended = state.endedUnlimited.find((u) => u.studentId === studentId);
  if (input.role === "counselor" && state.counselorPlan.endedAt) parts.push(`Your counselor plan ended on ${day(state.counselorPlan.endedAt)}.`);
  else if (ended) parts.push(`Unlimited schools for this student ended on ${day(ended.endedAt)}.`);
  parts.push(state.credits.purchased > 0 ? "You have used your free school and all of your school credits." : "You have used your free school.");
  if (input.role === "student") parts.push(`Buy a school credit for ${credit}, or unlimited schools for ${unlimited}.`);
  else if (input.role === "counselor") {
    parts.push(`Buy a school credit for ${credit}, unlimited schools for this student for ${unlimited}, or the counselor plan to cover every student.`);
  } else parts.push(`Buy a school credit for ${credit}, or unlimited schools for this student for ${unlimited}.`);
  return { ok: false, reason: parts.join(" ") };
}

/** Whether the account can create one more student profile. */
export function checkAddStudent(state: BillingState, input: BillingInput): AddStudentCheck {
  if (input.students.length < state.studentLimit) return { ok: true };
  if (input.role === "student" || input.role === null) {
    return { ok: false, reason: "A student account has one profile, its own. Parent and counselor accounts can manage several students." };
  }
  if (input.role === "parent") {
    return {
      ok: false,
      reason: `Parent accounts can manage up to ${state.studentLimit} students. Delete a student you no longer need to add another.`,
    };
  }
  if (state.counselorPlan.active) {
    return {
      ok: false,
      reason: `Your counselor plan covers up to ${state.studentLimit} students. Add another plan for ${input.config.counselorMaxStudents} more, or delete students who have finished.`,
    };
  }
  return {
    ok: false,
    reason: `Without the counselor plan, a counselor account can manage up to ${COUNSELOR_STUDENTS_WITHOUT_PLAN} students. The plan covers up to ${input.config.counselorMaxStudents} students with every school included.`,
  };
}

/* ------------------------------------------------------------------ */
/* Purchase requests (checkout and simulated checkout)                 */
/* ------------------------------------------------------------------ */

export interface PurchaseRequest {
  kind: PurchaseKind;
  quantity: number;
  studentId: string | null;
}

export type ParsedPurchase = { ok: true; value: PurchaseRequest } | { ok: false; error: string };

/** Validates the shape of a `{ kind, quantity?, studentId? }` request body. */
export function parsePurchaseRequest(body: unknown): ParsedPurchase {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "Send a JSON body such as {\"kind\": \"school_credit\", \"quantity\": 1}." };
  const { kind, quantity, studentId } = body as Record<string, unknown>;
  if (typeof kind !== "string" || !(PURCHASE_KINDS as readonly string[]).includes(kind)) {
    return { ok: false, error: "Choose what to buy: school_credit, unlimited, or counselor." };
  }
  const k = kind as PurchaseKind;
  let qty = 1;
  if (quantity !== undefined && quantity !== null) {
    if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1) return { ok: false, error: "Quantity must be a whole number of at least 1." };
    if (k !== "school_credit" && quantity !== 1) return { ok: false, error: "Plans are bought one at a time." };
    if (quantity > MAX_CREDITS_PER_PURCHASE) return { ok: false, error: `Buy up to ${MAX_CREDITS_PER_PURCHASE} school credits at a time.` };
    qty = quantity;
  }
  if (k === "unlimited") {
    if (typeof studentId !== "string" || !studentId.trim() || studentId.length > 64) return { ok: false, error: "Choose the student unlimited is for." };
    return { ok: true, value: { kind: k, quantity: 1, studentId: studentId.trim() } };
  }
  return { ok: true, value: { kind: k, quantity: qty, studentId: null } };
}

export type PurchaseCheck = { ok: true } | { ok: false; status: 403 | 404 | 409; error: string };

/** Whether this account can buy this right now (refuses purchases that would do nothing). */
export function checkPurchase(state: BillingState, input: BillingInput, req: PurchaseRequest): PurchaseCheck {
  if (req.kind === "school_credit") {
    if (state.freeSchool.available) return { ok: false, status: 409, error: "Your first school is free. Add it before you buy credits." };
    if (state.counselorPlan.active) return { ok: false, status: 409, error: "Your counselor plan already covers every school." };
    if (input.role === "student" && state.entitlements.remainingSchools === Number.POSITIVE_INFINITY) {
      return { ok: false, status: 409, error: "Unlimited already covers every school on your list." };
    }
    return { ok: true };
  }
  if (req.kind === "unlimited") {
    const student = input.students.find((s) => s.id === req.studentId);
    if (!student) return { ok: false, status: 404, error: "That student profile could not be found. Reload the page and try again." };
    if (state.counselorPlan.active) return { ok: false, status: 409, error: "Your counselor plan already covers every student." };
    const active = state.unlimited.find((u) => u.studentId === student.id);
    if (active) {
      const who = input.role === "student" ? "You already have" : `${student.name ?? "This student"} already has`;
      return { ok: false, status: 409, error: `${who} unlimited schools until ${day(active.endsAt)}.` };
    }
    return { ok: true };
  }
  if (input.role !== "counselor") return { ok: false, status: 403, error: "The counselor plan is for counselor accounts." };
  return { ok: true };
}
