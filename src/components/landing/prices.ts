/**
 * Price figures for the landing page's pricing summary. Read from the same
 * environment variables the billing module uses (see .env.example), with the
 * same defaults, at build time (the landing page is static).
 */

export interface LandingPrices {
  /** One more school, e.g. "$9". */
  perSchool: string;
  /** Unlimited schools for one student, e.g. "$29". */
  unlimited: string;
}

function cents(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/** 900 -> "$9", 1250 -> "$12.50" */
export function formatPrice(amountCents: number): string {
  return amountCents % 100 === 0 ? `$${amountCents / 100}` : `$${(amountCents / 100).toFixed(2)}`;
}

export function landingPrices(env: Record<string, string | undefined> = process.env): LandingPrices {
  return {
    perSchool: formatPrice(cents(env.PRICE_SCHOOL_CENTS, 900)),
    unlimited: formatPrice(cents(env.PRICE_UNLIMITED_CENTS, 2900)),
  };
}
