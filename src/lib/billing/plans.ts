/**
 * Plans and prices.
 *
 * - School credit: one more school on any student's list. Default $9 (PRICE_SCHOOL_CENTS).
 * - Unlimited: every school for one student, for the application season
 *   (12 months from purchase). Default $29 (PRICE_UNLIMITED_CENTS).
 * - Counselor plan: every school for every student on a counselor account, up to
 *   COUNSELOR_MAX_STUDENTS students (default 25), for the application season.
 *   Default $199 (PRICE_COUNSELOR_CENTS).
 *
 * All three are one-time payments through Stripe Checkout; nothing renews. Prices
 * are read from the environment at call time, so a deployment can change them
 * without a code change.
 */
import { formatDate } from "@/lib/format";
import type { AccountRole, PurchaseKind } from "@/lib/types";

export const DEFAULT_PRICE_SCHOOL_CENTS = 900;
export const DEFAULT_PRICE_UNLIMITED_CENTS = 2900;
export const DEFAULT_PRICE_COUNSELOR_CENTS = 19900;
export const DEFAULT_COUNSELOR_MAX_STUDENTS = 25;

/** Unlimited and the counselor plan last one application season: 12 months from purchase. */
export const PLAN_TERM_DAYS = 365;
/** How the plan term is said in copy. Keep in step with PLAN_TERM_DAYS. */
export const PLAN_TERM_LABEL = "12 months";
/** Students a parent account can manage. */
export const PARENT_MAX_STUDENTS = 5;
/** Students a counselor account can manage without the counselor plan. */
export const COUNSELOR_STUDENTS_WITHOUT_PLAN = 3;
/** Most school credits one checkout can buy. */
export const MAX_CREDITS_PER_PURCHASE = 20;
/** Every price is charged in US dollars. */
export const CURRENCY = "usd";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Stripe's smallest USD charge is 50 cents. */
const MIN_PRICE_CENTS = 50;
const MAX_PRICE_CENTS = 10_000_000;

export interface BillingConfig {
  schoolCents: number;
  unlimitedCents: number;
  counselorCents: number;
  counselorMaxStudents: number;
}

type Env = Record<string, string | undefined>;

function intFromEnv(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw.trim());
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}

/** Current prices and limits. Invalid or missing values fall back to the defaults. */
export function billingConfig(env: Env = process.env): BillingConfig {
  return {
    schoolCents: intFromEnv(env.PRICE_SCHOOL_CENTS, DEFAULT_PRICE_SCHOOL_CENTS, MIN_PRICE_CENTS, MAX_PRICE_CENTS),
    unlimitedCents: intFromEnv(env.PRICE_UNLIMITED_CENTS, DEFAULT_PRICE_UNLIMITED_CENTS, MIN_PRICE_CENTS, MAX_PRICE_CENTS),
    counselorCents: intFromEnv(env.PRICE_COUNSELOR_CENTS, DEFAULT_PRICE_COUNSELOR_CENTS, MIN_PRICE_CENTS, MAX_PRICE_CENTS),
    counselorMaxStudents: intFromEnv(env.COUNSELOR_MAX_STUDENTS, DEFAULT_COUNSELOR_MAX_STUDENTS, 1, 1000),
  };
}

export const PURCHASE_KINDS: readonly PurchaseKind[] = ["school_credit", "unlimited", "counselor"];

export function isPurchaseKind(value: unknown): value is PurchaseKind {
  return typeof value === "string" && (PURCHASE_KINDS as readonly string[]).includes(value);
}

export function unitPriceCents(kind: PurchaseKind, config: BillingConfig): number {
  if (kind === "school_credit") return config.schoolCents;
  if (kind === "unlimited") return config.unlimitedCents;
  return config.counselorCents;
}

/** "$9", "$199", "$9.50", "$1,990". */
export function formatMoney(cents: number, currency: string = CURRENCY): string {
  const whole = cents % 100 === 0;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(whole ? 0 : 2)} ${currency.toUpperCase()}`;
  }
}

export const PLAN_NAMES: Record<PurchaseKind, string> = {
  school_credit: "School credit",
  unlimited: "Unlimited",
  counselor: "Counselor plan",
};

/** What a purchase bought, for receipts and the purchase history: "3 school credits". */
export function purchaseTitle(kind: PurchaseKind, quantity: number): string {
  if (kind === "school_credit") return quantity === 1 ? "1 school credit" : `${quantity} school credits`;
  if (kind === "unlimited") return "Unlimited schools for one student";
  return quantity > 1 ? `Counselor plan (${quantity} plans)` : "Counselor plan";
}

/** When an unlimited or counselor plan bought at `purchasedAt` stops applying. */
export function planEndsAt(purchasedAt: Date): Date {
  return new Date(purchasedAt.getTime() + PLAN_TERM_DAYS * DAY_MS);
}

export const ACCOUNT_TYPE_LABELS: Record<AccountRole, string> = {
  student: "Student",
  parent: "Parent",
  counselor: "Counselor",
};

/** Smallest number of schools for which unlimited costs less than buying credits. */
export function unlimitedBreakEven(config: BillingConfig): number {
  return Math.floor(config.unlimitedCents / config.schoolCents) + 1;
}

/**
 * How schools are counted, in plain language. The pricing page and Settings
 * both show these, so the rules are stated once.
 */
export function countingRules(config: BillingConfig = billingConfig()): string[] {
  return [
    "Your account's first school is free.",
    `After that, each school uses one school credit (${formatMoney(config.schoolCents)}). Credits never expire and work for any student on the account.`,
    `Unlimited (${formatMoney(config.unlimitedCents)}) covers every school for one student for ${PLAN_TERM_LABEL}, without using credits.`,
    `The counselor plan (${formatMoney(config.counselorCents)}) covers every school for every student on a counselor account, up to ${config.counselorMaxStudents} students, for ${PLAN_TERM_LABEL}.`,
    "A school is one school and the college you apply to within it, so two colleges at the same university count as two schools.",
    "Removing a school returns its credit. The free school does not come back once you have bought credits.",
  ];
}

/** "Ends Nov 6, 2027" style date used across billing copy. */
export function planDate(date: Date): string {
  return formatDate(date.toISOString());
}

/** Refunds within this many days of purchase, no questions asked (stated on the pricing page). */
export const REFUND_WINDOW_DAYS = 14;

/** Where people write about refunds and privacy (SUPPORT_EMAIL). Null when not configured. */
export function supportEmail(env: Env = process.env): string | null {
  const value = env.SUPPORT_EMAIL?.trim();
  return value && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) ? value : null;
}
