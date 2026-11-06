/**
 * Stripe Checkout for one-time purchases, and the webhook that records them.
 *
 * - Checkout Sessions use inline `price_data`, so no products or prices need to be
 *   set up in the Stripe dashboard; prices come from ./plans (environment).
 * - Session metadata carries userId, kind, quantity and (for unlimited) studentId.
 *   Nothing else about the student is sent to Stripe: no names, no profile data.
 * - Purchases are recorded from the signed webhook (checkout.session.completed and
 *   checkout.session.async_payment_succeeded, when paid), and again from the
 *   success page so the plan shows up at once. Both paths go through
 *   recordPurchase, which is idempotent on the Checkout Session id.
 * - charge.refunded (full refunds) marks the purchase refunded; refunded purchases
 *   stop counting toward entitlements.
 * - Without STRIPE_SECRET_KEY, development offers a simulated checkout instead
 *   (POST /api/billing/simulate); production reports payments as unavailable.
 */
import Stripe from "stripe";
import type { PurchaseKind } from "@/lib/types";
import { type BillingConfig, CURRENCY, isPurchaseKind, MAX_CREDITS_PER_PURCHASE, PLAN_TERM_LABEL, unitPriceCents } from "./plans";
import { markRefunded, type NewPurchase, type PurchaseRow, recordPurchase, userExists } from "./purchases";
import type { PurchaseRequest } from "./rules";

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

/** Development without Stripe keys: purchases can be simulated. Never in production. */
export function simulationAvailable(): boolean {
  return !stripeConfigured() && process.env.NODE_ENV !== "production";
}

let cached: { key: string; client: Stripe } | null = null;

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error("Stripe is not configured (set STRIPE_SECRET_KEY)");
  if (!cached || cached.key !== key) {
    cached = { key, client: new Stripe(key, { maxNetworkRetries: 2, timeout: 20_000, appInfo: { name: "WhyUs" } }) };
  }
  return cached.client;
}

/* ------------------------------------------------------------------ */
/* Checkout                                                            */
/* ------------------------------------------------------------------ */

const PRODUCTS: Record<PurchaseKind, { name: string; description: (config: BillingConfig) => string }> = {
  school_credit: {
    name: "WhyUs school credit",
    description: () => "Adds one school to any student's list. Credits never expire.",
  },
  unlimited: {
    name: "WhyUs unlimited schools",
    description: () => `Every school for one student, for ${PLAN_TERM_LABEL}.`,
  },
  counselor: {
    name: "WhyUs counselor plan",
    description: (config) => `Every school for up to ${config.counselorMaxStudents} students, for ${PLAN_TERM_LABEL}.`,
  },
};

export interface CheckoutParamsInput {
  user: { id: string; email: string };
  request: PurchaseRequest;
  /** Absolute origin for the success and cancel URLs, e.g. https://whyus.example. */
  origin: string;
  config: BillingConfig;
}

/** The Checkout Session for one purchase: payment mode, inline price, metadata. */
export function buildCheckoutParams({ user, request, origin, config }: CheckoutParamsInput): Stripe.Checkout.SessionCreateParams {
  const metadata: Record<string, string> = { userId: user.id, kind: request.kind, quantity: String(request.quantity) };
  if (request.kind === "unlimited" && request.studentId) metadata.studentId = request.studentId;
  const product = PRODUCTS[request.kind];
  return {
    mode: "payment",
    client_reference_id: user.id,
    customer_email: user.email,
    line_items: [
      {
        quantity: request.quantity,
        price_data: {
          currency: CURRENCY,
          unit_amount: unitPriceCents(request.kind, config),
          product_data: { name: product.name, description: product.description(config) },
        },
      },
    ],
    metadata,
    payment_intent_data: { metadata },
    success_url: `${origin}/app/settings?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/pricing`,
  };
}

/** Minimal surface of the Stripe client used here, so tests can pass a fake. */
export interface CheckoutClient {
  checkout: {
    sessions: {
      create(params: Stripe.Checkout.SessionCreateParams): Promise<{ id: string; url: string | null }>;
    };
  };
}

export async function createCheckoutSession(input: CheckoutParamsInput, client: CheckoutClient = getStripe()): Promise<{ id: string; url: string }> {
  const session = await client.checkout.sessions.create(buildCheckoutParams(input));
  if (!session.url) throw new Error("Stripe returned a Checkout Session without a URL");
  return { id: session.id, url: session.url };
}

/* ------------------------------------------------------------------ */
/* Fulfillment                                                         */
/* ------------------------------------------------------------------ */

export type SessionPurchase = { ok: true; purchase: NewPurchase } | { ok: false; reason: string };

/** Reads the purchase a paid Checkout Session stands for, from the metadata set at checkout. */
export function purchaseFromSession(session: Stripe.Checkout.Session, config: BillingConfig): SessionPurchase {
  if (session.mode !== "payment") return { ok: false, reason: "not a one-time payment" };
  const md = session.metadata ?? {};
  const userId = md.userId || session.client_reference_id;
  if (!userId) return { ok: false, reason: "no WhyUs account in the session metadata" };
  const kind = md.kind;
  if (!isPurchaseKind(kind)) return { ok: false, reason: "not a WhyUs purchase" };
  const quantity = Number(md.quantity ?? "1");
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_CREDITS_PER_PURCHASE) return { ok: false, reason: "invalid quantity" };
  const studentId = md.studentId?.trim() || null;
  if (kind === "unlimited" && !studentId) return { ok: false, reason: "unlimited purchase without a student" };
  const qty = kind === "school_credit" ? quantity : 1;
  return {
    ok: true,
    purchase: {
      userId,
      kind,
      quantity: qty,
      studentId: kind === "unlimited" ? studentId : null,
      amountCents: session.amount_total ?? unitPriceCents(kind, config) * qty,
      currency: session.currency ?? CURRENCY,
      stripeSessionId: session.id,
      status: "paid",
    },
  };
}

export type WebhookResult =
  | { action: "recorded"; purchaseId: string }
  | { action: "duplicate"; purchaseId: string }
  | { action: "refunded"; count: number }
  | { action: "ignored"; reason: string };

export interface WebhookDeps {
  config: BillingConfig;
  recordPurchase: (purchase: NewPurchase) => Promise<{ created: boolean; purchase: Pick<PurchaseRow, "id"> }>;
  userExists: (userId: string) => Promise<boolean>;
  markRefunded: (stripeSessionIds: string[]) => Promise<number>;
  /** Checkout Session ids for a PaymentIntent (used to match refunds to purchases). */
  sessionIdsForPaymentIntent: (paymentIntentId: string) => Promise<string[]>;
}

async function sessionIdsFromStripe(paymentIntentId: string): Promise<string[]> {
  if (!stripeConfigured()) {
    console.warn("[billing] refund received but STRIPE_SECRET_KEY is not set; cannot match it to a purchase");
    return [];
  }
  const list = await getStripe().checkout.sessions.list({ payment_intent: paymentIntentId, limit: 5 });
  return list.data.map((s) => s.id);
}

export function defaultWebhookDeps(config: BillingConfig): WebhookDeps {
  return { config, recordPurchase, userExists, markRefunded, sessionIdsForPaymentIntent: sessionIdsFromStripe };
}

async function fulfill(session: Stripe.Checkout.Session, deps: WebhookDeps): Promise<WebhookResult> {
  if (session.payment_status !== "paid") return { action: "ignored", reason: `payment status is ${session.payment_status}` };
  const parsed = purchaseFromSession(session, deps.config);
  if (!parsed.ok) return { action: "ignored", reason: parsed.reason };
  if (!(await deps.userExists(parsed.purchase.userId))) return { action: "ignored", reason: "the account no longer exists" };
  const { created, purchase } = await deps.recordPurchase(parsed.purchase);
  return created ? { action: "recorded", purchaseId: purchase.id } : { action: "duplicate", purchaseId: purchase.id };
}

/**
 * Applies one verified Stripe event. Safe to call any number of times for the
 * same event: purchases are keyed on the Checkout Session id.
 */
export async function handleStripeEvent(event: Stripe.Event, deps: WebhookDeps): Promise<WebhookResult> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      return fulfill(event.data.object, deps);
    case "charge.refunded": {
      const charge = event.data.object;
      if (!charge.refunded) return { action: "ignored", reason: "partial refund" };
      const pi = typeof charge.payment_intent === "string" ? charge.payment_intent : (charge.payment_intent?.id ?? null);
      if (!pi) return { action: "ignored", reason: "refund without a payment intent" };
      const ids = await deps.sessionIdsForPaymentIntent(pi);
      if (ids.length === 0) return { action: "ignored", reason: "no checkout session for this payment" };
      return { action: "refunded", count: await deps.markRefunded(ids) };
    }
    default:
      return { action: "ignored", reason: `event ${event.type} is not used` };
  }
}

/** Verifies the Stripe-Signature header against the raw request body. Throws when it does not match. */
export function verifyWebhookEvent(rawBody: string, signature: string, secret: string): Stripe.Event {
  return Stripe.webhooks.constructEvent(rawBody, signature, secret);
}

/* ------------------------------------------------------------------ */
/* Success page                                                        */
/* ------------------------------------------------------------------ */

export interface RetrieveClient {
  checkout: { sessions: { retrieve(id: string): Promise<Stripe.Checkout.Session> } };
}

export type SyncResult = { status: "recorded"; purchase: Pick<PurchaseRow, "id" | "kind" | "quantity"> } | { status: "pending" } | { status: "not_found" };

const SESSION_ID_RE = /^cs_[A-Za-z0-9_]{8,250}$/;

/**
 * Called when the buyer returns to Settings from Checkout: records the purchase
 * right away when the session is paid, so the plan does not wait for the webhook.
 * Only sessions created for this account are accepted.
 */
export async function syncCheckoutSession(
  userId: string,
  sessionId: string,
  config: BillingConfig,
  client: RetrieveClient = getStripe(),
): Promise<SyncResult> {
  if (!SESSION_ID_RE.test(sessionId)) return { status: "not_found" };
  let session: Stripe.Checkout.Session;
  try {
    session = await client.checkout.sessions.retrieve(sessionId);
  } catch {
    return { status: "not_found" };
  }
  const owner = session.metadata?.userId || session.client_reference_id;
  if (owner !== userId) return { status: "not_found" };
  if (session.payment_status !== "paid") return { status: "pending" };
  const parsed = purchaseFromSession(session, config);
  if (!parsed.ok) return { status: "not_found" };
  const { purchase } = await recordPurchase(parsed.purchase);
  return { status: "recorded", purchase: { id: purchase.id, kind: purchase.kind, quantity: purchase.quantity } };
}
